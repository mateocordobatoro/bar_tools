# Controlled first database deployment

> Step 27: instalación única completada y verificada en Preview. El usuario
> aceptó el riesgo residual; no hay backup administrado ni restauración garantizada.
> Véase [resultado final](PREVIEW_INSTALLATION_RESULTS.md). Los estados pendientes
> del plan original que aparecen debajo son históricos; no reejecutar 001/002.


**Not applied to the existing Supabase project. Deployment approval is still required.**
The migrations have passed disposable local PostgreSQL tests (see
[the test report](DATABASE_TEST_RESULTS.md)). Stay on `feat/supabase-foundation`;
none of the development-project deployment commands below has been executed.
`001_init.sql` is preserved. `002_secure_mvp.sql` upgrades that exact, empty
schema. It takes exclusive locks and aborts on any MVP data or existing policy.
It is not a general migration for a populated or modified installation.

Start with the [step 20 readiness register](DEPLOYMENT_READINESS.md): review the
hosted Dashboard before any SQL. Production remains isolated from the new Preview target. The read-only Preview
catalog inspection passed; see [Step 24](PREVIEW_CATALOG_RESULTS.md).
Review [Step 25 recovery plan](PREVIEW_RECOVERY_PLAN.md) before requesting execution approval. Database
deployment and enabling user access have separate completion criteria.

## Decisions to approve before deployment

| Decision | Draft behavior |
| --- | --- |
| Staff identity | Confirmed, non-anonymous Supabase Auth identity linked uniquely to a staff profile. No PIN storage/login. Disabling `app_users.active` removes application access. |
| Management authority | Reads all production/staff data, creates requests, and approves draft versions. Does not perform bartender operations. Approval authority is an explicit addition requiring sign-off. |
| Bartender authority | Reads approved recipes/history and operational requests/runs; starts, resumes, blocks, completes steps, and finishes runs. Reads only their own profile. |
| Recipe authoring | Trusted database operator provisions drafts and steps. No application authoring API yet. Approval freezes the entire version and its steps. Deactivate a recipe to prevent new work; historical versions remain readable. |
| Units | Case-sensitive `L` and `bottle`; integer `batch` multiples convert using the version's output. Bottles are whole numbers; litres may be fractional. No ml/oz conversion. Quantities must be finite, positive, and below one billion. |
| Partial fulfillment | Multiple runs per request. New runs reserve remaining quantity; READY output uses actual yield. Under-yield returns a request to REQUESTED when no runs remain active. Over-yield is recorded, not rejected. |
| Readiness | All required steps and all `makes_ready` steps must be DONE; no step may remain BLOCKED. Approval requires at least one readiness step. Optional pending steps are permitted when finishing. |
| Step order | Ordered for presentation, not enforced as a dependency graph. A blocked step must resume to PENDING before completion; DONE is immutable. |
| Cancellation/corrections | No cancellation API in this first deployment. CANCELLED remains in the legacy enum, but runs only allow IN_PROGRESS/BLOCKED/READY. Zero-yield, waste, corrections, and cancellation require a reviewed follow-up rather than rewriting history. |
| Audit | One additional private audit table records row changes, authenticated actors, timestamps, and database operator identity. No API access. Retention/export and a manager-facing history API remain to be decided. |

This is a single-restaurant staff model, not multi-location tenancy. A publishable
key cannot read data without an active, provisioned Auth identity. Neither role
can write tables directly, change their own role, delete history, or provide an
actor ID to a workflow function. Five narrow SECURITY DEFINER RPCs check the
current database profile, fix `search_path`, and derive actors from `auth.uid()`.
The trusted migration operator owns these functions. Database owners/superusers
remain privileged; RLS is not a defense against a malicious database operator.
No service-role key is needed by the application or bootstrap procedure.

## Local artifacts and verification limits

- `supabase/migrations/002_secure_mvp.sql`: forward security/schema migration.
- `supabase/operations/preflight.sql`: read-only target inspection.
- `supabase/operations/verify_foundation.sql`: read-only privilege/policy checks.
- `supabase/tests/002_secure_mvp.sql`: rollback-only behavioral suite for an
  **isolated empty test database**, never the existing development project.
- `npm run test:database`: offline security-contract checks, no DB connection.

