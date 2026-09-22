# BarThings

MVP stack: Next.js + TypeScript + Supabase + Vercel.

## MVP
- PIN login
- Roles: management / bartender
- Batch requests
- Batch runs
- Partial steps
- Blocked reasons
- Quantities
- Ready status

## Local setup
Use Node.js 24 (see `.nvmrc`) and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
`.env.local` before using the Supabase helpers. The current scaffold builds
without Supabase credentials.
Database migrations in `supabase/migrations/` are not run by setup or CI.

## Validation
```bash
npm run typecheck
npm run test:supabase
npm run test:database
npm run build
```

GitHub Actions runs `npm ci` and all four checks for pushes and pull requests.
The Supabase safety tests use mocked requests and need no database credentials.

## Supabase foundation
Run `npm run check:supabase` manually after configuring `.env.local` with a
Supabase project URL and `sb_publishable_...` key. It sends a read-only request
to `/auth/v1/settings`, discards the returned settings, and prints only a fixed
result category. It requires no application tables, migrations, or signed-in
users. The request times out after five seconds and cannot follow redirects.

Success verifies API reachability only. The Auth settings endpoint can respond
without validating the key; key validity, database queries, user authentication,
and RLS remain unverified. Failures distinguish missing configuration,
invalid URLs/keys, network failures/timeouts, permissions, unavailable endpoints,
and known missing-table errors. Raw errors, response data, URLs, and credentials
are never printed. Do not loosen access policies or run migrations for this probe.
The command is not run during builds or CI.

See [Supabase foundation](docs/SUPABASE_FOUNDATION.md) for the proposed database
security changes and required manual Supabase/Vercel configuration.

## Docs
See `docs/` for scope, architecture, UX, and design; `AGENTS.md` summarizes
development conventions.

Database deployment is manual and approval-gated. See [the runbook](docs/DATABASE_DEPLOYMENT.md).
`test:database` checks SQL security contracts offline; the database behavioral
suite has passed in disposable PostgreSQL. See [the test report](docs/DATABASE_TEST_RESULTS.md)
for `npm run test:database:local`, runtime setup, and Supabase-stack limitations.

For real local Auth/JWT/PostgREST integration, run `npm run test:supabase:stack`
with a dedicated Docker socket. See [full-stack validation](docs/SUPABASE_STACK_TEST_RESULTS.md)
for runtime setup, coverage, cleanup and hosted-environment limitations. This
suite creates and deletes a local instance; it never uses `.env.local`.

Before any remote SQL, complete the [deployment readiness review](docs/DEPLOYMENT_READINESS.md),
which tracks hosted configuration, deployment gates, invitations and Next.js login.

Production and Preview now use separate Supabase projects. See the [environment separation](docs/ENVIRONMENT_STRATEGY.md)
before any hosted migration or test fixtures.

Current environment mapping and verification: [Preview setup](docs/PREVIEW_SETUP.md).

Preview catalog and exact pending Auth/API changes: [Step 22 preflight](docs/PREVIEW_PREFLIGHT.md).

Read-only hosted SQL catalog inspection: [Step 24 results](docs/PREVIEW_CATALOG_RESULTS.md).

Initial Preview recovery procedure and residual risks: [Step 25 plan](docs/PREVIEW_RECOVERY_PLAN.md).

Application login, sessions, protected roles and Preview testing gates: [authentication foundation](docs/APPLICATION_AUTH.md).
