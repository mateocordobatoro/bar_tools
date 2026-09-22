# Step 30 — Controlled authentication Preview deployment

Read-only review: 2026-09-22. Deployment, commit, push, Auth changes and user
provisioning are **not authorized by this preparation step**. No hosted SQL or
hosted mutations were performed. Production Supabase `njhcumxecwrrpbmjfdti` is
excluded; the only application test backend is Preview `mfwoutniamoldcieoqvc`.

## Source and commit scope

Local branch: `feat/supabase-foundation`, HEAD `b66a8f9` (merged setup PR #1).
There are no foundation commits yet: the accumulated database foundation,
runbooks, test harnesses and Step 29 authentication implementation are working
tree changes. No open PR exists for this branch. GitHub repository
`mateocordobatoro/bar_tools` is public and its default branch is `main`.

Reviewed scope: Supabase public configuration rename/connectivity probe; secure
MVP migration 002 and read-only operator queries; local and explicitly gated
hosted test tooling; security/deployment evidence; Next.js login, callback,
session refresh/logout, database-derived authorization, protected role landing
pages and local auth tests. No batching UI, inventory or deferred integration
was added. Migration 001 is unchanged; neither migration was edited in this review.
The migration hashes remain those recorded in PREVIEW_INSTALLATION_RESULTS.md.

Review both tracked diffs **and untracked files** before staging; `git diff`
alone omits most of the foundation. Stage only reviewed paths, inspect
`git diff --cached`, and never force-add ignored files. The pre-report candidate
scan covered 69 tracked/nonignored files and found no literal secret keys, JWTs,
private-key blocks or credential-bearing PostgreSQL URLs. This bounded pattern
scan is not a guarantee against every possible secret format.

Keep `.env.local`, `.env*` except `.env.example`, `.next/`, `node_modules/`,
`*.tsbuildinfo`, `.vercel/`, `supabase/.temp/`, logs, private PostgreSQL service/CA
files and `/tmp/bar-tools-preview-*` artifacts out of Git. Ignore checks passed
for the generated/configuration paths; none appeared among commit candidates.
Synthetic UUIDs, project references and run tags in the runbooks are identifiers,
not credentials. Never add passwords, tokens or raw Auth responses to reports.

## Verified Vercel configuration

Dashboard project: `mateo-personal2/bar-tools`, connected to the GitHub repository
above. Evidence was read from Git, Environments, Environment Variables,
Deployments, Build and Deployment, and Deployment Protection settings.

| Item | Observed value |
| --- | --- |
| Production branch tracking | `main`; commits there create Production deployments |
| Preview branch tracking | Enabled, all unassigned branches; no custom environments |
| Preview custom domains | None attached |
| Deploy hooks | None |
| Build | Next.js preset, repository root, command overrides off, ignored-build behavior Automatic, Node 24.x |
| Protection | Vercel Authentication enabled, Standard Protection |
| Promotion checks | No checks configured; do not treat CI as a enforced promotion barrier |
| GitHub workflow | Local CI on push/PR, no deployment, migration or merge job |

Under these current settings, a push/PR from `feat/supabase-foundation` targets
Preview and does not automatically target Production. A merge/push to `main`,
manual promotion, `--prod` deployment or later configuration change is a separate
Production action and remains prohibited. This is not a guarantee against a
future administrator changing settings. **Pushing the branch itself authorizes
an automatic Preview deployment; it is not a publish-only step.**

| Effective project environment | Supabase configuration |
| --- | --- |
| All Pre-Production Environments, including Preview | `NEXT_PUBLIC_SUPABASE_URL=https://mfwoutniamoldcieoqvc.supabase.co`; `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` matches the locally configured Preview key by private hash comparison |
| Production | `NEXT_PUBLIC_SUPABASE_URL=https://njhcumxecwrrpbmjfdti.supabase.co`; existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` retained, value not revealed |

The complete project variable list has four entries, with no branch-specific
override shown; Preview Shared reports no linked variables. No admin key is
configured in that list. Preview's two public variables are ready for a new
build. Production still uses the legacy key name and is **not ready to receive
this branch**; adapting it requires a separate Production readiness decision.
Installed migrations in Preview do not imply Production has the same schema.

## Actual hostname and minimum Auth changes

No deployment for `feat/supabase-foundation` exists in the inspected deployment
list. The existing Preview `bar-tools-jan930cb0-mateo-personal2.vercel.app` is
commit `47bce1e` on `chore/project-setup`: it is the old scaffold and must not be
used as this authentication release. `bar-tools.vercel.app` is Production.
**The new authentication testing hostname is not yet available to verify.**
Do not derive a guessed alias from a naming convention.

After an explicitly approved push creates a deployment, record its deployment ID,
commit SHA, Preview target, generated URL and actual branch alias from Vercel.
Choose the verified branch alias for the entire test session, confirm it points
to that build, and avoid further pushes during testing. A branch URL moves to
later builds; an immutable deployment URL identifies one build. See
[Vercel generated URLs](https://vercel.com/docs/deployments/generated-urls).

Fresh read of **Preview** Supabase URL Configuration confirms Site URL
`http://localhost:3000` and no Redirect URLs.

- For the implemented email/password login, refresh and logout: **zero Auth URL
  changes required**. No email link/OAuth initiation exists in the application.
- For a separately approved real PKCE flow: add exactly the verified HTTPS
  Preview origin followed by `/auth/callback`. The literal full URL cannot be
  specified until the hostname above is verified. No wildcard, Production URL,
  `/management` or `/bartender` entry is needed.
- Site URL may remain localhost for the password test. Before future hosted
  email/default-redirect tests, propose setting it to the verified Preview
  origin; use explicit matching callback redirect options. Site URL is the
  fallback origin, not a substitute for the callback allowlist.
- `http://localhost:3000/auth/callback` is an exact optional local callback;
  adding it is unnecessary for the hosted password test.

The callback alone does not implement invitation, recovery or OAuth initiation.
A real successful PKCE test needs a separately reviewed initiation procedure;
testing missing/invalid codes now must not be reported as full PKCE success.
Keep signup disabled, Email enabled, anonymous sign-in disabled and confirmation
enabled; stop if unexpected Auth settings are needed. No settings changed here.
See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Synthetic identity plan — requires separate approval

Do not reuse the Step 28 harness or its four identities implicitly. Its manager
remains active; its bartender and inactive profile are deactivated; the fourth
Auth user is unprovisioned. Step 28 passwords were ephemeral and discarded, so
those accounts are not a ready-to-use application credential set. Existing
immutable fixtures and audit history must remain intact.

Recommended approval package, Preview only:

1. Explicitly approve isolation/deactivation of Step 28 manager Auth UUID
   `048235bd-f68b-4e2b-a603-c58eee75c99d` (profile
   `b612ae96-6b7b-4d2b-a2e7-9e7571e8fb55`) and confirm database denial afterwards.
   Retain its Auth identity, fixtures and history; do not delete or reuse it.
   This is a future administrative action, not part of this review.
2. Approve four new app-test identities under one unique run tag: active manager,
   active bartender, inactive staff, and unprovisioned Auth user. This avoids
   resetting passwords/reactivating old identities. Use synthetic `.invalid`
   emails and controlled administrative creation with confirmed email, without
   signup, invitations or real mail. Provision only the three necessary profiles
   through an approved operator procedure; no new business fixtures are needed
   for these landing pages. Do not run the first-manager bootstrap on this
   populated database.
3. Review the exact provisioning script and UUID allowlist before execution.
   Validate Preview reference before administrative requests. Keep any admin
   key and generated passwords in private local input/memory or an approved
   password manager, never app variables, command arguments/history, Git,
   screenshots or chat. Browser credential creation must be completed by the
   user if required by the local interface.
4. Record only run tag, synthetic emails/UUIDs, intended roles, timestamps and
   outcomes. Review inventory before later cleanup. Deactivation, session
   revocation and deletion require explicit approval; never auto-delete users
   or existing fixture/audit records. Define private credential disposal at the
   same time as provisioning approval.

Use an authorized Vercel tester session with deployment protection retained.
Use separate browser contexts for each account; never put Supabase admin
credentials or Vercel bypass secrets into the application. Do not use the old
active manager for application testing.

## Exact deployment and test sequence — after approval only

1. Recheck branch, remote, complete diff and ignored files. Run Node 24/npm CI
   checks from APPLICATION_AUTH.md against the final snapshot, with local mocks
   only; review staged paths and commit the approved foundation/authentication
   change on `feat/supabase-foundation`. No migration execution is part of build.
2. Recheck Vercel's `main` Production mapping and Preview variables immediately
   before pushing. With explicit approval for **push plus automatic Preview
   deployment**, run `git push -u origin feat/supabase-foundation`. Optionally
   open an approved draft PR targeting main; never merge or enable auto-merge.
3. Wait for GitHub CI and Vercel Ready. Verify commit SHA and environment Preview
   in the deployment record; review build/runtime failures without collecting
   secrets. Verify deployed configuration belongs to `mfwoutniamoldcieoqvc`
   before entering any test credentials. Stop on a mismatch or uncertain target.
4. Record actual URLs as described above. First perform unauthenticated checks:
   protected routes redirect to `/login`, login renders, invalid callback fails
   safely. These do not need test users or changed redirect settings.
5. Only after identity-plan approval and operator provisioning, test password
   login, generic invalid-password errors, server role routing, direct wrong-role
   routes, inactive/unprovisioned denial and browser metadata distrust. Verify
   logout and denial on subsequent protected navigation in each context.
6. Verify refresh after natural access-token expiry without changing JWT lifetime;
   validate HttpOnly/Secure/SameSite cookies and private/no-store responses by
   reporting attributes only, not token/cookie values. Back-navigation must not
   provide new authorized operational requests after logout.
7. With explicit approval limited to the **new** app-test bartender, deactivate
   its profile during a session and verify the next protected server request and
   database access fail. Record that final inactive state; do not reactivate or
   clean it up automatically. Do not modify any Step 28 bartender fixture.
8. Record pass/fail, exact SHA/URL, user inventory and remaining issues. Stop on
   unexpected writes, permission/configuration changes or Production traffic.
   Real PKCE/email, invitations/recovery, batching UI and Production rollout are
   separate work. No permission to promote follows from a successful Preview.

## Gates and outcome

Local Step 29 results remain: 32 auth unit tests, 28 HTTP checks against local
mocks, 21 Supabase tests, five database-contract tests, typecheck and build passed.
This step changed documentation only and passed `git diff --check`; it did not
rerun hosted tests or execute a deployment.

Ready to request a controlled commit/push/Preview-deployment approval. Remaining
gates are the deployment authorization itself, the not-yet-created hostname,
the old-manager isolation decision and exact synthetic provisioning/test
approval. The hostname gap blocks exact PKCE URL authorization, not building
the password-login Preview. No hosted application login success is claimed.
