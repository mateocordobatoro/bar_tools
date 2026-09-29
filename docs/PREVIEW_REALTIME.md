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

The implementation was subsequently committed as
`6ec69ee54857269e800388b528b8fb21d98950a9` and deployed to Vercel Preview.
GitHub CI passed. Hosted behavioral validation is recorded below; deployment
alone does not certify the live/reactive baseline.

Reference: https://supabase.com/docs/guides/realtime/postgres-changes

## Renewed preflight

The operator ran the read-only private psql procedure successfully. Transaction
read-only was on; the same exact five publication members and identical security
fingerprint above were returned, followed by ROLLBACK. No hosted configuration
change is needed. Hosted behavioral results remain pending; deployment alone
does not certify Realtime.

## Hosted validation attempt — 2026-09-28

Target remained `mfwoutniamoldcieoqvc`. Browser URL:
https://bar-tools-git-feat-supabase-foundation-mateo-personal2.vercel.app/bartender

The first procedure stopped before mutations: Vercel deployment protection
redirected its unauthenticated HTTP probe to SSO. Protection was left unchanged.
A separate procedure tested authenticated Supabase Realtime and PostgREST directly;
the existing authorized browser session independently observed the application.

Synthetic inventory tag: `BTRT-2a2b21ab-a9a3-497c-bb21-7f4c4b5cfc4b`.
Created exactly two Auth identities/profiles (management and a second bartender),
one input/account, one approved two-step recipe/version/stock identity, one
request for 1 batch, and one 1-batch run. The input count was initialized to
100 ml and batch stock to zero. Mix requires 100 ml; Finish requires another
50 ml. All data is synthetic. Credentials stayed in process memory; private
identity/object IDs are retained outside the repository in
`/tmp/bar-tools-realtime-hosted-v2/result.json`.

Observed results:

- Exact five publication members checked before provisioning.
- Manager request: direct authenticated Realtime event received; authoritative
  PostgREST result showed 1 batch remaining. The browser displayed it without
  a manual reload.
- The second bartender's run was created successfully. It appeared in the
  existing bartender's In Progress list without a manual reload. Opening it
  showed Mix as next and Finish as Missing inputs.
- The procedure STOPPED while waiting for the run-start Realtime event after
  reconnecting its direct subscriber. The RPC returned a run ID, but event
  confirmation did not pass within the configured wait. This does not establish
  whether the cause is transport/reconnection timing or another issue.
- Browser updates alone cannot distinguish SSE invalidation from the 30-second
  fallback. Do not present this attempt as full end-to-end SSE proof.

No step completion, stock completion, threshold change, reconnect integrity,
or inactive-user denial test was reached. No retry or corrective hosted write
was performed after STOP. Both NEW profiles remain active because the final
isolation phase was not reached. Existing identities and historical fixtures
were not modified. The synthetic run and request remain unfinished; no inputs
were consumed by step completion and no batch stock was produced.

Recovery: retain the run, profiles and audit history. Do not rerun provisioning.
Diagnose using this exact inventory and read-only checks; any continuation must
resume from verified current state with a dedicated procedure. Once testing is
finished, deactivate the two new profiles through the trusted operator process;
do not delete retained identities or fixtures automatically. No credentials are
recoverable from this report. Production was not accessed or modified.

Status: Preview deployment exists, but hosted Realtime validation is incomplete.
It is not yet an approved live/reactive baseline.

## Non-mutating diagnosis — 2026-09-29

No provisioning was rerun; no hosted write, new identity, request, run, step,
completion, deactivation or reset was performed in this diagnostic phase.

### What can and cannot be established

- The application architecture is Browser EventSource → Next SSE route → Supabase
  Postgres Changes. Browser code does not also subscribe to Supabase directly.
  The separate operator test client was independent test instrumentation.
