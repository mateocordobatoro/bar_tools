-- FUTURE execution only: isolated Supabase TEST database, after both migrations.
-- Do not run against the existing development/production project or before approval.
-- Self-contained behavioral assertions, no pgTAP installation required.
-- psql -X -v ON_ERROR_STOP=1 "service=bar_tools_test" -f supabase/tests/002_secure_mvp.sql
begin;
set local search_path = public, pg_catalog;

-- Abort rather than mix fixtures with any actual identities/data.
do $$ begin
  if exists(select 1 from auth.users) or exists(select 1 from public.app_users) then
    raise exception 'Tests require an isolated database with no Auth users or staff';
  end if;
end $$;

create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %', label; end if;
end $$;
create function pg_temp.expect_error(statement text, expected_state text) returns void
language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate <> expected_state then raise exception 'Expected SQLSTATE %, got %', expected_state, sqlstate; end if;
    return;
  end;
  raise exception 'Expected SQLSTATE %, statement succeeded', expected_state;
end $$;

-- Synthetic Auth rows only, never passwords, identities, or real staff.
insert into auth.users(id, email, email_confirmed_at, is_anonymous) values
 ('10000000-0000-0000-0000-000000000001', 'manager@example.invalid', now(), false),
 ('10000000-0000-0000-0000-000000000002', 'bar1@example.invalid', now(), false),
 ('10000000-0000-0000-0000-000000000003', 'bar2@example.invalid', now(), false),
 ('10000000-0000-0000-0000-000000000004', 'inactive@example.invalid', now(), false),
 ('10000000-0000-0000-0000-000000000005', 'unprovisioned@example.invalid', now(), false);
select bar_private.bootstrap_management('10000000-0000-0000-0000-000000000001', 'Test manager');
select pg_temp.expect_error($q$select bar_private.bootstrap_management('10000000-0000-0000-0000-000000000002', 'Other')$q$, '23514');
insert into public.app_users(auth_user_id, display_name, role, active) values
 ('10000000-0000-0000-0000-000000000002', 'Test bar 1', 'bartender', true),
 ('10000000-0000-0000-0000-000000000003', 'Test bar 2', 'bartender', true),
 ('10000000-0000-0000-0000-000000000004', 'Test inactive', 'bartender', false);
insert into public.recipes(id, name) values ('20000000-0000-0000-0000-000000000001', 'Synthetic recipe');
insert into public.recipe_versions(id, recipe_id, version_number, expected_output_qty, expected_output_unit) values
 ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 3, 'L'),
 ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 2, 6, 'bottle');
insert into public.recipe_steps(id, recipe_version_id, step_order, name, makes_ready) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,'Mix',false),
 ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',2,'Finish',true),
 ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002',1,'Bottle',true);

