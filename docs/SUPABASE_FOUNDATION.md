# Supabase foundation review

Status: a draft forward migration (`002_secure_mvp.sql`), deployment runbook,
and tests are now prepared. See [controlled deployment](DATABASE_DEPLOYMENT.md)
for implemented decisions, approval gates, and exact commands. The proposal
below describes the broader design; the runbook identifies first-deployment
limits, including deferred cancellation and app-based recipe authoring.
Migrations and synthetic fixtures have passed disposable PostgreSQL and full
local Supabase-stack tests. See [the stack report](SUPABASE_STACK_TEST_RESULTS.md)
and [the remote readiness register](DEPLOYMENT_READINESS.md). No SQL, users, or data have been applied to the existing
Supabase project; application authentication is not implemented. See
[the database test report](DATABASE_TEST_RESULTS.md).
The scope, roles, history requirements, and UX remain defined by `MVP_SCOPE.md`,
`ARCHITECTURE.md`, and `UX_FLOW.md`.

## Current risks

`001_init.sql` creates seven public tables without enabling RLS or defining
grants/policies. SQL-created tables must not be assumed protected. `app_users`
has no relationship to `auth.users`, and mixes profile data with `pin_hash`.
The clients use non-privileged keys, but a key alone does not authenticate staff
or enforce application roles. The server client catches cookie-write failures;
session-refresh middleware and verified server-side identity checks are absent.

Recipe versions/steps remain editable and steps cascade on version deletion.
Requests and runs can reference inconsistent versions; run steps can reference
steps from another version. Quantities, actors, blockers, completion metadata,
and state transitions are insufficiently constrained. There is no approval
state, atomic run-start operation, or append-only transition history.

## Proposed database changes (not executed)

Before writing the next migration, inspect the target project's actual schema
and migration history. Preserve `001_init.sql` if already applied; use a forward
migration with a reviewed mapping/backfill plan for existing identities. For an
empty project, review and apply the initial schema and security changes together
in a transaction so there is no intermediate unprotected state.

### Identity and roles

- Use Supabase Auth identities. Add a unique `auth_user_id` foreign key from
  `app_users` to `auth.users(id)` while preserving existing profile IDs used by
  historical rows. Define deletion behavior to preserve history (restrict Auth
  deletion until an explicit anonymization/deactivation workflow is approved).
- Remove `pin_hash` from the exposed profile model. Do not migrate hashes into
  Supabase Auth passwords or expose them to either application role. The PIN UX
  still needs a separate server-side security design: approved identity/session
  mechanism, strong hashing in a private store if needed, rate limiting,
  lockouts, auditing, and recovery. No client-side PIN comparison or custom
  local-storage session is acceptable.
- Require an active staff profile on every authorized database operation.
  Provision identities and assign `management`/`bartender` through a trusted
  administrative process; users must never edit their own role or `active` flag.
  Do not authorize using user-editable Auth metadata. Prefer current database
  role/active checks so deactivation does not wait for a stale JWT to expire.

### RLS and grants

Enable RLS on all seven tables. Deny anonymous access to business data; revoke
unneeded grants and avoid broad `PUBLIC` function execution grants. Apply both
row visibility (`USING`) and write validation (`WITH CHECK`) where applicable.
Policies must check identity, active status, and role; hiding UI is insufficient.

| Resource | Active bartender | Active management |
| --- | --- | --- |
| Staff profiles | Read own safe profile fields | Read required staff profile fields |
| Recipes, versions, steps | Read approved recipes and versions needed for historical runs | Read production/recipe information; authoring/approval privileges require explicit scope approval |
| Batch requests | Read operational requests | Read and create requests through a validated operation |
| Runs and run steps | Read, start approved versions, resume, complete/block steps through validated operations | Read all production states; extra mutation permissions require explicit approval |
| Transition history | Read only as needed for visible runs | Read production history |

