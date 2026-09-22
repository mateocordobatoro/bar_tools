import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(new URL('../supabase/migrations/002_secure_mvp.sql', import.meta.url), 'utf8');
const tables = ['app_users', 'recipes', 'recipe_versions', 'recipe_steps', 'batch_requests', 'batch_runs', 'batch_run_steps'];

test('every MVP table is RLS-enabled and the migration grants no direct API writes', () => {
  for (const table of tables) assert.ok(sql.includes(`alter table public.${table} enable row level security;`), table);
  const grants = [...sql.matchAll(/grant\s+([^;]+);/gi)].map(m => m[1]);
  for (const grant of grants) assert.doesNotMatch(grant, /\b(insert|update|delete|truncate|all)\b/i);
  assert.equal([...sql.matchAll(/create policy .*? for select to authenticated /g)].length, 7);
  assert.doesNotMatch(sql, /disable row level security/i);
});

test('all definer functions fix search_path and public mutators check a database actor', () => {
  const definitions = [...sql.matchAll(/create function ([\w.]+)\([^]*?as \$\$([^]*?)\$\$;/g)];
  assert.ok(definitions.length >= 10);
  for (const [definition, name, body] of definitions) {
    if (/security definer/.test(definition)) assert.match(definition, /set search_path = ''/);
    if (name.startsWith('public.')) {
      assert.match(body, /bar_private\.actor\('(management|bartender)'\)/);
      const revocations = [...sql.matchAll(/revoke all on function ([^;]+) from public, anon, authenticated, service_role;/g)];
      assert.ok(revocations.some(m => m[1].includes(`${name}(`)), `${name} must revoke default execution`);
    }
  }
  assert.match(sql, /revoke all on all functions in schema bar_private from public, anon, authenticated, service_role/);
});

test('bootstrap cannot be called through the public API and PIN hashes are removed', () => {
  assert.match(sql, /alter table public.app_users drop column pin_hash/);
  assert.match(sql, /auth_user_id uuid not null unique references auth.users\(id\) on delete restrict/);
  assert.match(sql, /grant execute on function bar_private.bootstrap_management\(uuid, text\) to postgres/);
  assert.doesNotMatch(sql, /grant execute on function bar_private.bootstrap_management[^;]+to (anon|authenticated|service_role)/);
});

test('run references constrain both exact version and step membership', () => {
  assert.match(sql, /foreign key \(request_id, recipe_version_id, output_unit\)/);
  assert.match(sql, /foreign key \(batch_run_id, recipe_version_id\)/);
  assert.match(sql, /foreign key \(recipe_step_id, recipe_version_id\)/);
  assert.match(sql, /create trigger immutable_version/);
  assert.match(sql, /create trigger immutable_definition/);
  assert.match(sql, /create trigger immutable_run_identity/);
});

test('behavioral suite is rollback-only with an empty-Auth guard', () => {
  const tests = readFileSync(new URL('../supabase/tests/002_secure_mvp.sql', import.meta.url), 'utf8');
  assert.match(tests, /^begin;/m);
  assert.match(tests, /^rollback;/m);
  assert.doesNotMatch(tests, /^commit;/mi);
  assert.match(tests, /Tests require an isolated database with no Auth users or staff/);
});
