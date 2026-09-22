-- Controlled FIRST deployment only. Requires 001_init.sql and empty MVP tables.
-- No BEGIN/COMMIT here: the deployment wrapper must apply 001 + 002 atomically.
-- Execute as postgres. Do not apply this file until the deployment gate is approved.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.app_users, public.recipes, public.recipe_versions,
  public.recipe_steps, public.batch_requests, public.batch_runs,
  public.batch_run_steps in access exclusive mode;
do $$
begin
  if exists (select 1 from public.app_users)
    or exists (select 1 from public.recipes)
    or exists (select 1 from public.recipe_versions)
    or exists (select 1 from public.recipe_steps)
    or exists (select 1 from public.batch_requests)
    or exists (select 1 from public.batch_runs)
    or exists (select 1 from public.batch_run_steps) then
    raise exception 'First-deployment migration requires empty MVP tables; prepare a reviewed backfill instead';
  end if;
  if exists (select 1 from pg_catalog.pg_policies where schemaname = 'public'
    and tablename in ('app_users','recipes','recipe_versions','recipe_steps',
      'batch_requests','batch_runs','batch_run_steps')) then
    raise exception 'Unexpected existing policies; review schema drift before deployment';
  end if;
end;
$$;

create schema bar_private;
revoke all on schema bar_private from public, anon, authenticated, service_role;
grant usage on schema bar_private to authenticated;

alter table public.app_users drop column pin_hash;
alter table public.app_users
  add column auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  add constraint staff_name_nonempty check (length(btrim(display_name)) between 1 and 120);
alter table public.recipes
  add constraint recipe_name_nonempty check (length(btrim(name)) between 1 and 200);
alter table public.recipe_versions
  alter column expected_output_qty set not null,
  alter column expected_output_unit set not null,
  add column approved_at timestamptz,
  add column approved_by uuid references public.app_users(id) on delete restrict,
  add constraint version_positive check (version_number > 0),
  add constraint version_quantity check (expected_output_qty > 0 and expected_output_qty < 1000000000),
  add constraint version_unit check (expected_output_unit in ('L', 'bottle')),
  add constraint version_whole_bottles check (expected_output_unit <> 'bottle' or expected_output_qty = trunc(expected_output_qty)),
  add constraint version_approval_pair check ((approved_at is null) = (approved_by is null));
alter table public.recipe_steps drop constraint recipe_steps_recipe_version_id_fkey;
alter table public.recipe_steps
  add foreign key (recipe_version_id) references public.recipe_versions(id) on delete restrict,
  add constraint step_identity_version unique (id, recipe_version_id),
  add constraint step_order_positive check (step_order > 0),
  add constraint step_name_nonempty check (length(btrim(name)) between 1 and 200);
alter table public.batch_requests
  alter column requested_by set not null,
  alter column requested_qty set not null,
  alter column requested_unit set not null,
  add column operation_key uuid not null,
  add column target_output_qty numeric not null,
  add column output_unit text not null,
  add constraint request_idempotency unique (requested_by, operation_key),
  add constraint request_version_unit unique (id, recipe_version_id, output_unit),
  add constraint request_quantity check (requested_qty > 0 and requested_qty < 1000000000 and target_output_qty > 0 and target_output_qty < 1000000000),
  add constraint request_unit check (requested_unit in ('batch', 'L', 'bottle') and output_unit in ('L', 'bottle')),
  add constraint request_whole_units check ((requested_unit = 'L' or requested_qty = trunc(requested_qty)) and (output_unit = 'L' or target_output_qty = trunc(target_output_qty))),
  add constraint request_note_length check (note is null or length(note) <= 2000);
