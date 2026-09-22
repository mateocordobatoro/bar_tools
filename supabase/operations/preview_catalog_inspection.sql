-- Step 24: READ ONLY catalog inspection. No DDL, DML, dynamic SQL or user rows.
-- Verify the Preview project reference in the Dashboard before running.
-- A missing ledger is reported, never created. This is NOT a migration.
with inspection as (
  select '01_session' as section, jsonb_build_object(
    'database', current_database(), 'operator', current_user,
    'postgres', current_setting('server_version'),
    'search_path', current_setting('search_path')) as detail
  union all select '02_schemas', jsonb_agg(jsonb_build_object(
    'name', nspname, 'owner', pg_get_userbyid(nspowner), 'acl', nspacl::text) order by nspname)
    from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'
  union all select '03_public_relations', coalesce(jsonb_agg(jsonb_build_object(
    'name', c.relname, 'kind', c.relkind, 'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity, 'acl', c.relacl::text)), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
  union all select '04_public_types', coalesce(jsonb_agg(jsonb_build_object(
    'name', t.typname, 'kind', t.typtype)), '[]'::jsonb)
    from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'
  union all select '05_public_routines', coalesce(jsonb_agg(jsonb_build_object(
    'name', p.proname, 'arguments', pg_get_function_identity_arguments(p.oid),
    'owner', pg_get_userbyid(p.proowner), 'definer', p.prosecdef, 'acl', p.proacl::text)), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  union all select '06_public_policies', coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    from pg_policies p where schemaname='public'
  union all select '07_migration_objects', jsonb_build_object(
    'private_schema', to_regnamespace('bar_private') is not null,
    'ledger_schema', to_regnamespace('supabase_migrations') is not null,
    'ledger_table', to_regclass('supabase_migrations.schema_migrations') is not null)
  union all select '08_default_privileges', coalesce(jsonb_agg(jsonb_build_object(
    'owner', pg_get_userbyid(d.defaclrole), 'schema', coalesce(n.nspname,'ALL'),
    'object_type', d.defaclobjtype, 'acl', d.defaclacl::text)), '[]'::jsonb)
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    where d.defaclnamespace=0 or n.nspname in ('public','bar_private')
  union all select '09_required_roles', jsonb_agg(jsonb_build_object(
    'name', rolname, 'superuser', rolsuper, 'bypass_rls', rolbypassrls,
    'public_usage', has_schema_privilege(oid,'public','USAGE'),
    'public_create', has_schema_privilege(oid,'public','CREATE')) order by rolname)
    from pg_roles where rolname in ('postgres','anon','authenticated','service_role')
  union all select '10_extensions', jsonb_agg(jsonb_build_object(
    'name', e.extname, 'version', e.extversion, 'schema', n.nspname) order by e.extname)
    from pg_extension e join pg_namespace n on n.oid=e.extnamespace
  union all select '11_dependencies', jsonb_build_object(
    'auth_users', to_regclass('auth.users') is not null,
    'auth_uid', to_regprocedure('auth.uid()') is not null,
    'uuid_generator', to_regprocedure('gen_random_uuid()') is not null,
    'can_create_schema', has_database_privilege(current_user,current_database(),'CREATE'))
  union all select '12_auth_columns', jsonb_agg(jsonb_build_object(
    'name', column_name, 'type', data_type, 'nullable', is_nullable) order by ordinal_position)
    from information_schema.columns where table_schema='auth' and table_name='users'
      and column_name in ('id','email_confirmed_at','phone_confirmed_at','is_anonymous','confirmed_at')
  union all select '13_auth_user_count', to_jsonb(count(*)) from auth.users
  union all select '14_event_triggers', jsonb_agg(jsonb_build_object(
    'name', evtname, 'owner', pg_get_userbyid(evtowner), 'enabled', evtenabled,
    'event', evtevent) order by evtname) from pg_event_trigger
)
select section, detail from inspection order by section;

-- Separate read-only follow-up: effective operator prerequisites.
select current_user as operator,
 has_schema_privilege(current_user,'auth','USAGE') as auth_schema_usage,
 has_table_privilege(current_user,'auth.users','SELECT') as auth_users_select,
 has_column_privilege(current_user,'auth.users','id','REFERENCES') as auth_id_references,
 has_function_privilege(current_user,'auth.uid()','EXECUTE') as auth_uid_execute,
 has_schema_privilege(current_user,'public','CREATE') as public_create,
 has_database_privilege(current_user,current_database(),'CREATE') as schema_create;
