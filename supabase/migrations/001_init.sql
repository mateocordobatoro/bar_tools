create extension if not exists pgcrypto;

create type app_role as enum ('management', 'bartender');
create type batch_status as enum ('REQUESTED', 'IN_PROGRESS', 'BLOCKED', 'READY', 'CANCELLED');
create type step_status as enum ('PENDING', 'DONE', 'BLOCKED');

create table app_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  role app_role not null,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  production_type text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id),
  version_number integer not null,
  expected_output_qty numeric,
  expected_output_unit text,
  effective_from timestamptz not null default now(),
  unique(recipe_id, version_number)
);

create table recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null references recipe_versions(id) on delete cascade,
  step_order integer not null,
  name text not null,
  instructions text,
  required boolean not null default true,
  makes_ready boolean not null default false,
  unique(recipe_version_id, step_order)
);

create table batch_requests (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null references recipe_versions(id),
  requested_by uuid references app_users(id),
  requested_qty numeric,
  requested_unit text,
  needed_by timestamptz,
  note text,
  status batch_status not null default 'REQUESTED',
  created_at timestamptz not null default now()
);

create table batch_runs (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null references recipe_versions(id),
  request_id uuid references batch_requests(id),
  status batch_status not null default 'IN_PROGRESS',
  started_by uuid references app_users(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expected_output_qty numeric,
  actual_output_qty numeric,
  output_unit text
);

create table batch_run_steps (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references batch_runs(id) on delete cascade,
  recipe_step_id uuid not null references recipe_steps(id),
  status step_status not null default 'PENDING',
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references app_users(id),
  blocked_reason text,
  note text,
  unique(batch_run_id, recipe_step_id)
);

create index idx_batch_requests_status on batch_requests(status);
create index idx_batch_runs_status on batch_runs(status);
create index idx_batch_run_steps_run on batch_run_steps(batch_run_id);
