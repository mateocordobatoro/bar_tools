import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

// Only called by the disposable Unix-socket harness, never a hosted connection.
export async function testAtomicity(observer, connect, { psqlPath, socket, env, work, first, second }) {
  assert.ok(socket.startsWith('/tmp/bar-tools-pg-') && socket.endsWith('/socket'));
  const one = fileURLToPath(new URL('../supabase/migrations/001_init.sql', import.meta.url));
  const two = fileURLToPath(new URL('../supabase/migrations/002_secure_mvp.sql', import.meta.url));
  const snapshot = async () => (await observer.query(`select jsonb_build_object(
    'relations', (select coalesce(jsonb_agg(c.relname order by c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','bar_private')),
    'types', (select coalesce(jsonb_agg(t.typname order by t.typname),'[]') from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','bar_private')),
    'functions', (select coalesce(jsonb_agg(p.proname order by p.proname),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','bar_private')),
    'private', to_regnamespace('bar_private') is not null,
    'extensions', (select jsonb_agg(extname order by extname) from pg_extension),
    'defaults', (select jsonb_agg(to_jsonb(d) order by oid) from pg_default_acl d),
    'users', (select count(*) from auth.users)) as state`)).rows[0].state;
  const baseline = await snapshot();
  const failureFile = join(work, 'intentional-error.sql');
  await writeFile(failureFile, 'select 1/0;\n');
  const psql = args => spawnSync(psqlPath, [
    '-X', '-h', socket, '-p', '5432', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '--single-transaction',
    '-c', "SET LOCAL search_path = public, pg_catalog; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s'",
    ...args,
  ], { env, encoding:'utf8', timeout:30000, maxBuffer:4*1024*1024 });
  for (const [label,args,expected] of [
    ['SQL file error after 001', ['-f',one,'-f',failureFile,'-f',two],3],
    ['SQL file error after 002 before COMMIT', ['-f',one,'-f',two,'-f',failureFile],3],
    ['SQL command error after 001', ['-f',one,'-c','select 1/0','-f',two],1],
    ['Missing second input file', ['-f',one,'-f',join(work,'intentionally-missing.sql')],1],
  ]) {
    const result=psql(args);
    if (result.error) throw new Error(`Local psql could not run: ${result.error.code}. Install psql or set BARTOOLS_PSQL to its executable path.`);
    assert.equal(result.status,expected,`${label}: ${result.stderr}`);
    assert.deepEqual(await snapshot(),baseline,`${label}: partial catalog persisted`);
    console.log(`PASS atomicity: ${label}; original catalog preserved.`);
  }
  const writer=await connect();
  try {
    await writer.query('BEGIN; SET LOCAL search_path = public, pg_catalog');
    await writer.query(first);
    await writer.query(second);
    assert.deepEqual(await snapshot(),baseline,'Uncommitted schema visible to another connection');
  } finally { await writer.end(); }
  assert.deepEqual(await snapshot(),baseline,'Disconnect before COMMIT left catalog changes');
  console.log('PASS atomicity: uncommitted schema hidden; disconnect before COMMIT rolls back.');
  const success=psql(['-f',one,'-f',two]);
  if (success.error) throw new Error(`Local psql could not run: ${success.error.code}`);
  assert.equal(success.status,0,'psql atomic success path failed');
  assert.equal((await observer.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows[0].n,7);
  console.log('PASS atomicity: psql success commits all seven MVP tables.');
}