- Both the deployed source and operator client register public.batch_runs INSERT
  and UPDATE, alongside the other four approved tables. There is no record-ID
  filter that could exclude this run. The operator waits for SUBSCRIBED before
  calling the write; its saved checks show that barrier passed before run start.
- The operator recorded all changes as just `stale`, without table, event type,
  timestamps or channel status history. The browser had no diagnostic logs.
  A successful generic signal around request creation is NOT table-level proof.
- Its run-start assertion required a signal AND absence of a channel-error flag.
  The catch replaced the actual assertion/error with a generic failure. Therefore
  STOP does not even distinguish no event from event plus channel error. It must
  not be characterized as proof that batch_runs INSERT was not delivered.
- The UI could have learned via batch_runs INSERT, batch_run_steps INSERT, the
  30-second fallback, a new SSE `connected` signal, an SSE error-triggered read,
  or visibility/online-triggered refetch. No retained evidence selects one.
- Source inspection of 005's start_run shows run/step INSERTs and private operation/
  production-history writes. It does not consume inputs, update inventory balances,
  fulfill/update the request, or change thresholds. Inventory UPDATE is not an
  expected consequence of this start RPC. Historical hosted trigger behavior still
  requires catalog verification rather than assumptions from source alone.
- Source policies permit an active staff member to SELECT runs/steps. The prior
  security fingerprint matched, but this is not a new live RLS/token test.
- The operator calls asynchronous realtime.disconnect() without awaiting it before
  reusing the same client. The installed SDK connect() skips connection while
  disconnecting. This is a concrete lifecycle weakness and a candidate explanation,
  NOT a proven cause of this occurrence (SUBSCRIBED did pass before the write).
  The application uses a fresh Supabase client for each SSE request, so this exact
  reuse pattern is specific to the operator procedure.

Historical root cause and exact triggering event remain undetermined. A new
read-only preflight was requested to reconfirm publication members, publication
INSERT/UPDATE flags, run/step RLS and SELECT grants, and retained fixture/profile
states. At the time of this entry it has not returned; the latest retained
successful catalog evidence is September 28. Do not claim a fresh confirmation.

### Local diagnostics and tests (not deployed)

`BARTENDER_REALTIME_DIAGNOSTICS=1` opts the already Preview-only, authenticated
SSE route into diagnostic logging and named diagnostic SSE messages. Default is
OFF; no hosted environment variable was changed. Records contain a random
connection ID, timestamp, phase, channel status and filter-derived schema/table/
eventType. No rows, record IDs, JWTs, passwords, keys or raw error payloads are
logged. The browser allowlists this metadata and logs refetch causes and
start/applied generations. Named diagnostics do not trigger reads themselves.

Logs distinguish subscribe, SUBSCRIBED/CHANNEL_ERROR/TIMED_OUT/CLOSED, cleanup,
each database event before coalescing, emitted invalidation, reconnect scheduling,
and refetch reasons (SSE connected/stale/error, fallback, visibility, online).
Late callbacks from an obsolete browser EventSource now cannot close or invalidate
its replacement. No RPC, inventory, fulfillment or RLS semantics changed.

Local checks: 39 bartender/UI/API tests and 32 Auth tests passed; typecheck,
build and git diff --check passed. Added cases exercise batch_runs INSERT and
related step INSERT, pre-subscription Auth barrier, per-event traces before
coalescing, all terminal statuses, cleanup and new subscription, cancellation
with diagnostic output, metadata privacy, and stale-source callback isolation.
These are injected-transport tests, not new hosted delivery evidence.

### Next proof gate

Existing rows cannot replay their historical INSERT via a new subscription.
First inspect the read-only catalog and observe subscribe/reconnect with the
instrumented path; this needs no domain mutation. If live INSERT delivery remains
unproven, request approval for exactly one new call to start_multistep_run for the
existing synthetic version 44ea8da4-c524-46cb-b183-7c653d351637, quantity 1, with a
fresh operator-held idempotency key, only after live authenticated subscriptions
report SUBSCRIBED. That would create one additional run and its two step rows,
without completing steps or consuming inventory, while preserving the current run
and request. Expected signals: public.batch_runs INSERT and two
public.batch_run_steps INSERTs. A no-op UPDATE or retried original idempotency key
cannot prove the INSERT path. This proposed call is NOT authorized by the current
non-mutating task and has NOT been executed. It cannot retroactively identify the
old UI refetch cause; it can establish the next event path prospectively.

