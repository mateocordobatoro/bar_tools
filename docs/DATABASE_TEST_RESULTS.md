# Disposable database test results — 2026-09-18

Result: **passed on PostgreSQL 17.10**, running locally through a private Unix
socket. TCP listening was disabled. Every run created a fresh cluster, applied
001 + 002 in one transaction, exercised the database, then stopped and removed
the cluster. No connection to the existing Supabase project was made. No real
credentials, staff accounts, or restaurant data were used; `.env.local` was not
loaded. No migration changes were necessary after execution.

## Coverage

- Both migration files executed successfully, not just parsed.
- Catalog checks confirmed all seven public tables have RLS; anonymous and
  service-role table access is revoked; authenticated access is SELECT-only;
  function grants match the intended RPC surface; profiles contain no PIN hash.
- **54 behavioral assertions** passed: permission denials, profile filtering,
  draft visibility, management bootstrap restrictions, actor attribution,
  invalid/non-finite quantities, unit validation, exact recipe versions,
  immutable approved definitions, request/run idempotency, blockers, resumption
  by another bartender, readiness, partial fulfillment, audit protection, and
  immediate exclusion after deactivation. The fixture transaction rolled back.
- **Five concurrent-session scenarios** passed. Each test observed the competing
  backend blocked on a real PostgreSQL lock before allowing the first commit:
  1. Same request operation key produces one request.
  2. Same run operation key produces one run.
  3. Competing reservations cannot exceed requested output.
  4. Concurrent step updates serialize and preserve previously completed work.
  5. Deactivation waits for a write already in flight; the next write is denied.
- Concurrency fixtures were committed only inside the disposable cluster, which
  was stopped and deleted immediately afterward.

## What this does not prove

At the time of step 18, Docker and the Supabase CLI were unavailable on this machine.
Step 19 subsequently passed on the full local stack; see
[the stack report](SUPABASE_STACK_TEST_RESULTS.md). The harness uses
real PostgreSQL with the minimal contract in
`supabase/test-support/local-auth-contract.sql`: roles `anon`, `authenticated`,
`service_role`, relevant `auth.users` columns, and `auth.uid()` semantics. It also
reproduces permissive default grants to exercise their removal by migration 002.
This fixture is **not** the full Supabase Auth schema or service.

JWT identities are simulated through session settings. These tests prove the
SQL policies and functions under those database identities, not HTTP token
verification, login, cookies, email invitations, PostgREST exposure/schema
refresh, or compatibility with every managed Supabase extension/default.
The operator in this cluster is a PostgreSQL superuser; Supabase's hosted
operator has a different privilege model. Review of the actual development project's schema remains a deployment gate.
The existing Auth connectivity check is not a substitute for those tests.

## Reproduce locally without a remote database

The repository does not gain a PostgreSQL runtime dependency. Install the pinned
test-only packages outside it. Commands below match the tested macOS arm64 host:

```sh
npm install --prefix /tmp/bar-tools-db-test-runtime --cache /tmp/bar-tools-db-test-cache \
  --no-audit --no-fund @embedded-postgres/darwin-arm64@17.10.0-beta.17 pg@8.16.3
```

If npm blocks the binary package's postinstall, restore its bundled library
symlinks using its reviewed helper from the package directory:

```sh
(cd /tmp/bar-tools-db-test-runtime/node_modules/@embedded-postgres/darwin-arm64 && \
  node scripts/hydrate-symlinks.js)
```

Then, from the repository root:

```sh
BARTOOLS_PG_RUNTIME=/tmp/bar-tools-db-test-runtime \
  BARTOOLS_PSQL=/opt/homebrew/opt/libpq/bin/psql npm run test:database:local
```

The runner always initializes a fresh `/tmp/bar-tools-pg-*` directory, a private
socket directory, and synthetic database roles. It does not accept a remote
connection string or use the project's environment file. On normal success or
failure, it closes clients, stops PostgreSQL, and removes its own temporary data.
A sandbox may require permission for PostgreSQL shared memory and local sockets.
An interrupted/killed process can require manual cleanup of its specific temp
cluster; never point cleanup tools at an existing database directory.

Other operating systems need the matching `@embedded-postgres/<platform>-<arch>`
package at a supported version. The runner resolves that package automatically;
only macOS arm64 was tested here. Do not execute the local Auth contract fixture
against an existing database. Do not run this suite against production.

The behavioral SQL file remains compatible with its documented `psql` command
on an isolated Supabase test project. The Node harness supports only that file's
`\gset`/`\echo` metacommands; it is not a general-purpose psql implementation.

## Step 25: transactional deployment and failure injection

The harness now requires a real psql client (`psql` on PATH or `BARTOOLS_PSQL`
pointing to the executable). The embedded server package does not bundle psql.
Homebrew libpq 18.6 was installed for this check; it is a local tool, not an npm
application dependency. The command above uses its macOS Homebrew path.

Passed with psql 18.6 / PostgreSQL 17.10:

- SQL file failure after 001: exit 3 and original catalog restored.
- SQL file failure after 002 before commit: exit 3 and original catalog restored.
- SQL `-c` failure after 001: exit 1 and original catalog restored.
- Missing second input file: exit 1 and original catalog restored.
- Uncommitted schema invisible to another connection; disconnect before COMMIT
  restores the original catalog.
- Successful single psql transaction installs all seven tables, followed by
  catalog/security verification, 54 behavioral assertions and five concurrency
  scenarios, all passing. Synthetic fixtures roll back; temporary cluster removed.

The catalog snapshot compares public/private relation, type and function names,
private-schema presence, extensions, default ACLs and Auth user count. It is an
empty-database rollback test, not a general database checksum or backup test.
The command fixes search_path and sets lock/statement timeouts before 001.
No hosted credentials or environment files are loaded by this harness.

No COMMIT-acknowledgement-loss, hosted outage or backup restoration was tested.
The local Auth contract and superuser operator differ from hosted Supabase.
See [Step 25 recovery plan](PREVIEW_RECOVERY_PLAN.md) for uncertain outcomes and
approval conditions. Typecheck, production build, five static database tests,
21 probe tests and whitespace checks also passed during this step.