SQL/PLpgSQL syntax can be parsed without execution, but that does not resolve
catalog references, exercise RLS, or prove concurrent behavior. The SQL suite has now passed on disposable PostgreSQL 17.10 with a minimal
Supabase Auth database contract, as have five concurrent-session scenarios.
The full local Supabase stack also passed Auth HTTP, JWT, PostgREST and SSR
integration checks; see [the stack report](SUPABASE_STACK_TEST_RESULTS.md) for
reproduction steps and the limits of local-to-hosted parity.
Do not treat static checks or the Auth connectivity probe as deployment approval.

## Environment boundary

`bar_tools` (`njhcumxecwrrpbmjfdti`) remains connected to Vercel Production.
`bar_tools_preview` (`mfwoutniamoldcieoqvc`) is the separate Preview/Development
target; see [PREVIEW_SETUP.md](PREVIEW_SETUP.md). The libpq service below is not
configured and must be verified against Preview Connect values before use.
Production needs separate approval and a production-specific backup review.

## Preparation (manual, after approval)

1. Confirm the Supabase **development** project reference in its Dashboard;
   do not infer the target from the public URL alone. Confirm who can authorize
   deployment and who will be the first manager. Keep application writes off
   during deployment and verification.
2. Install PostgreSQL client tools and Supabase CLI. Configure libpq services
   named `bar_tools_preview` and (later) `bar_tools_test` with the corresponding
   Supabase Connect values, database `postgres`, and `sslmode=require` (prefer
   `verify-full` with the appropriate trust setup). Use a session connection or
   direct connection, not the transaction pooler, for operator tools. Use the
   database `postgres` operator identity. Store passwords in a restricted
   `.pgpass` file (mode 0600) or enter them interactively; never put them in SQL,
   command arguments, committed files, `NEXT_PUBLIC_*`, or chat.
3. Choose and record the recovery option in [Step 25](PREVIEW_RECOVERY_PLAN.md).
   Preview Free has no managed backups. Obtain and test a supported backup, or
   request explicit acceptance of the residual risk for this empty Preview only;
   no such exception is approved yet. Save a separate schema/grant dump outside the repository:
   `pg_dump --dbname='service=bar_tools_preview' --schema-only --file=/secure/path/pre-foundation.sql`.
   Treat backups as sensitive; do not commit or print them. Record the existing
   migration ledger and the project reference separately.
4. Run read-only preflight:

   ```sh
   psql 'service=bar_tools_preview' -X -v ON_ERROR_STOP=1 -f supabase/operations/preflight.sql
   ```

   Review actual definitions, counts, grants, triggers and policies in Dashboard.
   Inspect `supabase_migrations.schema_migrations` if preflight says it exists.
   **Choose exactly one supported state:** no MVP tables/types and no 001 entry;
   or all seven tables matching 001 exactly, empty, with no unexpected policies.
   Partial schema, data, drift, a `bar_private` schema, or disagreement with the
   migration ledger means stop and prepare a reviewed recovery/backfill plan.
5. Confirm `bar_private` is NOT a Data API exposed schema. Keep public signup and
   anonymous Auth sign-in disabled for this staff-only app. Do not grant broader
   table access, expose audit data, or disable RLS to make diagnostics pass.

## Apply atomically (manual, after approval)

From repository root, **empty project only**:

```sh
psql 'service=bar_tools_preview' -X -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET LOCAL search_path = public, pg_catalog; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s'" \
  -f supabase/migrations/001_init.sql \
  -f supabase/migrations/002_secure_mvp.sql
```

If 001 is already installed, verified identical and empty, apply only 002:

```sh
psql 'service=bar_tools_preview' -X -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET LOCAL search_path = public, pg_catalog; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s'" \
  -f supabase/migrations/002_secure_mvp.sql
```

Do not run 001 by itself, concatenate files into separate SQL Editor executions,
or apply 002 in autocommit mode. The transaction prevents the initial schema
from becoming externally visible before grants/RLS are in place. Lock timeouts,
constraint failures, or any other errors must abort; do not bypass the guard.

These psql commands do not update Supabase CLI migration history. After success,
link CLI to the **verified development** project and reconcile the ledger:

```sh
supabase link --project-ref YOUR_VERIFIED_DEVELOPMENT_PROJECT_REF
supabase migration list --linked
supabase migration repair 001 002 --status applied --linked
supabase migration list --linked
```

Use interactive credentials. Repair only after verifying both files are applied;
if 001 was already recorded, only 002 needs repair. Do not use `db push` before
reconciliation: it could try to replay 001. If ledger repair fails, keep rollout
paused and repair the ledger; do not replay the schema transaction. Do not run
`supabase db reset --linked` or any production reset.

