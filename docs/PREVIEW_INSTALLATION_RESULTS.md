# Preview initial installation — Step 27 verified

Branch: `feat/supabase-foundation`.

**Current status: initial schema installed once and independently verified in
Preview (`mfwoutniamoldcieoqvc`).** See the final verification section below.
Earlier prerequisite stops and pending statuses are retained as historical notes.

The user explicitly authorized one atomic installation of 001 followed by 002
on `bar_tools_preview` (`mfwoutniamoldcieoqvc`) and accepted the residual risk of
having no managed backups or guaranteed restoration. Production
`njhcumxecwrrpbmjfdti` is excluded. This authorization does not include users,
fixtures, Auth changes, CLI linking, ledger repair, deployment or Git publication.

## Result

**Stopped before execution: no verified active PostgreSQL connection.**
Migration execution attempts: **zero**. No remote connection or hosted mutation
was performed during this attempt. There is no COMMIT/ROLLBACK result to report.

## Prerequisite evidence

- Reviewed `PREVIEW_RECOVERY_PLAN.md` and `DATABASE_DEPLOYMENT.md`.
- Confirmed the requested Git branch.
- Both SHA-256 hashes match the locally tested versions exactly:
  - 001: `b6f3f21b8052a8d01c30a0410a207118de16cc5de50a3bd92645cc1b08f18b71`
  - 002: `013f63f7e9d5b3e429e62b9262380b8c2ac818a2306c483e5089d49cda5416a3`
- The approved single-transaction psql procedure was previously tested locally;
  unchanged files preserve that evidence. PL/pgSQL BEGIN blocks are function/DO
  block syntax, not top-level transaction boundaries.
- psql is installed, but the proposed `bar_tools_preview` service is not set up:
  no default `~/.pg_service.conf` or `~/.pgpass`, no configured PG connection
  environment variables or DATABASE_URL. `.env.local` contains only the public
  Supabase URL and publishable key, which do not provide a database login.
- CLI remains unlinked.
- Therefore the active connection and target could not be verified. The current
  remote catalog, migration history, Auth user count, grants, RPC permissions,
  audit objects and Data API exposure were **not rechecked**. Step 24 remains
  historical evidence, not a fresh preflight.

## Required before continuing

Privately configure the libpq service `bar_tools_preview` using the exact Preview
Dashboard Connect values, a direct or session connection and TLS. Supply the
database password through an interactive prompt or protected password file;
never send it in chat or commit it. Verify host/user against project reference
`mfwoutniamoldcieoqvc`; the service name alone does not establish identity.

Then repeat every preflight gate before using the existing authorization.
Do not substitute another execution method, retry an uncertain transaction,
or infer a missing schema from an absent migration ledger. After a successful
psql installation, migration history may remain absent by design: verification
does not authorize creating or repairing it.

Preview is **not yet verified ready for hosted Auth/RLS integration testing**:
the installation has not been attempted and post-installation checks are pending.
This stop does not revoke the user's risk acceptance or request another approval
for the same installation; it records a missing connection prerequisite.

## Step 27 — authorized installation executed; verification pending

This section supersedes the earlier connection prerequisite stop.

The private Preview service was configured with the Dashboard-confirmed session
pooler, project-specific login and `sslmode=verify-full`, trusting the official
Supabase CA. Password entry stayed in the local terminal and was not stored.
A subsequent identity check passed inside an explicit READ ONLY transaction.

Fresh preflight passed: no public relations/types/functions/policies, no private
schema or migration ledger, zero Auth users, and all required operator privileges.
Migration hashes remained identical to those recorded above. Data API exposed
only public and graphql_public immediately before installation.

One installation attempt was recorded at 2026-09-21T21:26:18.310682+00:00.
The wrapper invoked psql once with `--single-transaction`, `ON_ERROR_STOP=1`,
fixed search_path and timeouts, a read-only empty-catalog assertion, then the
unchanged 001 and 002 files in order. The local one-attempt marker prevents a
second invocation. psql returned **0**, indicating successful completion of the
transaction. The SQL log reaches the final trigger creation; the implicit COMMIT
is not separately printed in that log. Independent post-commit catalog verification
is therefore the next evidence to collect, not grounds to replay the transaction.