Neither role may directly delete history, edit published formulas, change staff
roles, or forge actor IDs. New audit/private tables need corresponding access
controls. Avoid recursive policies on `app_users`: if using a private role-check
helper, use a narrowly scoped `SECURITY DEFINER` function, fixed safe
`search_path`, qualified names, minimal grants, and no user-chosen identity.
The helper must derive the caller from `auth.uid()`.

### Recipe versioning

- Add a controlled draft/approved/retired lifecycle and approval metadata.
  Published or referenced versions and their steps must be immutable. Formula
  changes create a new version; retire recipes instead of deleting history.
- Keep `(recipe_id, version_number)` unique; require positive version numbers
  and step order. Validate positive output quantity and nonempty units.
- Replace destructive cascade paths for historical definitions with restrictive
  behavior and triggers that also prevent edits/deletion of referenced steps.
  Approval/authoring UI remains outside this implementation.

### Requests, runs, and steps

- Require positive requested/expected quantities and nonempty units; completed
  runs require actual output quantities consistent with an agreed zero-yield
  policy. Standard batches must resolve to a concrete version and quantity.
- Enforce that a run linked to a request uses that request's version and that
  every run step belongs to the run's version (composite foreign keys or
  transactional validation backed by triggers). Require unique step snapshots
  per run and copy steps atomically when starting a run.
- Create narrowly scoped database operations for request creation, run start,
  step completion/blocking, resumption, and readiness. Derive actor IDs from the
  authenticated profile; validate permitted roles, approved versions, quantities,
  and state transitions inside the transaction. Prefer invoker rights; if
  definer rights are needed, revoke public execution, restrict grants, fix
  `search_path`, and explicitly check identity/active role inside the function.
- Use row locking and idempotency for retries and concurrent bartenders.
  Preserve completed steps when resuming; require a nonempty blocked reason and
  accurate completion actor/time. Do not allow direct arbitrary status updates.
- Mark READY only after required steps and the documented readiness condition
  are met. Keep completed/ready production separate from work in progress.
  Define request fulfillment across multiple runs and cancellation permissions
  before implementing those transitions; do not assume one run per request.
- Add append-only transition events with server-derived actors/timestamps.
  Decide correction/cancellation semantics that preserve history rather than
  rewriting completed work. Index new identity/FK/policy lookup columns.

## Authentication work required before protected routes

On Next.js 15, implement `middleware.ts` for Supabase session refresh and cookie
propagation. Verify server identity using `auth.getClaims()` or `auth.getUser()`;
do not trust `getSession()` alone. Each sensitive server action/route must check
authorization in addition to database RLS. Ensure authenticated responses and
responses setting session cookies are not publicly cached. Cookie-write errors
are currently tolerated for Server Components; this helper is not a complete
authentication implementation.

## Manual Supabase configuration required

1. Confirm the intended development project and region, actual migration state,
   and whether any tables are already exposed. Use an isolated development
   project with synthetic fixtures for later policy tests; do not use production
   users or restaurant data for validation.
2. Obtain its Project URL and publishable key (`sb_publishable_...`) from the
   Connect dialog or Settings → API Keys. Set the two variables in `.env.local`.
   Do not put secret/service-role keys or database passwords in `NEXT_PUBLIC_*`.
3. Review Data API exposed schemas, grants, RLS, and Security Advisor findings.
   Keep business data inaccessible until the reviewed policies are installed.
   If the unprotected initial schema is already deployed, restrict access before
   adding data. The hosted Dashboard has now been inspected in read-only mode; see
   DEPLOYMENT_READINESS.md. No SQL or hosted changes were performed.
4. Choose the staff authentication method and approve the server-side PIN design
   before building that UX. Disable public self-signup and anonymous sign-ins
   for this staff-only application. Configure the intended Auth provider,
   production Site URL, and narrowly allowed local/preview callback URLs once
   the callback route is designed. Configure email delivery if the chosen flow
   uses email, and review session expiry, rate limits, and recovery.