## Verify before enabling application access

```sh
psql 'service=bar_tools_preview' -X -v ON_ERROR_STOP=1 -f supabase/operations/verify_foundation.sql
```

Expected results are included beside the queries. Confirm all seven public
tables have RLS, only authenticated SELECT grants, seven SELECT-only policies,
no PIN column, no anon/service-role access, and restricted function execution.
Review Supabase Security Advisor and ensure no unrelated project objects were
modified. Existing authenticated users without profiles must see no rows.

Before authorizing this on development, run the prepared behavioral suite on a
separately authorized disposable Supabase test instance with both migrations
applied and **no existing Auth users**:

```sh
psql 'service=bar_tools_test' -X -v ON_ERROR_STOP=1 -f supabase/tests/002_secure_mvp.sql
```

The test file creates synthetic fixtures inside a transaction and rolls back.
It verifies role denial, profile filtering, draft visibility, immutable recipes,
version consistency, quantity validation, idempotent retries, partial runs,
block/resume, readiness, actor attribution, and deactivation. On any failure,
ON_ERROR_STOP closes the session and rolls the transaction back.

Also test these races in two separate test sessions before deployment: replay
one operation key concurrently (one request/run only); start two runs against
the same remaining quantity (no over-reservation); complete/block steps on one
run concurrently (serialized and correct aggregate state); deactivate staff
while a write is in flight (the in-flight transaction may finish before the
profile change commits, subsequent calls must fail). Row/advisory locks are in
place, but a single-session test cannot establish these race guarantees.

## First management user (manual, separate approval)

1. Through the Supabase Dashboard Auth admin invitation flow, invite the approved
   manager using the approved email delivery settings. The recipient accepts
   the invitation and establishes their own credentials. Never share passwords,
   invitation links, JWTs, or service-role keys in SQL, source, logs, or chat.
   Auth callbacks must be configured before relying on an app sign-in flow.
2. In Auth → Users, verify the intended confirmed, non-anonymous identity and
   copy its UUID (not credentials). As the database operator in SQL Editor:

   ```sql
   begin;
   select bar_private.bootstrap_management(
     'REPLACE_WITH_VERIFIED_AUTH_USER_UUID'::uuid,
     'Approved manager display name'
   );
   commit;
   ```

   The function checks confirmation and prevents a second bootstrap, including
   concurrent attempts. It accepts no passwords and creates only a profile for
   an already existing Auth user. It is in an unexposed schema and executable
   only by the trusted operator, not anon/authenticated/service_role.
3. Verify the profile's Auth UUID, role and active flag in Dashboard. Do not
   create additional users as part of migration execution. Future provisioning
   and role changes stay operator-managed until an audited admin workflow is
   reviewed. If the wrong identity was selected, deactivate it and perform a
   reviewed corrective administrative transaction; do not reopen the bootstrap.

## Rollback and recovery

Follow [the recovery decision table](PREVIEW_RECOVERY_PLAN.md). A failed SQL
statement before COMMIT rolls back transactional changes; reconnect and verify
the baseline before retrying. A disconnect during COMMIT has an **unknown
outcome**: inspect active sessions and the catalog, never blindly rerun files.
After a confirmed commit, use a reviewed forward repair if verification fails.
Keep application access off and preserve RLS. There is no managed snapshot to
restore on current Preview Free. Recreating an empty isolated project requires
separate approval and is reconstruction, not restoration. If users/data exist,
stop and prepare a data-preserving recovery plan.

No automated down migration is included: restoring the legacy unsecured schema
would be an unsafe rollback. Keep the prior application deployment available,
but do not assume its database writes are compatible with the secured schema.

## Checks completed for this draft

`npm run test:database` (five offline security checks), `npm run test:supabase`
(21 mocked safety checks), `npm run typecheck`, `npm run build`, and
`git diff --check` passed. PostgreSQL syntax parsing with pglast 8.4 also passed
for both migration files, operator queries, and the behavioral test SQL;
PL/pgSQL bodies were parsed without execution. Disposable database execution and concurrency tests have since passed; see
[the execution report](DATABASE_TEST_RESULTS.md). Full local Supabase-stack tests have also passed. The Preview catalog preflight passed (Step 24). Execution and residual-risk
acceptance remain pending; see Step 25.
