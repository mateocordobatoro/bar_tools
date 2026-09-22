import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { testConcurrency } from './database-concurrency.mjs';
import { testAtomicity } from './database-atomicity.mjs';

// Never load .env.local, DATABASE_URL, Supabase credentials, or a remote target.
const runtime = process.env.BARTOOLS_PG_RUNTIME;
if (!runtime) throw new Error('Set BARTOOLS_PG_RUNTIME to a temporary npm directory containing PostgreSQL binaries and pg.');
const requireRuntime = createRequire(join(resolve(runtime), 'package.json'));
const { Client } = requireRuntime('pg');
const binaryPackage = `@embedded-postgres/${process.platform}-${process.arch}`;
const binary = requireRuntime.resolve(`${binaryPackage}`);
const bin = resolve(binary, '../../native/bin');
const work = await mkdtemp('/tmp/bar-tools-pg-');
const data = join(work, 'data');
const socket = join(work, 'socket');
await mkdir(socket, { mode: 0o700 });
const processEnv = { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' };
let started = false;
let client;
function run(executable, args) {
  const result = spawnSync(join(bin, executable), args, { env: processEnv, encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(`${executable} failed: ${result.stderr || result.error || result.stdout}`);
}
const connect = async () => {
  const c = new Client({ host: socket, port: 5432, user: 'postgres', database: 'postgres', password: '', ssl: false, options: '-c statement_timeout=10000 -c lock_timeout=8000' });
  await c.connect();
  return c;
};
const file = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
async function runPsqlFixture(c, source) {
  // The checked-in suite uses only \gset and \echo. Reject other metacommands;
  // execute each \gset block and bind its final row as escaped SQL literals.
  const vars = {};
  const chunks = source.replace(/^\\echo.*$/gm, '').split(/\\gset\s*\n/);
  let assertions = 0;
  for (let i = 0; i < chunks.length; i++) {
    let sql = chunks[i];
    assert.doesNotMatch(sql, /^\s*\\/m, 'unsupported psql command');
    sql = sql.replace(/:'(\w+)'/g, (_, key) => {
      assert.ok(Object.hasOwn(vars, key), `unknown fixture variable ${key}`);
      return `'${String(vars[key]).replaceAll("'", "''")}'`;
    });
    if (!sql.trim()) continue;
    try {
      const result = await c.query(sql);
      const results = Array.isArray(result) ? result : [result];
      assertions += results.reduce((n, r) => n + (r.fields.some(f => ['assert_true', 'expect_error'].includes(f.name)) ? r.rowCount : 0), 0);
      if (i < chunks.length - 1) {
        const rows = results.at(-1).rows;
        assert.equal(rows.length, 1, 'gset requires exactly one row');
        Object.assign(vars, rows[0]);
      }
    } catch (error) {
      throw new Error(`Fixture block ${i + 1} failed (${error.code ?? 'assertion'}): ${error.message}`);
    }
  }
  return assertions;
}
try {
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', join(work, 'postgres.log'), '-o', `-h '' -k ${socket}`, '-w', 'start']);
  started = true;
  client = await connect();
  console.log(`Disposable engine: ${(await client.query('show server_version')).rows[0].server_version}; Unix socket only.`);
  await client.query(await file('supabase/test-support/local-auth-contract.sql'));
  await testAtomicity(client, connect, { psqlPath: process.env.BARTOOLS_PSQL || 'psql', socket, env: processEnv, work,
    first: await file('supabase/migrations/001_init.sql'),
    second: await file('supabase/migrations/002_secure_mvp.sql') });
  const verification = await client.query(await file('supabase/operations/verify_foundation.sql'));
  const tables = verification[0].rows;
  assert.equal(tables.length, 7);
  for (const t of tables) {
    assert.equal(t.relrowsecurity, true, `${t.relname}: RLS`);
    assert.equal(t.anon_read, false, `${t.relname}: anon`);
    assert.equal(t.authenticated_read, true, `${t.relname}: read`);
    assert.equal(t.authenticated_write, false, `${t.relname}: direct writes`);
    assert.equal(t.service_role_access, false, `${t.relname}: service role`);
  }
  assert.equal(verification[1].rows.length, 7);
  assert.equal(verification[2].rows[0].has_pin_hash, false);
  for (const f of verification[3].rows) {
    assert.equal(f.anon_execute, false, f.proname);
    assert.equal(f.service_execute, false, f.proname);
    const callable = ['staff_role','approve_recipe_version','create_batch_request','start_batch_run','set_batch_step','finish_batch_run'];
    assert.equal(f.authenticated_execute, callable.includes(f.proname), f.proname);
  }
  console.log('Catalog verification passed: RLS, grants, function access, and absence of PIN hashes.');
  const assertions = await runPsqlFixture(client, await file('supabase/tests/002_secure_mvp.sql'));
  assert.equal((await client.query('select count(*)::int as n from auth.users')).rows[0].n, 0);
  assert.equal((await client.query('select count(*)::int as n from public.app_users')).rows[0].n, 0);
  console.log(`${assertions} behavioral assertions passed; synthetic fixtures rolled back.`);
  await testConcurrency(client, connect, await file('supabase/tests/002_secure_mvp.sql'));
  console.log('All disposable database checks passed.');
} finally {
  await client?.end().catch(() => {});
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  await rm(work, { recursive: true, force: true });
  console.log('Temporary database stopped and removed. No remote connections used.');
}