alter table public.batch_runs drop constraint batch_runs_request_id_fkey;
alter table public.batch_runs
  alter column started_by set not null,
  alter column expected_output_qty set not null,
  alter column output_unit set not null,
  add column operation_key uuid not null,
  add column completed_by uuid references public.app_users(id) on delete restrict,
  add constraint run_idempotency unique (started_by, operation_key),
  add constraint run_identity_version unique (id, recipe_version_id),
  add constraint run_request_version_unit foreign key (request_id, recipe_version_id, output_unit)
    references public.batch_requests(id, recipe_version_id, output_unit) on delete restrict,
  add constraint run_quantity check (expected_output_qty > 0 and expected_output_qty < 1000000000 and (actual_output_qty is null or (actual_output_qty > 0 and actual_output_qty < 1000000000))),
  add constraint run_unit check (output_unit in ('L', 'bottle')),
  add constraint run_whole_bottles check (output_unit <> 'bottle' or (expected_output_qty = trunc(expected_output_qty) and (actual_output_qty is null or actual_output_qty = trunc(actual_output_qty)))),
  add constraint run_status check (status in ('IN_PROGRESS', 'BLOCKED', 'READY')),
  add constraint run_completion check (
    (status = 'READY' and actual_output_qty is not null and completed_at is not null and completed_by is not null and completed_at >= started_at)
    or (status <> 'READY' and actual_output_qty is null and completed_at is null and completed_by is null));
alter table public.batch_run_steps drop constraint batch_run_steps_batch_run_id_fkey;
alter table public.batch_run_steps drop constraint batch_run_steps_recipe_step_id_fkey;
alter table public.batch_run_steps
  add column recipe_version_id uuid not null,
  add column blocked_by uuid references public.app_users(id) on delete restrict,
  add column blocked_at timestamptz,
  add constraint run_step_run_version foreign key (batch_run_id, recipe_version_id)
    references public.batch_runs(id, recipe_version_id) on delete restrict,
  add constraint run_step_definition_version foreign key (recipe_step_id, recipe_version_id)
    references public.recipe_steps(id, recipe_version_id) on delete restrict,
  add constraint step_completion check (
    (status = 'DONE' and completed_by is not null and completed_at is not null and started_at is not null and completed_at >= started_at)
    or (status <> 'DONE' and completed_by is null and completed_at is null)),
  add constraint step_blocker check (
    (status = 'BLOCKED' and length(btrim(blocked_reason)) between 1 and 2000 and blocked_reason is not null and blocked_by is not null and blocked_at is not null)
    or (status <> 'BLOCKED' and blocked_reason is null and blocked_by is null and blocked_at is null)),
  add constraint step_note_length check (note is null or length(note) <= 2000);

create index request_version_idx on public.batch_requests(recipe_version_id);
create index run_version_idx on public.batch_runs(recipe_version_id);
create index run_request_idx on public.batch_runs(request_id);
create index run_step_definition_idx on public.batch_run_steps(recipe_step_id);

-- Seven public business tables: reads under RLS, NO direct API writes.
alter table public.app_users enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.batch_requests enable row level security;
alter table public.batch_runs enable row level security;
alter table public.batch_run_steps enable row level security;
revoke all on table public.app_users, public.recipes, public.recipe_versions,
  public.recipe_steps, public.batch_requests, public.batch_runs, public.batch_run_steps
  from public, anon, authenticated, service_role;
grant select on table public.app_users, public.recipes, public.recipe_versions,
  public.recipe_steps, public.batch_requests, public.batch_runs, public.batch_run_steps
  to authenticated;

create function bar_private.staff_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.app_users where auth_user_id = (select auth.uid()) and active;
$$;
create function bar_private.actor(required_role public.app_role) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  -- Hold profile stable through the write; concurrent deactivation waits.
  select id into result from public.app_users
    where auth_user_id = auth.uid() and active and role = required_role for share;
  if result is null then raise exception using errcode = '42501', message = 'Active staff role required'; end if;
  return result;
end;
$$;

create policy staff_read on public.app_users for select to authenticated using (
  bar_private.staff_role() = 'management'
  or (bar_private.staff_role() = 'bartender' and auth_user_id = (select auth.uid())));
create policy recipe_read on public.recipes for select to authenticated using (
  bar_private.staff_role() = 'management' or (bar_private.staff_role() = 'bartender'
    and exists (select 1 from public.recipe_versions v where v.recipe_id = recipes.id and v.approved_at is not null)));
