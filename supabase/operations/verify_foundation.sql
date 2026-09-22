-- Read-only deployment verification. No row data or credentials are returned.
select c.relname, c.relrowsecurity,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_read,
  has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') as authenticated_write,
  has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as service_role_access
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('app_users','recipes','recipe_versions','recipe_steps','batch_requests','batch_runs','batch_run_steps')
order by c.relname;
-- Expect seven rows: true, false, true, false, false respectively.
select tablename, policyname, roles, cmd from pg_catalog.pg_policies
where schemaname = 'public' and tablename in
  ('app_users','recipes','recipe_versions','recipe_steps','batch_requests','batch_runs','batch_run_steps')
order by tablename;
-- Expect seven SELECT policies, all addressed only to authenticated.
select exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'app_users' and column_name = 'pin_hash') as has_pin_hash;
-- Expect false.
select p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'bar_private') or (n.nspname = 'public' and p.proname in
  ('approve_recipe_version','create_batch_request','start_batch_run','set_batch_step','finish_batch_run'))
order by n.nspname, p.proname;
-- Every function has search_path="". No anon/service EXECUTE. Authenticated can
-- execute only the five public RPCs and bar_private.staff_role().