-- Table grants and RPC access fail closed for anon.
set local role anon;
select pg_temp.expect_error('select * from public.recipes', '42501');
select pg_temp.expect_error($q$select public.approve_recipe_version('30000000-0000-0000-0000-000000000001')$q$, '42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select pg_temp.assert_true((select count(*) = 0 from public.app_users), 'unprovisioned profile hidden');
select pg_temp.assert_true((select count(*) = 0 from public.recipe_versions), 'unprovisioned recipes hidden');
select pg_temp.expect_error($q$select public.approve_recipe_version('30000000-0000-0000-0000-000000000001')$q$, '42501');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select pg_temp.assert_true((select count(*) = 0 from public.app_users), 'inactive profile hidden');
select pg_temp.expect_error($q$select public.start_batch_run('30000000-0000-0000-0000-000000000001',1,'batch',gen_random_uuid())$q$, '42501');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*) = 1 from public.app_users), 'bartender sees own profile only');
select pg_temp.assert_true((select count(*) = 0 from public.recipe_versions), 'drafts hidden from bartender');
select pg_temp.expect_error($q$update public.app_users set role='management'$q$, '42501');
select pg_temp.expect_error($q$select public.approve_recipe_version('30000000-0000-0000-0000-000000000001')$q$, '42501');
select pg_temp.expect_error($q$select public.create_batch_request('30000000-0000-0000-0000-000000000001',1,'batch',gen_random_uuid())$q$, '42501');
select pg_temp.expect_error($q$select public.start_batch_run('30000000-0000-0000-0000-000000000001',1,'batch',gen_random_uuid())$q$, '23514');
select pg_temp.expect_error($q$select bar_private.bootstrap_management('10000000-0000-0000-0000-000000000002','No')$q$, '42501');
select pg_temp.expect_error('select * from bar_private.audit_events', '42501');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((select count(*) = 4 from public.app_users), 'management reads staff');
select public.approve_recipe_version('30000000-0000-0000-0000-000000000001');
select public.approve_recipe_version('30000000-0000-0000-0000-000000000002');
select pg_temp.expect_error($q$select public.start_batch_run('30000000-0000-0000-0000-000000000001',1,'batch',gen_random_uuid())$q$, '42501');
select pg_temp.expect_error($q$select public.create_batch_request('30000000-0000-0000-0000-000000000001',0,'L',gen_random_uuid())$q$, '22023');
select pg_temp.expect_error($q$select public.create_batch_request('30000000-0000-0000-0000-000000000001','NaN','L',gen_random_uuid())$q$, '22023');
select pg_temp.expect_error($q$select public.create_batch_request('30000000-0000-0000-0000-000000000001','Infinity','L',gen_random_uuid())$q$, '22023');
select pg_temp.expect_error($q$select public.create_batch_request('30000000-0000-0000-0000-000000000001',1,'ml',gen_random_uuid())$q$, '22023');
select pg_temp.expect_error($q$select public.create_batch_request('30000000-0000-0000-0000-000000000002',1.5,'bottle',gen_random_uuid())$q$, '22023');
select public.create_batch_request('30000000-0000-0000-0000-000000000001',2,'batch','50000000-0000-0000-0000-000000000001') as request_id \gset
select pg_temp.assert_true(public.create_batch_request('30000000-0000-0000-0000-000000000001',2,'batch','50000000-0000-0000-0000-000000000001') = :'request_id'::uuid, 'request retry idempotent');
select pg_temp.expect_error($q$select public.create_batch_request('30000000-0000-0000-0000-000000000001',1,'batch','50000000-0000-0000-0000-000000000001')$q$, '22023');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*) = 2 from public.recipe_versions), 'approved versions readable');
select pg_temp.expect_error('update public.batch_requests set status=''READY''', '42501');
select pg_temp.expect_error(format('select public.start_batch_run(%L,1,''batch'',gen_random_uuid(),%L)', '30000000-0000-0000-0000-000000000002', :'request_id'), '23514');
select public.start_batch_run('30000000-0000-0000-0000-000000000001',1,'batch','50000000-0000-0000-0000-000000000002',:'request_id') as run_id \gset
select pg_temp.assert_true(public.start_batch_run('30000000-0000-0000-0000-000000000001',1,'batch','50000000-0000-0000-0000-000000000002',:'request_id') = :'run_id'::uuid, 'run retry idempotent');
select pg_temp.assert_true((select count(*) = 2 from public.batch_run_steps where batch_run_id = :'run_id'), 'one snapshot per recipe step');
select pg_temp.assert_true((select started_by = (select id from public.app_users where auth_user_id = auth.uid()) from public.batch_runs where id = :'run_id'), 'actor derived from auth');
select pg_temp.expect_error(format('select public.start_batch_run(%L,2,''batch'',gen_random_uuid(),%L)', '30000000-0000-0000-0000-000000000001', :'request_id'), '23514');
select id as mix_step from public.batch_run_steps where batch_run_id = :'run_id' and recipe_step_id = '40000000-0000-0000-0000-000000000001' \gset
select id as finish_step from public.batch_run_steps where batch_run_id = :'run_id' and recipe_step_id = '40000000-0000-0000-0000-000000000002' \gset
select pg_temp.expect_error(format('select public.finish_batch_run(%L,3)', :'run_id'), '23514');
select public.set_batch_step(:'run_id', :'mix_step', 'DONE');
select pg_temp.expect_error(format('select public.set_batch_step(%L,%L,''BLOCKED'','''')', :'run_id', :'finish_step'), '22023');
select public.set_batch_step(:'run_id', :'finish_step', 'BLOCKED', 'Synthetic blocker');
select pg_temp.assert_true((select status = 'BLOCKED' from public.batch_runs where id = :'run_id'), 'blocked run');
select pg_temp.assert_true((select status = 'BLOCKED' from public.batch_requests where id = :'request_id'), 'blocked request');
select pg_temp.expect_error(format('select public.set_batch_step(%L,%L,''PENDING'')', :'run_id', :'mix_step'), '23514');
select pg_temp.expect_error(format('select public.finish_batch_run(%L,3)', :'run_id'), '23514');

-- Another bartender resumes; DONE steps and actor history survive.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select public.set_batch_step(:'run_id', :'finish_step', 'PENDING');
select pg_temp.assert_true((select status = 'DONE' from public.batch_run_steps where id = :'mix_step'), 'completed work preserved');
select public.set_batch_step(:'run_id', :'finish_step', 'DONE');
select pg_temp.expect_error(format('select public.finish_batch_run(%L,0)', :'run_id'), '22023');
select public.finish_batch_run(:'run_id', 2);
select public.finish_batch_run(:'run_id', 2); -- idempotent
select pg_temp.assert_true((select status = 'REQUESTED' from public.batch_requests where id = :'request_id'), 'under-yield request reopens');
select pg_temp.expect_error(format('select public.finish_batch_run(%L,3)', :'run_id'), '23514');
select public.start_batch_run('30000000-0000-0000-0000-000000000001',4,'L',gen_random_uuid(),:'request_id') as second_run \gset
select public.set_batch_step(:'second_run', id, 'DONE') from public.batch_run_steps where batch_run_id = :'second_run' order by id;
select public.finish_batch_run(:'second_run',4);
select pg_temp.assert_true((select status = 'READY' from public.batch_requests where id = :'request_id'), 'request ready after accumulated output');
select pg_temp.expect_error(format('select public.start_batch_run(%L,1,''L'',gen_random_uuid(),%L)', '30000000-0000-0000-0000-000000000001', :'request_id'), '23514');
select pg_temp.expect_error('delete from public.batch_runs', '42501');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- Constraints/triggers protect identities and published definitions even from
-- accidental operator edits. Deliberate superuser tampering is out of scope.
select pg_temp.expect_error($q$update public.recipe_versions set expected_output_qty=9 where id='30000000-0000-0000-0000-000000000001'$q$, '23514');
select pg_temp.expect_error($q$update public.recipe_steps set name='Changed' where id='40000000-0000-0000-0000-000000000001'$q$, '23514');
select pg_temp.expect_error(format('update public.batch_runs set recipe_version_id=%L where id=%L', '30000000-0000-0000-0000-000000000002', :'run_id'), '23514');
select pg_temp.expect_error(format('insert into public.batch_run_steps(batch_run_id,recipe_step_id,recipe_version_id) values (%L,%L,%L)', :'run_id','40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001'), '23503');
select pg_temp.expect_error('delete from bar_private.audit_events', '23514');
select pg_temp.assert_true((select count(*) > 0 from bar_private.audit_events where relation_name='batch_run_steps' and new_row->>'status'='BLOCKED'), 'blocker retained in history');
select pg_temp.assert_true((select count(distinct actor_id) >= 2 from bar_private.audit_events where relation_name='batch_run_steps'), 'multiple actors recorded');
update public.app_users set active=false where auth_user_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((select count(*) = 0 from public.batch_runs), 'deactivation immediately hides runs');
select pg_temp.expect_error(format('select public.finish_batch_run(%L,4)', :'second_run'), '42501');
reset role;
rollback;
\echo 'All secure MVP behavioral assertions passed; synthetic fixture transaction rolled back.'
