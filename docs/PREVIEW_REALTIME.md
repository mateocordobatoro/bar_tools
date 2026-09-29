# Preview Realtime synchronization — 2026-09-28

## Hosted publication change completed

Authorized target: `mfwoutniamoldcieoqvc` (`bar_tools_preview`). The Dashboard
project URL was verified before each publication operation. Production was not
accessed or changed.

Existing `supabase_realtime` publication had zero members. Added only:

- public.batch_requests
- public.batch_runs
- public.batch_run_steps
- public.inventory_balances
- public.recipe_operational_settings

A read-only `pg_publication_tables` query after the changes returned exactly this
set, across all schemas. No Auth, private, audit or movement tables were added.
No publication-wide event flags were changed.

Before/after catalog fingerprints were both `ec6432d4f108bfb3d1d41caa18c3d45c`.
The comparison covers public/bar_private relation ACLs, RLS/forced-RLS flags,
policies, function ACLs/security-definer flags, and all default ACLs. Those
catalog values were unchanged. No migrations, grants or policies were executed.

## Implementation and release gate

The existing session cookies remain HttpOnly. `/api/bartender/events` verifies
Auth and the active database bartender profile, then opens a per-request Supabase
Realtime client using that user's token server-side. No service role is used.
Postgres Changes applies the user's SELECT/RLS permissions. Exactly the five
published tables have INSERT and UPDATE listeners; no DELETE or broad-schema
subscription is used.

The browser receives only `data: connected` (subscription ready) or `data: stale`
(actual database change) over same-origin SSE. Row payloads, tokens,
passwords and keys are not forwarded. The stream coalesces events for 250 ms;
the browser coalesces invalidations for 350 ms and refetches the existing
`/api/bartender` authoritative workspace and selected availability. There are no
client inventory, fulfillment or threshold calculations and no realtime writes.
Changes received during a read/write are retained for a trailing read.

Every subscription/reconnection requests a fresh snapshot. Streams close after
45 seconds (route maxDuration 60 seconds), then reconnect with fresh Auth/profile
verification. Browser reconnection uses bounded 3–30 second exponential backoff,
including recovery after non-200 stream responses. A 30-second visible-page read is a safety net for missed events,
access revocation and unavailable streaming. Server RLS still governs every event;
all data reads and actions continue to verify access. No claim is made that logout
revokes an already issued Supabase JWT instantaneously.

Subscriptions/timers are cleaned up on unmount/navigation; hidden pages close SSE,
visible/online pages reconnect. A normal logout leaves the workspace and closes
its connection. Refresh is no longer a normal UI action; Retry connection appears
only on a failed read. Existing production guards and blocked simulator remain.

Limits: each visible bartender tab uses a short-lived server streaming invocation
and one Supabase channel. Vercel streaming behavior, connection overhead, real
reconnect timing, and end-to-end latency still need hosted verification. This is
not yet an approved reactive Preview baseline.

## Validation and pending operator access

Local: 36 bartender/UI/API tests, 32 Auth tests, typecheck, production build and
`git diff --check` pass. Tests cover event coalescing, trailing reads during busy
work, cleanup, reconnect-triggered reads, external-stock suggestion updates,
exact subscription scope, access denial and payload/token non-disclosure.
These transport-mocked tests do not prove hosted Realtime delivery.

The local application at `http://127.0.0.1:3011` was verified configured for the
Preview URL; unauthenticated `/bartender` redirects to login. The operator subsequently restored private synthetic bartender access; browser
login and the visual Preview baseline were verified separately. Credentials are
not part of this document or commit.

Pending, not reported as passed:

- Authenticated real Realtime delivery and two-bartender continuation.
- Manager request appearing without refresh.
- Stock, missing-later-input and threshold/suggestion changes without refresh.
- Hosted disconnect/reconnect and inactive-user denial.
- Minimum additional synthetic fixtures/second bartender from the preceding task.

No additional fixtures or identities were created in this change. No existing
profile, inventory or retained history was modified. The existing Vercel Preview
still runs the previously approved UI; this implementation is uncommitted and
unpublished. To continue, recover the existing credential through its private
operator mechanism or separately authorize a scoped password reset with private
manual delivery. Never paste credentials into chat. A subsequent Preview release
and real-browser smoke test must precede calling this a live/reactive baseline.

Reference: https://supabase.com/docs/guides/realtime/postgres-changes

## Renewed preflight

The operator ran the read-only private psql procedure successfully. Transaction
read-only was on; the same exact five publication members and identical security
fingerprint above were returned, followed by ROLLBACK. No hosted configuration
change is needed. Hosted behavioral results remain pending; deployment alone
does not certify Realtime.
