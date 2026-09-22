-- Read-only. Run as postgres against the VERIFIED development project.
select current_database() as database_name, current_user as operator,
  current_setting('server_version') as postgres_version;
select n.nspname as schema_name, c.relname as object_name, c.relrowsecurity
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('app_users','recipes','recipe_versions','recipe_steps','batch_requests','batch_runs','batch_run_steps')
order by c.relname;
select to_regclass('supabase_migrations.schema_migrations') is not null as has_migration_ledger,
  to_regnamespace('bar_private') is not null as has_private_schema;
-- Inspect the ledger separately if it exists:
-- select version, name from supabase_migrations.schema_migrations order by version;
-- If ANY tables exist, review their full definitions, policies, grants, and row
-- counts in the Dashboard. Do not interpret a 404 from PostgREST as proof of an
-- empty project. Partial tables or schema drift require a separate recovery plan.
