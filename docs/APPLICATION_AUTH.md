# Next.js authentication foundation

Implemented locally on `feat/supabase-foundation`. No application deployment,
hosted SQL, Auth-setting change or use of the four synthetic Preview users was
performed in this phase. This supersedes older notes saying app login is absent;
invitation/password recovery and the batching interface remain unimplemented.

## Routes and access

| Route | Behavior |
| --- | --- |
| `/login` | Email/password form for existing Supabase Auth accounts; POST Server Action. Generic errors; no public signup or PIN. |
| `/` | Server-verified role routing. |
| `/management` | Active management only; minimal welcome/logout page. |
| `/bartender` | Active bartender only; minimal welcome/logout page. |
| `/access-denied` | Authenticated account without active supported staff profile; logout available, no operational content. |
| `/auth/unavailable` | Safe retry/logout page for configuration, Auth or profile-query failures; no operational content. |
| `/auth/callback` | PKCE authorization-code exchange, then verified staff routing. Missing/invalid code produces generic login error; ignores browser `next`/redirect parameters. |

Next.js 15 `middleware.ts` calls Supabase `getUser()` to validate/refresh sessions,
updates incoming cookies for the render and outgoing cookies for the browser.
It is not the authorization boundary. Every protected page and layout uses
`requireStaff`; future data access and Server Actions must do the same. RLS/RPC
permissions remain the final database controls.

The server verifies identity through Auth, then selects the current `app_users`
row by the verified Auth UUID. Only active `management`/`bartender` profiles pass;
user metadata, form role fields and decoded cookie claims never supply the role.
Profile errors fail closed. React cache only deduplicates within one render;
there is no persistent profile/authorization cache. Changes to active/role take
effect at the next authorized server request (an already displayed page may remain
visible until navigation/revalidation; database RLS still controls each operation).

Authenticated pages are dynamic, Auth/profile fetches use no-store, and middleware
marks responses private/no-store. With @supabase/ssr 0.7 these cache protections
are explicit. Session cookies are HttpOnly, SameSite=Lax, root-scoped, and Secure
in production. HTTP localhost development works with `npm run dev`. The browser
Supabase helper is not used for Auth in this server-only flow; do not introduce
browser Auth state that depends on reading HttpOnly cookies without a new design.
Never enable public/CDN caching for personalized routes or Set-Cookie responses.

Login/logout are POST Server Actions with Next.js origin checks; no GET logout.
Logout revokes the current refresh session and clears cookies. It does not promise
instant expiry of already issued JWTs on other clients. On failed logout the app
shows an error rather than claiming success. Deactivation is enforced by current
DB profile and RLS, independently of JWT expiry. Supabase rate limits remain in
force; no account-specific authentication error or password is logged/rendered.

The callback uses PKCE with the SDK verifier cookie. A callback alone does not
implement invitations, password recovery or implicit-flow token fragments.
No invite, signup, OAuth or recovery initiation is included in the UI. Server-only
client modules cannot be imported into client components. No admin key is needed.

## Configuration and exact URL requirements for a later Preview deployment

Step 30 read-only findings and approval sequence are recorded in
[PREVIEW_DEPLOYMENT_PLAN.md](PREVIEW_DEPLOYMENT_PLAN.md). No hostname exists yet
for this branch's authentication build. Password-login tests need no Auth URL
change; the future Site URL below is for hosted default/email redirect flows.

Only these existing public variables are used:

- `NEXT_PUBLIC_SUPABASE_URL=https://mfwoutniamoldcieoqvc.supabase.co` in Preview.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the matching Preview publishable key.

Do not put secret/service-role keys or database credentials in the app environment.
Production `njhcumxecwrrpbmjfdti` is excluded. Vercel variables are build-time values
for browser bundles, so test a newly built version of this branch, not an old
scaffold. Keep Preview deployment protection enabled; review access for testers.

**The Vercel Preview hostname is not yet verified for this undeployed branch.**
Do not invent one or configure a broad wildcard. Record the actual approved
stable Preview origin when deployment is separately authorized. Required entries:

| Setting | Exact value / rule |
| --- | --- |
| Local Site URL (current development value) | `http://localhost:3000` |
| Local Redirect URL for PKCE | `http://localhost:3000/auth/callback` |
| If using 127.0.0.1 locally | `http://127.0.0.1:3000/auth/callback` must be separately allowlisted; use the same hostname throughout the flow. |
| Future Preview Site URL | The actual approved `https://<preview-host>` origin, without a path. |
| Future Preview Redirect URL | Exactly `https://<preview-host>/auth/callback`; substitute the verified deployment hostname, not this literal placeholder. |

The callback path is exact and is the only implemented code-exchange endpoint.
There is no need to allowlist `/management`, `/bartender` or arbitrary return URLs.
Password login itself uses no email redirect and needs no callback allowlist
change; the URL entries above are required before a future authorized PKCE/link
flow is tested. Stable Preview aliases avoid allowing every per-commit URL.

Keep Email provider enabled, public signup disabled, anonymous sign-in disabled,
email confirmation enabled, and existing refresh/reuse protections. Do not change
JWT lifetime, SMTP, redirects or providers as part of this implementation. Real
invitations/recovery require an approved recipient, SMTP/delivery validation and
additional UI/verification tests; no such messages were sent here.

Before live application testing, resolve the synthetic-manager access decision in
[PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md). Its credentials/sessions must not be
reused implicitly. The hosted database suite passing is not application test
approval, and the old empty-database harness must not be rerun.

## Local verification

- `npm run test:auth`: authorization/session/actions/cookie/callback unit tests,
  executing transpiled implementation with isolated Auth/Next mocks.
- `npm run test:auth:http`: real Next dev HTTP routes and Server Actions against
  an ephemeral loopback Auth/PostgREST stub. Overrides the two public env vars,
  never contacts hosted Supabase and never loads administrative credentials.
  Includes login, logout, expired-token refresh/cookie propagation, inactive and
  unprovisioned accounts, role separation, metadata distrust, cross-origin POST
  rejection and callback redirect safety. Starts/stops its own local processes.
- `npm run test:supabase`, `npm run test:database`, `npm run typecheck`, `npm run build`.

The HTTP stub intentionally simulates Auth; it is not a cryptographic JWT engine
or a substitute for the separately approved hosted application tests. Step 28
validated real hosted JWT/RLS behavior independently, before this UI existed.
CI includes the new local tests; no hosted integration harness is added to CI.

References: [Supabase SSR client setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
and [Next.js authentication boundaries](https://nextjs.org/docs/app/guides/authentication).

### Recorded validation — 2026-09-22

Passed: 32 auth unit tests, 28 real-Next/local-mock HTTP checks, 21 Supabase
configuration/probe tests, five database security-contract tests, TypeScript,
production build and git whitespace checks. The build marks all auth/operational
pages dynamic. Both SQL migration hashes still match the installed Step 27 files.
No hosted tests or queries were run in this application phase.

One HTTP check exposed a Next dev origin mismatch (localhost versus 127.0.0.1)
in the callback's absolute redirect. The final handler uses a fixed relative
Location, tested to stay on the application origin and ignore external next URLs.
Build required filesystem permission for Next's local preferences file; it passed
once that permission was granted. There were no build/type errors remaining.
