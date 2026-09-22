# Full local Supabase stack — step 19

Result: **155 integration assertions/checks passed on 2026-09-19**. This count
includes safety guards on requests, not 155 independent scenarios. Both
migrations ran atomically against the real local Supabase catalog. No migration
changes were needed. The existing hosted project was neither contacted nor
modified. Synthetic Auth users and business records existed only in disposable
containers; `.env.local` was not loaded by the harness.

## Coverage

- Full CLI stack started without excluded services; service health checks passed.
- Seven MVP tables had RLS enabled after migration.
- Real Auth administration, password login, verified identities, refresh and
  logout; public signup disabled.
- Forged JWT rejected. Anonymous access denied. Inactive and unprovisioned
  identities excluded. Bartenders saw only their own staff profile; management
  saw provisioned staff.
- Direct table POST/PATCH/DELETE denied, including self-promotion. Private audit
  schema and bootstrap procedure unavailable through the public Data API.
- Draft recipes hidden from bartenders, approval restricted to management,
  approved recipe edits denied, exact version attached to run steps.
- Metadata role spoofing denied after session refresh. Negative quantity and
  premature completion rejected. Request/run retries remained idempotent.
- Start, complete, block, resume by another bartender, finish and request READY
  transitions succeeded; completion actor was derived from the authenticated user.
- `@supabase/ssr` persisted a real session with a cookie adapter and a new client
  verified that identity; sign-out succeeded.
- Deactivation denied database reads/writes immediately despite a still-valid
  Auth JWT; logout revoked refresh capability.

The earlier [PostgreSQL suite](DATABASE_TEST_RESULTS.md) additionally covers
54 SQL assertions and five deterministic concurrency scenarios. Those tests
use a minimal Auth contract; they were not rerun inside this HTTP suite.

## Findings and limits

The local CLI maps `[auth.email].enable_signup` to whether the email provider is
enabled. Setting it false also prevented existing users from logging in.
The harness now keeps that setting true, with global `[auth].enable_signup=false`
and anonymous sign-in disabled. Public signup rejection is tested. In the
hosted Dashboard, keep the email provider enabled while disabling new public
signups; verify these separate settings before deployment.

Auth `/settings` returned success even without a valid API key. The connectivity
command now reports **reachability only**, with key validity explicitly unverified.
The local gateway also accepted a valid JWT with an invalid publishable key;
RLS still used the verified JWT identity. An invalid key without a JWT was
denied at the protected table endpoint, but this alone cannot distinguish key
validation from anonymous-access denial. Do not use local results to claim
hosted gateway key enforcement. No permission or RLS rule was relaxed.

PATCH/DELETE permission tests use explicit row filters so the safe-update guard
does not reject the request before authorization is tested.

This is backend integration validation, not an implemented application sign-in
flow. Browser cookie attributes, Next.js callbacks/middleware, hosted SMTP and
invitations, Vercel redirects, and hosted extension/configuration parity remain
unverified. Storage, Realtime and Edge Runtime started, but no product behavior
for these deferred services was tested. The hosted preflight and the decisions
in [DATABASE_DEPLOYMENT.md](DATABASE_DEPLOYMENT.md) still require approval.

## Reproduce on macOS

Tested tools: Node 24, Supabase CLI 2.117.0, Colima 0.10.3, Docker CLI 29.8.1.
The CLI selected PostgreSQL 17.6.1.167, GoTrue 2.196.0, PostgREST 16.2,
Storage 1.72.1, Realtime 2.130.0, Edge Runtime 1.74.3, Kong 2.8.1,
Studio 2026.08.24-sha-8ec45b2, postgres-meta 0.99.0, Mailpit 1.30.2,
Vector 0.53.0-alpine and Logflare 1.50.6. Future CLI versions may select different
images; this report is evidence for the versions above.

```sh
brew install colima docker supabase/tap/supabase
colima start bar-tools-supabase --cpu 4 --memory 8 --disk 30 \
  --vm-type vz --activate=false --ssh-config=false --mount none
DOCKER_HOST="unix://$HOME/.colima/bar-tools-supabase/docker.sock" npm run test:supabase:stack
colima stop bar-tools-supabase
```

The harness creates a unique `/tmp/bar-tools-supabase-*` project, uses local
ports 56320–56324, 56327 and 8183, and never links a remote project. Run only one
instance at a time. It requires an explicit local Docker Unix socket. Admin
credentials are obtained in memory from this new local instance, never from
project environment files. Tokens, passwords and response bodies are not logged.
CLI logs are private files because CLI startup can print local credentials.

Success and ordinary test failures stop the generated stack with `--no-backup`,
removing its containers and data volumes. Success also deletes its temporary
files. Failures retain private diagnostics; never publish them. Abrupt process
termination can require manual cleanup: use `supabase stop --workdir` with only
the exact temporary directory printed by this harness, and `--no-backup`.
Never substitute the repository, a remote reference, or another project's path.

After this validation, the dedicated runtime contained no containers or volumes.
The VM was stopped; installed tools and cached images remain for repeat runs.
No changes were committed, pushed or merged.

## Repository checks

`npm run test:database` (5), `npm run test:supabase` (21),
`npm run typecheck`, `npm run build`, and `git diff --check` passed.
The production build loaded the local environment as Next.js normally does;
no Supabase requests were made by the current static pages.