create policy version_read on public.recipe_versions for select to authenticated using (
  bar_private.staff_role() = 'management' or (bar_private.staff_role() = 'bartender' and approved_at is not null));
create policy definition_read on public.recipe_steps for select to authenticated using (
  bar_private.staff_role() = 'management' or (bar_private.staff_role() = 'bartender'
    and exists (select 1 from public.recipe_versions v where v.id = recipe_steps.recipe_version_id and v.approved_at is not null)));
create policy request_read on public.batch_requests for select to authenticated using (bar_private.staff_role() is not null);
create policy run_read on public.batch_runs for select to authenticated using (bar_private.staff_role() is not null);
create policy run_step_read on public.batch_run_steps for select to authenticated using (bar_private.staff_role() is not null);

-- Audit stays in an unexposed schema. Database operator activity has a null staff
-- actor and an explicit database identity; it is not attributed to a fake user.
create table bar_private.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid references public.app_users(id) on delete restrict,
  database_actor text not null,
  relation_name text not null,
  operation text not null,
  row_id uuid not null,
  old_row jsonb,
  new_row jsonb
);
alter table bar_private.audit_events enable row level security;
revoke all on table bar_private.audit_events from public, anon, authenticated, service_role;
revoke all on sequence bar_private.audit_events_id_seq from public, anon, authenticated, service_role;
create function bar_private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into bar_private.audit_events(actor_id, database_actor, relation_name, operation, row_id, old_row, new_row)
    values ((select id from public.app_users where auth_user_id = auth.uid()), session_user,
      tg_table_name, tg_op, coalesce(new.id, old.id),
      case when tg_op <> 'INSERT' then to_jsonb(old) end,
      case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end;
$$;
create function bar_private.reject_history_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'History cannot be deleted or rewritten';
end;
$$;
create trigger immutable_audit before update or delete or truncate on bar_private.audit_events
  for each statement execute function bar_private.reject_history_change();
do $$
declare t text;
begin
  foreach t in array array['app_users','recipes','recipe_versions','recipe_steps','batch_requests','batch_runs','batch_run_steps'] loop
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function bar_private.audit_change()', t);
    execute format('create trigger preserve_history before delete or truncate on public.%I for each statement execute function bar_private.reject_history_change()', t);
  end loop;
end;
$$;

create function bar_private.guard_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.approved_at is not null then
    raise exception using errcode = '23514', message = 'Approved recipe versions are immutable';
  end if;
  return new;
end;
$$;
create trigger immutable_version before update on public.recipe_versions
  for each row execute function bar_private.guard_version();
create function bar_private.guard_definition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.recipe_version_id <> new.recipe_version_id then
    raise exception using errcode = '23514', message = 'Recipe steps cannot move between versions';
  end if;
  -- Serialize edits against approval; drafts are provisioned by a DB operator.
  perform 1 from public.recipe_versions where id = new.recipe_version_id for update;
  if exists (select 1 from public.recipe_versions where id = new.recipe_version_id and approved_at is not null) then
    raise exception using errcode = '23514', message = 'Approved recipe steps are immutable';
  end if;
  return new;
end;
$$;
create trigger immutable_definition before insert or update on public.recipe_steps
  for each row execute function bar_private.guard_definition();

create function public.approve_recipe_version(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := bar_private.actor('management'); v public.recipe_versions;
begin
  select * into v from public.recipe_versions where id = p_version for update;
  if not found then raise exception using errcode = '22023', message = 'Unknown version'; end if;
  if v.approved_at is not null then return; end if;
  if not exists (select 1 from public.recipe_steps where recipe_version_id = p_version and makes_ready) then
    raise exception using errcode = '23514', message = 'Approval requires at least one readiness step';
  end if;
  update public.recipe_versions set approved_at = clock_timestamp(), approved_by = a where id = p_version;
end;
$$;

create function bar_private.output_quantity(p_qty numeric, p_unit text, v public.recipe_versions) returns numeric
language plpgsql set search_path = '' as $$
declare result numeric;
begin
  if p_qty is null or not (p_qty > 0 and p_qty < 1000000000)
    or p_unit is null or p_unit not in ('batch', v.expected_output_unit)
    or (p_unit in ('batch', 'bottle') and p_qty <> trunc(p_qty)) then
    raise exception using errcode = '22023', message = 'Invalid quantity or unit';
  end if;
  result := case when p_unit = 'batch' then p_qty * v.expected_output_qty else p_qty end;
  if not (result > 0 and result < 1000000000) then
    raise exception using errcode = '22023', message = 'Output quantity out of range';
  end if;
  return result;
end;
$$;
create function public.create_batch_request(p_version uuid, p_qty numeric, p_unit text,
  p_operation_key uuid, p_needed_by timestamptz default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a uuid := bar_private.actor('management'); v public.recipe_versions; existing public.batch_requests; result uuid; qty numeric;
begin
  if p_operation_key is null then raise exception using errcode = '22023', message = 'Operation key required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(a::text || p_operation_key::text, 0));
  select * into existing from public.batch_requests where requested_by = a and operation_key = p_operation_key;
  if found then
    if existing.recipe_version_id is distinct from p_version or existing.requested_qty is distinct from p_qty
      or existing.requested_unit is distinct from p_unit or existing.needed_by is distinct from p_needed_by or existing.note is distinct from p_note then
      raise exception using errcode = '22023', message = 'Operation key reused with different input';
    end if;
    return existing.id;
  end if;
  select * into v from public.recipe_versions where id = p_version for share;
  if not found or v.approved_at is null then raise exception using errcode = '23514', message = 'Approved version required'; end if;
  perform 1 from public.recipes where id = v.recipe_id and active for share;
  if not found then raise exception using errcode = '23514', message = 'Active recipe required'; end if;
  qty := bar_private.output_quantity(p_qty, p_unit, v);
  insert into public.batch_requests(recipe_version_id, requested_by, requested_qty, requested_unit,
    operation_key, target_output_qty, output_unit, needed_by, note)
    values (v.id, a, p_qty, p_unit, p_operation_key, qty, v.expected_output_unit, p_needed_by, p_note)
    returning id into result;
  return result;
end;
$$;

create function bar_private.sync_request(p_request uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if p_request is null then return; end if;
  -- Caller already holds the request row lock before acquiring any run lock.
  update public.batch_requests q set status = case
    when exists (select 1 from public.batch_runs r where r.request_id = q.id and r.status = 'IN_PROGRESS') then 'IN_PROGRESS'::public.batch_status
    when exists (select 1 from public.batch_runs r where r.request_id = q.id and r.status = 'BLOCKED') then 'BLOCKED'::public.batch_status
    when coalesce((select sum(actual_output_qty) from public.batch_runs r where r.request_id = q.id and r.status = 'READY'), 0) >= q.target_output_qty then 'READY'::public.batch_status
    else 'REQUESTED'::public.batch_status end where q.id = p_request;
end;
$$;
create function public.start_batch_run(p_version uuid, p_qty numeric, p_unit text,
  p_operation_key uuid, p_request uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a uuid := bar_private.actor('bartender'); v public.recipe_versions; q public.batch_requests;
  existing public.batch_runs; result uuid; qty numeric; allocated numeric;
begin
  if p_operation_key is null then raise exception using errcode = '22023', message = 'Operation key required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(a::text || p_operation_key::text, 0));
  select * into v from public.recipe_versions where id = p_version for share;
  if not found or v.approved_at is null then raise exception using errcode = '23514', message = 'Approved version required'; end if;
  qty := bar_private.output_quantity(p_qty, p_unit, v);
  select * into existing from public.batch_runs where started_by = a and operation_key = p_operation_key;
  if found then
    if existing.recipe_version_id is distinct from p_version or existing.request_id is distinct from p_request or existing.expected_output_qty is distinct from qty then
      raise exception using errcode = '22023', message = 'Operation key reused with different input';
    end if;
    return existing.id;
  end if;
  perform 1 from public.recipes where id = v.recipe_id and active for share;
  if not found then raise exception using errcode = '23514', message = 'Active recipe required'; end if;
  if p_request is not null then
    select * into q from public.batch_requests where id = p_request for update;
    if not found or q.recipe_version_id <> p_version or q.status in ('READY', 'CANCELLED') then
      raise exception using errcode = '23514', message = 'Open request for this version required';
    end if;
    select coalesce(sum(case when status = 'READY' then actual_output_qty else expected_output_qty end), 0)
      into allocated from public.batch_runs where request_id = p_request;
    if allocated + qty > q.target_output_qty then
      raise exception using errcode = '23514', message = 'Run exceeds remaining requested quantity';
    end if;
  end if;
  insert into public.batch_runs(recipe_version_id, request_id, started_by, expected_output_qty, output_unit, operation_key)
    values (v.id, p_request, a, qty, v.expected_output_unit, p_operation_key) returning id into result;
  insert into public.batch_run_steps(batch_run_id, recipe_step_id, recipe_version_id)
    select result, id, v.id from public.recipe_steps where recipe_version_id = v.id;
  perform bar_private.sync_request(p_request);
  return result;
end;
$$;

-- Lock order across workflow RPCs: profile -> request -> run -> step.
create function bar_private.lock_run(p_run uuid) returns public.batch_runs
language plpgsql set search_path = '' as $$
declare r public.batch_runs; request uuid;
begin
  select request_id into request from public.batch_runs where id = p_run;
  if not found then raise exception using errcode = '22023', message = 'Unknown run'; end if;
  if request is not null then perform 1 from public.batch_requests where id = request for update; end if;
  select * into r from public.batch_runs where id = p_run for update;
  return r;
end;
$$;
create function public.set_batch_step(p_run uuid, p_step uuid, p_status public.step_status,
  p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := bar_private.actor('bartender'); r public.batch_runs; s public.batch_run_steps;
begin
  r := bar_private.lock_run(p_run);
  select * into s from public.batch_run_steps where id = p_step and batch_run_id = p_run for update;
  if not found then raise exception using errcode = '22023', message = 'Unknown run step'; end if;
  if p_status is null or (p_status = 'BLOCKED' and (p_reason is null or length(btrim(p_reason)) not between 1 and 2000))
    or (p_status <> 'BLOCKED' and p_reason is not null) then
    raise exception using errcode = '22023', message = 'Invalid step status or blocker';
  end if;
  if s.status = p_status and s.blocked_reason is not distinct from p_reason then return; end if;
  if r.status = 'READY' or s.status = 'DONE'
    or (p_status = 'PENDING' and s.status <> 'BLOCKED')
    or (p_status = 'DONE' and s.status <> 'PENDING') then
    raise exception using errcode = '23514', message = 'Invalid step transition';
  end if;
  update public.batch_run_steps set status = p_status,
    started_at = coalesce(started_at, clock_timestamp()),
    completed_at = case when p_status = 'DONE' then clock_timestamp() end,
    completed_by = case when p_status = 'DONE' then a end,
    blocked_reason = p_reason,
    blocked_by = case when p_status = 'BLOCKED' then a end,
    blocked_at = case when p_status = 'BLOCKED' then clock_timestamp() end
    where id = s.id;
  update public.batch_runs set status = case
    when exists (select 1 from public.batch_run_steps where batch_run_id = p_run and status = 'BLOCKED')
    then 'BLOCKED'::public.batch_status else 'IN_PROGRESS'::public.batch_status end where id = p_run;
  perform bar_private.sync_request(r.request_id);
end;
$$;
create function public.finish_batch_run(p_run uuid, p_actual_qty numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := bar_private.actor('bartender'); r public.batch_runs;
begin
  r := bar_private.lock_run(p_run);
  if p_actual_qty is null or not (p_actual_qty > 0 and p_actual_qty < 1000000000)
    or (r.output_unit = 'bottle' and p_actual_qty <> trunc(p_actual_qty)) then
    raise exception using errcode = '22023', message = 'Invalid actual quantity';
  end if;
  if r.status = 'READY' and r.actual_output_qty = p_actual_qty then return; end if;
  if r.status <> 'IN_PROGRESS' or exists (
    select 1 from public.batch_run_steps s join public.recipe_steps d on d.id = s.recipe_step_id
    where s.batch_run_id = p_run and (s.status = 'BLOCKED' or ((d.required or d.makes_ready) and s.status <> 'DONE'))
  ) then raise exception using errcode = '23514', message = 'Run is not ready to finish'; end if;
  update public.batch_runs set status = 'READY', actual_output_qty = p_actual_qty,
    completed_at = clock_timestamp(), completed_by = a where id = p_run;
  perform bar_private.sync_request(r.request_id);
end;
$$;

-- Out-of-band bootstrap. Never exposed as a public RPC; no credentials accepted.
create function bar_private.bootstrap_management(p_auth_user uuid, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  lock table public.app_users in share row exclusive mode;
  if exists (select 1 from public.app_users where role = 'management') then
    raise exception using errcode = '23514', message = 'Management bootstrap already completed';
  end if;
  if not exists (select 1 from auth.users where id = p_auth_user and email_confirmed_at is not null and not coalesce(is_anonymous, false)) then
    raise exception using errcode = '23514', message = 'Confirmed non-anonymous Auth identity required';
  end if;
  insert into public.app_users(auth_user_id, display_name, role)
    values (p_auth_user, p_display_name, 'management') returning id into result;
  return result;
end;
$$;

-- Revoke default EXECUTE, including inherited PUBLIC privileges, explicitly.
-- These functions are owned by the migration operator (postgres); its trusted
-- definer operations bypass RLS only after validating identity and role.
revoke all on all functions in schema bar_private from public, anon, authenticated, service_role;
grant execute on function bar_private.staff_role() to authenticated;
grant execute on function bar_private.bootstrap_management(uuid, text) to postgres;
revoke all on function public.approve_recipe_version(uuid),
  public.create_batch_request(uuid, numeric, text, uuid, timestamptz, text),
  public.start_batch_run(uuid, numeric, text, uuid, uuid),
  public.set_batch_step(uuid, uuid, public.step_status, text),
  public.finish_batch_run(uuid, numeric) from public, anon, authenticated, service_role;
grant execute on function public.approve_recipe_version(uuid),
  public.create_batch_request(uuid, numeric, text, uuid, timestamptz, text),
  public.start_batch_run(uuid, numeric, text, uuid, uuid),
  public.set_batch_step(uuid, uuid, public.step_status, text),
  public.finish_batch_run(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';

-- Even privileged corrections must not repoint historical work to a new formula.
create function bar_private.guard_work_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'batch_requests' then
    if (to_jsonb(old) - 'status') is distinct from (to_jsonb(new) - 'status') then
      raise exception using errcode = '23514', message = 'Request identity and quantities are immutable';
    end if;
  elsif tg_table_name = 'batch_runs' then
    if (to_jsonb(old) - array['status','actual_output_qty','completed_at','completed_by'])
      is distinct from (to_jsonb(new) - array['status','actual_output_qty','completed_at','completed_by']) then
      raise exception using errcode = '23514', message = 'Run identity and planned quantities are immutable';
    end if;
  else
    if old.id <> new.id or old.batch_run_id <> new.batch_run_id or old.recipe_step_id <> new.recipe_step_id
      or old.recipe_version_id <> new.recipe_version_id then
      raise exception using errcode = '23514', message = 'Run step identity is immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function bar_private.guard_work_identity() from public, anon, authenticated, service_role;
create trigger immutable_request_identity before update on public.batch_requests
  for each row execute function bar_private.guard_work_identity();
create trigger immutable_run_identity before update on public.batch_runs
  for each row execute function bar_private.guard_work_identity();
create trigger immutable_run_step_identity before update on public.batch_run_steps
  for each row execute function bar_private.guard_work_identity();
