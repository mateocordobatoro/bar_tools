import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServerClient } from '@supabase/ssr';

// Deliberately ignores .env.local and accepts no remote URL or API credential.
const workdir = resolve(process.env.BARTOOLS_STACK_WORKDIR ?? '/tmp/bar-tools-supabase-fullstack');
if (!workdir.startsWith('/tmp/bar-tools-supabase-')) throw new Error('A dedicated /tmp/bar-tools-supabase-* project is required.');
const dockerHost = process.env.DOCKER_HOST;
if (!dockerHost?.startsWith('unix://')) throw new Error('An explicit local Docker Unix socket is required.');
const env = { PATH: process.env.PATH, DOCKER_HOST: dockerHost, SUPABASE_TELEMETRY_DISABLED: '1' };
class SafeTestError extends Error {}
let stage = 'initialization';
let checks = 0;
const check = (condition, label) => {
  if (!condition) throw new SafeTestError(label);
  checks++;
};
const cmd = (name, args, input) => {
  const result = spawnSync(name, args, { env, input, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new SafeTestError(`${name} command failed (output withheld)`);
  return result.stdout;
};
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const phase = (label) => { stage = label; console.log(`Testing: ${label}`); };
try {
  const config = await readFile(`${workdir}/supabase/config.toml`, 'utf8');
  const project = config.match(/^project_id\s*=\s*"([a-z0-9-]+)"/m)?.[1];
  check(project?.startsWith('bar-tools-supabase-'), 'Unexpected local project ID');
  const status = JSON.parse(cmd('supabase', ['status', '--workdir', workdir, '-o', 'json']));
  const url = new URL(status.API_URL);
  check(url.protocol === 'http:' && url.hostname === '127.0.0.1', 'Only loopback API connections allowed');
  const publishable = status.PUBLISHABLE_KEY;
  const adminKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  check(publishable?.startsWith('sb_publishable_') && !!adminKey, 'Local publishable/admin keys unavailable');
  const dbContainer = `supabase_db_${project}`;
  const sql = (source) => cmd('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], source);
  const request = async (path, { token, admin = false, key = publishable, method = 'GET', body, headers = {} } = {}) => {
    check(path.startsWith('/') && !path.startsWith('//'), 'Relative API path required');
    const response = await fetch(new URL(path, url), {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { apikey: admin ? adminKey : key, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(admin && !adminKey.startsWith('sb_secret_') ? { Authorization: `Bearer ${adminKey}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => null) };
  };
  const ok = (r, label) => { check(r.status >= 200 && r.status < 300, `${label} failed (HTTP ${r.status})`); return r.data; };
  const rpc = async (name, token, body) => request(`/rest/v1/rpc/${name}`, { token, method: 'POST', body });
  const denied = (r, label) => check([401, 403].includes(r.status), `${label} was not denied (HTTP ${r.status})`);

  phase('real Supabase catalog and atomic migration');
  check(sql("select count(*) from auth.users;").trim() === '0', 'Disposable project must have no Auth users');
  check(sql("select to_regclass('public.app_users') is null;").trim() === 't', 'Disposable project must have no MVP tables');
  const m1 = await readFile(new URL('../supabase/migrations/001_init.sql', import.meta.url), 'utf8');
  const m2 = await readFile(new URL('../supabase/migrations/002_secure_mvp.sql', import.meta.url), 'utf8');
  sql(`BEGIN; SET LOCAL search_path = public, pg_catalog;\n${m1}\n${m2}\nCOMMIT;`);
  check(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('app_users','recipes','recipe_versions','recipe_steps','batch_requests','batch_runs','batch_run_steps') and c.relrowsecurity;").trim() === '7', 'Seven RLS tables expected');
  // Wait for PostgREST's schema cache refresh without printing error bodies.
  for (let i = 0; i < 30; i++) {
    const result = await request('/rest/v1/app_users?select=id');
    if ([401, 403].includes(result.status)) break;
    if (i === 29) throw new SafeTestError('PostgREST schema refresh did not complete');
    await delay(500);
  }

  phase('public-key gateway, disabled signup, and real Auth users');
  ok(await request('/auth/v1/settings'), 'Auth settings');
  denied(await request('/rest/v1/app_users?select=id', { key: `sb_publishable_${randomUUID()}` }), 'Invalid publishable key');
  const signup = await request('/auth/v1/signup', { method: 'POST', body: { email: 'blocked@example.invalid', password: randomUUID() } });
  check(signup.status >= 400 && signup.status < 500, 'Public signup must be disabled');
  const password = `Test-${randomUUID()}-aA1!`;
  const users = {};
  const sessions = {};
  for (const role of ['manager', 'bar1', 'bar2', 'inactive', 'unprovisioned']) {
    const email = `${role}-${randomUUID()}@example.invalid`;
    users[role] = ok(await request('/auth/v1/admin/users', { admin: true, method: 'POST', body: { email, password, email_confirm: true } }), 'Synthetic Auth creation');
    users[role].testEmail = email;
    sessions[role] = ok(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }), 'Password sign-in');
    check(!!sessions[role].access_token && !!sessions[role].refresh_token, 'Auth session tokens required');
    check(ok(await request('/auth/v1/user', { token: sessions[role].access_token }), 'Verified Auth user').id === users[role].id, 'Auth identity mismatch');
  }
  const token = (role) => sessions[role].access_token;
  sql(`BEGIN;
    select bar_private.bootstrap_management(${literal(users.manager.id)}::uuid,'Synthetic manager');
    insert into public.app_users(auth_user_id,display_name,role,active) values
      (${literal(users.bar1.id)},'Synthetic bar 1','bartender',true),
      (${literal(users.bar2.id)},'Synthetic bar 2','bartender',true),
      (${literal(users.inactive.id)},'Synthetic inactive','bartender',false);
    COMMIT;`);

  phase('JWT verification, profile RLS, and forbidden direct writes');
  const keyWithJwt = await request('/rest/v1/app_users?select=id', { token: token('manager'), key: `sb_publishable_${randomUUID()}` });
  if (keyWithJwt.status === 200) {
    check(Array.isArray(keyWithJwt.data) && keyWithJwt.data.length === 4, 'Local gateway must still use the valid JWT identity');
    console.log('OBSERVATION: local gateway accepts a valid JWT despite an invalid publishable key; key enforcement is not equivalent to hosted gateway validation.');
  } else denied(keyWithJwt, 'Invalid key with JWT');
  denied(await request('/rest/v1/app_users?select=id'), 'Anonymous table read');
  const forged = token('bar1').split('.');
  const claims = JSON.parse(Buffer.from(forged[1], 'base64url').toString('utf8'));
  forged[1] = Buffer.from(JSON.stringify({ ...claims, sub: users.manager.id, role: 'service_role' })).toString('base64url');
  denied(await request('/rest/v1/app_users?select=id', { token: forged.join('.') }), 'Forged JWT claims');
  const profiles = ok(await request('/rest/v1/app_users?select=id,auth_user_id,role', { token: token('bar1') }), 'Bartender profile');
  check(profiles.length === 1 && profiles[0].auth_user_id === users.bar1.id, 'Bartender must see only own profile');
  check(ok(await request('/rest/v1/app_users?select=id', { token: token('manager') }), 'Management profiles').length === 4, 'Management must see provisioned staff');
  for (const role of ['inactive','unprovisioned']) {
    check(ok(await request('/rest/v1/app_users?select=id', { token: token(role) }), 'Excluded identity read').length === 0, 'Excluded identity saw a profile');
  }
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    denied(await request(`/rest/v1/app_users${method === 'POST' ? '' : `?id=eq.${profiles[0].id}`}`, { token: token('bar1'), method, ...(method === 'DELETE' ? {} : { body: { role: 'management' } }) }), `Direct ${method}`);
  }
  const privateSchema = await request('/rest/v1/audit_events?select=id', { token: token('manager'), headers: { 'Accept-Profile': 'bar_private' } });
  check(privateSchema.status === 406, 'Private audit schema must not be exposed');
  const privateBootstrap = await rpc('bootstrap_management', token('manager'), { p_auth_user: users.bar1.id, p_display_name: 'Forbidden' });
  check(privateBootstrap.status === 404, 'Bootstrap must not be exposed as a public RPC');

  phase('approved recipe versions and HTTP workflow');
  const recipe = randomUUID(), version = randomUUID();
  sql(`BEGIN;
    insert into public.recipes(id,name) values (${literal(recipe)},'Synthetic stack recipe');
    insert into public.recipe_versions(id,recipe_id,version_number,expected_output_qty,expected_output_unit)
      values (${literal(version)},${literal(recipe)},1,3,'L');
    insert into public.recipe_steps(recipe_version_id,step_order,name,makes_ready)
      values (${literal(version)},1,'Mix',false),(${literal(version)},2,'Finish',true);
    COMMIT;`);
  check(ok(await request('/rest/v1/recipe_versions?select=id', { token: token('bar1') }), 'Draft visibility').length === 0, 'Bartender saw draft recipe');
  denied(await rpc('approve_recipe_version', token('bar1'), { p_version: version }), 'Bartender approval');
  ok(await rpc('approve_recipe_version', token('manager'), { p_version: version }), 'Management approval');
  check(ok(await request('/rest/v1/recipe_versions?select=id', { token: token('bar1') }), 'Approved visibility').length === 1, 'Approved version hidden');
  denied(await request(`/rest/v1/recipe_versions?id=eq.${version}`, { token: token('manager'), method: 'PATCH', body: { expected_output_qty: 99 } }), 'Recipe rewrite');
  const requestBody = { p_version: version, p_qty: 1, p_unit: 'batch', p_operation_key: randomUUID() };
  denied(await rpc('create_batch_request', token('bar1'), requestBody), 'Bartender request creation');
  ok(await request('/auth/v1/user', { token: token('bar1'), method: 'PUT', body: { data: { role: 'management', active: true } } }), 'User metadata update');
  sessions.bar1 = ok(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: sessions.bar1.refresh_token } }), 'Session refresh');
  denied(await rpc('create_batch_request', token('bar1'), requestBody), 'Metadata role escalation');
  const invalidQty = await rpc('create_batch_request', token('manager'), { ...requestBody, p_qty: -1 });
  check(invalidQty.status === 400, 'Negative quantity accepted');
  const batchRequest = ok(await rpc('create_batch_request', token('manager'), requestBody), 'Request creation');
  check(ok(await rpc('create_batch_request', token('manager'), requestBody), 'Request retry') === batchRequest, 'HTTP retry duplicated request');
  const runBody = { ...requestBody, p_operation_key: randomUUID(), p_request: batchRequest };
  denied(await rpc('start_batch_run', token('manager'), runBody), 'Manager bartender operation');
  for (const role of ['inactive','unprovisioned']) denied(await rpc('start_batch_run', token(role), runBody), 'Excluded identity write');
  const run = ok(await rpc('start_batch_run', token('bar1'), runBody), 'Start run');
  check(ok(await rpc('start_batch_run', token('bar1'), runBody), 'Run retry') === run, 'HTTP retry duplicated run');
  const steps = ok(await request(`/rest/v1/batch_run_steps?batch_run_id=eq.${run}&select=id,recipe_version_id&order=id`, { token: token('bar1') }), 'Run steps');
  check(steps.length === 2 && steps.every(s => s.recipe_version_id === version), 'Run snapshot/version mismatch');
  check((await rpc('finish_batch_run', token('bar1'), { p_run: run, p_actual_qty: 3 })).status === 400, 'Unfinished run accepted');
  ok(await rpc('set_batch_step', token('bar1'), { p_run: run, p_step: steps[0].id, p_status: 'DONE' }), 'Complete step');
  ok(await rpc('set_batch_step', token('bar1'), { p_run: run, p_step: steps[1].id, p_status: 'BLOCKED', p_reason: 'Synthetic blocker' }), 'Block step');
  ok(await rpc('set_batch_step', token('bar2'), { p_run: run, p_step: steps[1].id, p_status: 'PENDING' }), 'Resume by another bartender');
  ok(await rpc('set_batch_step', token('bar2'), { p_run: run, p_step: steps[1].id, p_status: 'DONE' }), 'Complete resumed step');
  ok(await rpc('finish_batch_run', token('bar2'), { p_run: run, p_actual_qty: 3 }), 'Finish run');
  const finished = ok(await request(`/rest/v1/batch_runs?id=eq.${run}&select=status,recipe_version_id,completed_by`, { token: token('manager') }), 'Finished run')[0];
  check(finished.status === 'READY' && finished.recipe_version_id === version, 'Finished state/version mismatch');
  const actor = sql(`select id from public.app_users where auth_user_id=${literal(users.bar2.id)};`).trim();
  check(finished.completed_by === actor, 'Server-derived actor mismatch');
  check(ok(await request(`/rest/v1/batch_requests?id=eq.${batchRequest}&select=status`, { token: token('manager') }), 'Request fulfillment')[0].status === 'READY', 'Request not fulfilled');

  phase('SSR cookie adapter, sign-out, and live profile deactivation');
  const jar = new Map();
  const cookies = { getAll: () => [...jar].map(([name,value]) => ({ name,value })), setAll: values => { for (const {name,value} of values) jar.set(name,value); } };
  const ssr1 = createServerClient(url.origin, publishable, { cookies });
  const login = await ssr1.auth.signInWithPassword({ email: users.manager.testEmail, password });
  check(!login.error && jar.size > 0, 'SSR login did not persist cookies');
  const ssr2 = createServerClient(url.origin, publishable, { cookies });
  const verified = await ssr2.auth.getUser();
  check(!verified.error && verified.data.user?.id === users.manager.id, 'New SSR client could not verify cookie session');
  check(!(await ssr2.auth.signOut({ scope: 'local' })).error, 'SSR sign-out failed');
  sql(`update public.app_users set active=false where auth_user_id=${literal(users.bar1.id)};`);
  // Existing, genuinely signed JWT remains valid, while current DB profile denies access.
  ok(await request('/auth/v1/user', { token: token('bar1') }), 'Auth identity after staff deactivation');
  check(ok(await request('/rest/v1/batch_runs?select=id', { token: token('bar1') }), 'Deactivated read').length === 0, 'Deactivated staff saw business data');
  denied(await rpc('start_batch_run', token('bar1'), { ...runBody, p_operation_key: randomUUID(), p_request: null }), 'Deactivated write');
  ok(await request('/auth/v1/logout?scope=local', { token: token('bar1'), method: 'POST' }), 'Session logout');
  const revokedRefresh = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: sessions.bar1.refresh_token } });
  check(revokedRefresh.status >= 400 && revokedRefresh.status < 500, 'Signed-out refresh token remained usable');
  console.log(`PASS: ${checks} stack assertions/checks. Tokens, keys, response bodies, and passwords withheld.`);
} catch (error) {
  // All deliberately thrown labels are static; SDK/database raw errors are not printed.
  console.error(`FAIL during: ${stage}.`);
  console.error(error instanceof SafeTestError ? error.message : 'Unexpected failure; raw details withheld.');
  process.exitCode = 1;
}