No commit, push or deployment was made for these diagnostics. Realtime remains
partially tested, not validated as a live/reactive baseline.

## Read-only preflight completed — 2026-09-29

Operator procedure: `/tmp/bar-tools-realtime-readonly-20260929/check.command`.
Result exit code 0, BEGIN READ ONLY, read_only=on, final ROLLBACK.
TLS/service guard targets Preview `mfwoutniamoldcieoqvc` with verify-full.

A. Publication contains exactly batch_requests, batch_runs, batch_run_steps,
inventory_balances and recipe_operational_settings, all in public. puballtables
is false. INSERT/UPDATE flags are true; existing DELETE/TRUNCATE flags are also
true. Application listeners remain INSERT/UPDATE only. No flags were changed.

B. All five tables have replica identity DEFAULT and a primary key: id for
requests/runs/steps, account_id for balances, recipe_id for settings. These support
the new-record INSERT/UPDATE invalidation path. REPLICA IDENTITY FULL is not needed
for this path; no previous-row payload is consumed. See official guidance:
https://supabase.com/docs/guides/realtime/postgres-changes

C. All five tables have RLS enabled and authenticated SELECT granted. FORCE RLS
is false, but the scoped test role is authenticated with bypass_rls=false.
Security fingerprint remains ec6432d4f108bfb3d1d41caa18c3d45c, matching the prior
baseline. Request/run/step/settings policies require an active staff role;
balances additionally require a visible matching inventory account.

D. After verifying the original bartender profile maps to the expected Auth ID,
the transaction switched locally to authenticated and supplied that identity's
claims. SELECTs under that RLS scope returned the exact retained OPEN request
(1 batch), IN_PROGRESS run (1 batch), both PENDING steps, both initialized balances
(input 100, prepared stock 0), and the recipe's operational-settings row. The
original bartender plus the two newer synthetic profiles remain active.
This is a database RLS-scope test, not a fresh signed JWT/PostgREST/WebSocket test;
setting local claims does not verify an actual token or its expiry.

E. Browser EventSource connects only to /api/bartender/events; the server owns the
Supabase subscription. A visible mounted workspace separately queues a full
/api/bartender read every 30 seconds even while SSE is healthy. That read reloads
requests, runs/steps, stock, prep overview and run availability; a selected recipe
also reloads quantity-specific availability when fetchedAt changes. Hidden pages
skip interval reads and close SSE. Visibility/online and SSE connected/error also
invalidate. Signals coalesce for 350 ms, queue behind reads/writes and preserve a
trailing read; actual reads therefore need not occur exactly every 30 seconds.
Server database signals coalesce for 250 ms. Polling can explain the historical UI
update; this preflight cannot recover the old triggering cause.

F/G. Local, unpublished opt-in diagnostics distinguish channel status, table,
event type, timestamp, connection UUID, and refetch reason/generation. However,
record IDs are deliberately absent and browser logging activates only after the
first diagnostic SSE message. Thus polling before a working SSE connection is not
fully observable. Instrumentation must cover that bootstrap and a safe synthetic
record identifier before the proposed live INSERT test. No diagnostic environment
flag or deployment was changed. Old EventSource callbacks are guarded against
closing/invalidating a replacement; unmount clears timers/listeners and closes the
source. Server requests use fresh clients. The old operator harness's unawaited
client disconnect must not be reused; it remains evidence, not a runnable recovery
procedure. No claim of deterministic hosted reconnection is made from local tests.