5. Review/approve migrations and test RLS with anonymous, bartender, management,
   inactive, and unprovisioned identities before production integration. Include
   direct API bypass attempts, forged roles/actors, immutable recipe edits,
   mismatched version references, and concurrent/retried run operations.
   A successful connectivity probe does not establish any of these guarantees.

## Vercel environment change (manual; not performed)

In the `bar_tools` Vercel project's Settings → Environment Variables, add
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with the matching project's publishable
key for each intended environment (Development, Preview, Production). Retain
`NEXT_PUBLIC_SUPABASE_URL` and ensure each key matches its URL. Preview should
use an isolated development project.

Remove the old `NEXT_PUBLIC_SUPABASE_ANON_KEY` variable once consumers have been
updated. Set the new variable before deploying this branch: `NEXT_PUBLIC_*`
values are included at build time, so a new deployment/rebuild is required;
changing dashboard values does not update existing deployments. Keep any
rollback requirements in mind before retiring the legacy project key itself.
Renaming the environment variable does not revoke that key. Do not enter a
secret/service-role key into the publishable-key variable.

## Connectivity check

`npm run check:supabase` uses Node.js 24 to load `.env.local` if present (exported
environment variables take precedence). Both clients and the diagnostic read
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` through
`lib/supabase/config.ts`.

The command sends GET `/auth/v1/settings` with the publishable key in the `apikey`
header. This read-only public Auth configuration endpoint requires no application
tables, migrations, user session, or elevated key. Its successful response body
is discarded without inspecting or printing settings. HTTPS is required except
on loopback; redirects are rejected and the request times out after five seconds.
It is operator-run, not an HTTP route or build/CI hook.

Exit 0 verifies Auth API reachability only. Full-stack testing found that the
local Auth settings endpoint also responds to missing/invalid keys; a successful
probe does not validate the key, Data API availability, live database queries,
user authentication, or RLS.
Failures exit 1 and print fixed diagnostic categories: missing configuration,
invalid URL, invalid API key, authentication rejection, permission denial,
missing table, unavailable endpoint/service, rate limiting, timeout, or network
failure. Error JSON is read only up to 8 KiB for classification; raw messages,
details, hints, headers, URLs, keys, and response bodies are never printed.
Unknown 401s are not assumed to be invalid keys; `42501` can be a permission
error even with HTTP 401. Generic 404s are not assumed to mean missing tables.

### Investigation results

The previous probe used HEAD `/rest/v1/recipes?select=id&limit=0`. Although it
requested no rows, it still required the `recipes` relation created by
`001_init.sql`. A read-only zero-row diagnostic returned HTTP 404 / `PGRST205`,
meaning the relation is unavailable in the Data API schema cache. This is
consistent with unapplied migrations; it does not prove physical nonexistence
rather than an exposure/cache issue. No migrations were run to address it.

The Data API OpenAPI root `/rest/v1/` was also considered but returned 401.
Supabase restricts that endpoint with publishable keys, so it is unsuitable as
this diagnostic. No elevated keys or additional grants were introduced.

The final Auth settings probe succeeded against the configured project with exit
0. Twenty-one mocked safety tests cover endpoint selection, body discard, error
classification, network failures, and redaction. The diagnostic cannot replace
future authenticated database/RLS tests.

## References

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase SSR clients and session verification](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Managing Auth-linked profile data](https://supabase.com/docs/guides/auth/managing-user-data)
- [Database function security](https://supabase.com/docs/guides/database/functions)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)

- [Auth API specification (settings endpoint)](https://github.com/supabase/auth/blob/master/openapi.yaml)
- [Supabase OpenAPI restrictions](https://supabase.com/blog/supabase-security-2025-retro#openapi-spec-restricted-with-publishable-keys)
- [PostgREST error codes](https://docs.postgrest.org/en/stable/references/errors.html)