The read-only verification command is prepared at
`/tmp/bar-tools-preview-step27/verify.command`; its output will cover RLS,
effective grants (including non-DML privileges), defaults, RPCs, audit objects,
constraints/triggers, aggregate row counts and ledger presence. It does not create
or repair migration history. No users, fixtures, CLI linking, deployment, commits
or pushes are part of this installation. Production remains excluded.

Status: installation client reported success; hosted Auth/RLS testing readiness
is **pending post-installation verification**.

## Step 27 — independent post-commit verification complete

The new psql connection returned exit **0**, reported `transaction_read_only=on`,
and ended with ROLLBACK. The persistent catalog seen from this independent
connection, together with installation exit 0, confirms the installation committed.
No installation retry or corrective SQL was executed.

| Check | Observed result |
| --- | --- |
| Seven MVP tables | app_users, recipes, recipe_versions, recipe_steps, batch_requests, batch_runs, batch_run_steps present; owner postgres. |
| RLS | Enabled on all seven, with seven SELECT policies addressed to authenticated only. |
| Effective table access | authenticated SELECT only; anon and service_role no table access. All 21 role/table combinations deny INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. |
| Staff Auth link | Unique auth_user_id foreign key to auth.users, ON DELETE RESTRICT; pin_hash absent. |
| Functions | All 16 routines fix search_path to empty. Five public SECURITY DEFINER workflow RPCs executable by authenticated only among API roles; private staff_role also executable by authenticated. Other private functions, including bootstrap_management, restricted to postgres. |
| Private audit | bar_private.audit_events has RLS, owner-only table and sequence ACLs, immutable-audit trigger. All API roles denied audit table/sequence access. authenticated has schema USAGE solely to support staff_role; no CREATE privilege. |
| Workflow/history structure | 20 enabled application triggers and 53 constraints inspected, including immutable definitions/history, exact version foreign keys, quantities, units, actor references and completion/blocker checks. This is structural verification, not hosted behavioral testing. |
| Empty state | Zero Auth users, zero rows in every MVP table and audit_events. |
| Migration history | Neither supabase_migrations schema nor schema_migrations table exists. Expected for this psql procedure; not created or repaired. |
| Data API | Dashboard reloaded after installation: public and graphql_public exposed; bar_private excluded; automatic table exposure OFF. No settings changed. |

### Discrepancies and follow-up gates

1. **Default privileges remain permissive for future objects.** The migrations
   revoke access on the actual objects they create, but do not harden defaults.
   postgres/public table defaults still give anon/authenticated/service_role
   TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. supabase_admin/public defaults remain
   broad for tables, sequences and functions. Schema-specific function defaults
   do not alone remove PostgreSQL's implicit global PUBLIC EXECUTE default.
   Current objects have explicit restricted ACLs verified above. Review a separate
   default-privilege hardening change before creating new application objects;
   never assume a future table/function inherits today's restrictions. No
   corrective SQL was authorized or executed here.
2. **Migration history reconciliation remains pending.** Preserve the exact applied
   files and hashes. Do not use db push or rerun 001/002 to populate the ledger.
   CLI linking/ledger repair requires a separately scoped action.
3. **Dashboard exposure counters need functional validation.** The reloaded Data API
   page reports “0 of 8 tables exposed” and “0 of 16 functions exposed”, while
   effective SQL privileges confirm authenticated SELECT/RPC EXECUTE. Those counters
   are not sufficient evidence of PostgREST access for authenticated roles. Validate
   actual API behavior with approved test identities; do not toggle exposure or
   broaden grants based only on the counters. No hosted Auth/JWT/PostgREST workflow
   tests were performed in this step.

Preview's installed database foundation is ready to begin **controlled hosted
Auth/RLS integration testing**, once that separate phase authorizes disposable
test identities and fixtures. This is not a claim that hosted integration has
passed or that the app is ready for use. Include the Data API counter discrepancy
in the first API checks. No users, fixtures, Auth changes, CLI linking, commits,
pushes, Vercel deployments or Production changes were made.

Local evidence files (private, outside Git):
`/tmp/bar-tools-preview-step27/preflight.txt`, `installation.log`,
`installation-exit.txt`, `verification.txt`, `verification-exit.txt`, and the
one-attempt marker. These paths are temporary; this report retains the findings
without credentials or user data.

## Step 28 follow-up

Controlled hosted integration tests subsequently passed; see
[results and retained synthetic inventory](PREVIEW_HOSTED_TESTS.md). Preview is
no longer empty. Do not reuse the empty-project installation/test procedures.