H. Publication/identity/grants provide no observed configuration blocker for this
scope. To prove future live INSERT delivery (not reconstruct history), one new
controlled start_multistep_run RPC is still needed after complete diagnostics and
subscription readiness are verified. Proposed call: existing synthetic version
44ea8da4-c524-46cb-b183-7c653d351637, 1 batch, fresh idempotency key, existing active
synthetic bartender. It creates one additional run, two PENDING step rows and
normal operation/audit records; it may link to the existing OPEN request but does
not fulfill it. Expected public.batch_runs INSERT and batch_run_steps INSERT traces
precede coalesced invalidation, sse-stale refetch and the new In Progress card.
Multistep start does not consume ingredients or produce stock; those happen on
step completion, which is excluded. Current request/run must remain intact.
No such RPC was executed. Explicit approval remains required, and diagnostics
readiness is a prerequisite rather than something this preflight has established.

No hosted writes, new users, fixture changes, commit, push or deployment in this
preflight. Production untouched. Stop pending the next explicit authorization.

## Local attribution instrumentation completed — 2026-09-29

This entry supersedes the instrumentation gaps noted in the preflight above.
The Preview-only server page passes a non-secret diagnostic boolean to the
workspace from BARTENDER_REALTIME_DIAGNOSTICS=1. Both server and browser logging
remain opt-in and default off. The browser can now trace initial-load and polling
before any SSE message arrives. No environment setting was changed or deployed.

Each received database-event trace contains connection UUID, channel status,
schema, table, INSERT/UPDATE event type, recordId (UUID primary key only),
eventTimestamp (normalized commit_timestamp or null) and receivedAt (local server
time). The table-specific ID source is id, account_id or recipe_id. No other
payload fields, credentials or raw errors are serialized. The client adds its
connectionGeneration and local timestamp after allowlisting the diagnostic fields.
Malformed/non-UUID identifiers become null. Lifecycle records use the same
connection UUID and timestamp and a phase marker.

Every workspace refetch logs start and applied/discarded/failed outcomes, timestamp,
read generation and its causes. Each cause has exactly one of initial-load,
sse-stale, polling, user-action, reconnect-recovery; SSE causes also carry the
connection generation and server connection UUID when available. Coalesced causes
are retained together rather than misleadingly picking one. Quantity-specific
availability reads also identify their resource and causes. Diagnostic messages
alone never invalidate or write state.

Polling remains every 30 seconds while visible, even with healthy SSE. To prove
SSE delivery, correlate the safe new run ID in database-event, the emitted
invalidation, and a refetch-applied whose causes contain sse-stale and no polling
or reconnect-recovery. Confirm that this occurs before the next polling
invalidation; a mixed-cause refetch is inconclusive and must not be called SSE-only.

Replacement first revokes old EventSource authority, calls its synchronous close,
and increments generation before constructing the replacement. Old callbacks,
queued SSE-only causes and in-flight responses from replaced generations cannot
apply snapshots or redirects. Unmount also invalidates pending read generations.
Server cancellation returns a promise that waits for channel removal followed by
WebSocket disconnect. Each SSE request owns a fresh Supabase client. Browser close
settling is not an acknowledgement that a separate remote Vercel worker has
physically finished teardown; remote sockets may briefly overlap, but only the
current browser generation is authoritative. Do not reuse the old operator script
or its unawaited disconnect pattern for a future test.

Validation: 40 bartender/Realtime/UI/API tests and 32 Auth tests pass, plus
TypeScript, production build and git diff --check. Tests cover exact run/step
INSERT metadata, coalesced events, polling before SSE bootstrap, SSE-only and mixed
attribution, direct user refresh, ignored old callbacks and old read responses,
reconnect replacement, cancellation awaiting removal/disconnect and cleanup.

Ready locally for an authorized instrumented Preview release and then hosted
validation. This is not hosted validation itself. No commit, push, deploy, hosted
configuration change, new run or other domain mutation was performed.
