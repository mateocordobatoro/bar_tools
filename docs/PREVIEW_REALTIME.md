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

## Diagnostic Preview release — 2026-09-29

Commit: 711081c0a9bf4542971d2ba8b610f8993a20fa74.
Branch pushed: feat/supabase-foundation. Exactly six approved diagnostic files
included; all unrelated pending files remained unstaged and uncommitted.
Isolated staged-tree checks passed: 40 bartender/Realtime/UI/API, 32 Auth,
typecheck, build, git diff --check. GitHub Actions success:
https://github.com/mateocordobatoro/bar_tools/actions/runs/36604571525

Vercel deployment DgCvfL2fVu9Z6SURE4bxrEqb2m6C reached Ready as Preview:
https://bar-tools-nuw07byyy-mateo-personal2.vercel.app
Stable alias:
https://bar-tools-git-feat-supabase-foundation-mateo-personal2.vercel.app/bartender
Production branch was confirmed main. Preview Supabase URL was verified as
https://mfwoutniamoldcieoqvc.supabase.co. Production settings were not modified.
BARTENDER_REALTIME_DIAGNOSTICS=1 was added as a non-secret Config variable scoped
ONLY to Preview branch feat/supabase-foundation, with Production and Development
unselected. No Supabase settings or data were changed.

Hosted read-only observations:
- Existing original bartender session loaded PREP and retained synthetic state.
- Authenticated navigation to /management redirected to /bartender; session persisted.
- Vercel runtime logs confirmed /api/bartender/events status SUBSCRIBED, connection
  06d3df4b-e020-4858-b832-090dfc9626d4 at 2026-09-29T17:26:06.396Z.
- Workspace reads were logged at 17:26:03.987, 17:26:07.135 and 17:26:34.344 UTC.
  This is consistent with initial load, connection recovery and 30-second fallback,
  but request timestamps alone do not prove client trigger attribution.
- Client diagnostics emitted from initial load, but the browser inspection tool
  renders their object arguments only as `[bartender-sync] Object`. Therefore
  trigger fields/generations cannot be independently inspected with this tool.
  Server logs already use JSON strings and their sanitized status fields are visible.
- No new database event was deliberately caused. sse-stale and safe record IDs/commit
  timestamps were NOT validated on a live event. Their local tests passed.

Blocking observability issue: serialize the allowlisted client diagnostic object
as JSON text so the browser log collector retains attribution fields. This is a
proposed follow-up, not included in this already published commit. Until it is
resolved and the initial/polling/reconnect traces are inspected, do not declare
hosted diagnostic readiness or authorize a test mutation based on this release.
No new users/request/run, inventory/step operation, merge, Production deployment
or database mutation was performed. This release-result entry remains local and
uncommitted; no second commit/push was made.

## Diagnostic serialization release and read-only smoke — 2026-09-29

The text-only log collector limitation above is resolved by commit
1496dd4f1ff47f8278060e0c9c7281162ce1362a on feat/supabase-foundation.
Only lib/bartender/use-workspace.ts and scripts/bartender.test.mjs changed:
JSON serialization plus a regression assertion for a string log argument.
Isolated staged-tree validation passed: 40 bartender/UI/API/Realtime tests,
32 Auth tests, typecheck, build and diff checks. GitHub Actions success:
https://github.com/mateocordobatoro/bar_tools/actions/runs/36605669346

Vercel 73JLijUu9F8nEsY3pM2MT8tZeXQL is Ready, environment Preview, commit 1496dd4.
Immutable URL: https://bar-tools-4yfr69k50-mateo-personal2.vercel.app
Stable URL: https://bar-tools-git-feat-supabase-foundation-mateo-personal2.vercel.app/bartender
The existing branch-only diagnostic flag was retained. No further environment,
Supabase or Production changes were made.

Hosted JSON traces (UTC, browser clock):
- 17:48:26.781 initial-load workspace refetch-start, applied 17:48:27.653.
- 17:48:27.331 server SUBSCRIBED, connection 02762901-ee3c-4211-b548-9bfaecf5922a,
  client generation 1; server receivedAt 17:48:27.391 (different clock).
- 17:48:27.696 reconnect-recovery refetch-start with generation/connection,
  applied 17:48:28.373.
- 17:48:51.163 user-action availability read after View Recipe, applied
  17:48:51.862. No Start Batch control was used.
- 17:48:56.783 polling invalidation (30 seconds after initial load), workspace
  refetch-start 17:48:57.135, applied 17:48:58.514. Selected availability also
  refetched with polling attribution. No manual refresh triggered this cycle.
- 17:49:12.130 normal 45-second server cleanup observed; another connection
  e9823299-918b-416f-b6ce-a02340b348ac reached SUBSCRIBED at 17:49:16.739,
  client generation 3. No CHANNEL_ERROR/TIMED_OUT was required to induce recovery.

Reload retained the original bartender session. Visiting /management redirected
back to /bartender on this release. PREP loaded the retained request/run state.
Observed diagnostic entries contain only the allowlisted lifecycle/attribution
metadata. No credentials or full rows were present in the observed traces.

No domain write was performed, so no new sse-stale event/record ID/commit timestamp
was claimed as hosted-tested. Exact run/step INSERT metadata and sse-stale attribution
remain covered locally and are the target of the separately authorized future
single-RPC test. Use client timestamps for ordering polling versus SSE application;
server and browser wall clocks are not assumed identical.

Diagnostic readiness: sufficient to proceed to a controlled INSERT test AFTER
explicit authorization. It is not proof that live run INSERT delivery passes.
No remaining hosted-only observability blocker found in this read-only smoke.
No new users, requests, runs, fixture changes, inventory operations, merge or
Production deployment. These result notes remain local/uncommitted.


## Single authorized run-start observation — 2026-09-29

Outcome: PARTIAL / STOP. Exactly one authorized start was performed. No retry,
step completion, blocker, cleanup, new provisioning, commit, push or deployment.
Preview only (mfwoutniamoldcieoqvc); Production was not accessed.
Vercel Preview deployment 73JLijUu9F8nEsY3pM2MT8tZeXQL was Ready and linked
both the stable feature hostname and commit 1496dd4f1ff47f8278060e0c9c7281162ce1362a.

The existing original Step 33 bartender session was used in two tabs: one writer,
one passive observer. These were two sessions/views of the same identity, not a
new test using a different bartender identity. The writer selected the existing
BTRT multistep version and 1 batch, then clicked the final Start Batch exactly once.

Read-only before/after snapshots via the private verify-full Preview psql service
confirmed all eleven verifier assertions passed:
- New run: 6d38ce08-19e8-4825-8386-37339fb42b82; IN_PROGRESS; 1 batch.
- Version: 44ea8da4-c524-46cb-b183-7c653d351637 (selected existing fixture).
- Actor profile: 06b46cb1-b87d-45d4-8b5c-36d58fd2d889.
- Fresh operation key: 754a7d36-0a7d-423a-bbbc-014bd36ba206.
- Two new PENDING steps: 3c1cd1b5-361a-4108-af5c-9638d41e7d25 and
  5a62c116-0c66-4e2b-949b-c0039d920e76.
- Retained old run unchanged; existing profiles unchanged.
- Raw ingredient balance 100 and stock balance 0, both revision 1, unchanged.
- Request df2f197b-32e7-4944-a7cd-8270fe43e34b remains OPEN, quantity 1;
  fulfillment records remain empty. New run has the normal automatic association.
- Exactly the five approved operational publication members remain present.

Writer trace (client UTC timestamps, connection generation 1,
connection f6e87ec2-a3b2-4f7f-93c7-c5e6dca18872):

| Time | Evidence |
| --- | --- |
| 20:49:27.375 | SUBSCRIBED |
| 20:49:54.843 | user-action workspace refetch-start |
| 20:49:54.881 | public.batch_runs INSERT; recordId=null; eventTimestamp=null; server receivedAt=20:49:54.941 |
| 20:49:54.891 | Two public.batch_run_steps INSERT diagnostics, each recordId=null/eventTimestamp=null; receivedAt=20:49:54.941 |
| 20:49:55.178 | One coalesced sse-stale invalidation |
| 20:49:55.348 | user-action workspace refetch-applied |
| 20:49:55.530 | sse-stale-only workspace refetch-start, read generation 4 |
| 20:49:55.953 | sse-stale-only workspace refetch-applied |
| 20:49:56.845 | polling invalidation |
| 20:49:57.197 | polling workspace refetch-start |

The SSE-only read started 1.315 seconds and finished 0.892 seconds before the
writer polling invalidation. Three related event diagnostics coalesced into one
SSE invalidation/read; no duplicate run was created. The writer's initial UI update
cannot be attributed exclusively to SSE because its direct user-action read applied
first. Record UUID and commit timestamp were NOT successfully captured from the
Realtime payload. Do not substitute the read-only database UUID for event evidence.

Passive observer (generation 1, connection 2e11b12a-b670-4e26-9a8d-fa3e1b4040aa):
SUBSCRIBED 20:49:08.951; polling 20:49:37.345, read applied 20:49:38.259;
next polling boundary approximately 20:50:07.345. Normal 45-second server expiry
occurred at 20:49:53.654, before event delivery to the writer. Recovery read started
20:49:54.006 and applied 20:49:54.605. New generation 3, connection
 ae95fa6a-d377-4371-a3f5-6f878f4b2de8, subscribed 20:49:56.999; its recovery
read applied 20:49:57.888. Observer PREP then showed 2 batches underway without
manual refresh. No database-event or sse-stale trace was captured on this observer.
Its update is explained by reconnect-recovery, not polling or proven SSE delivery.
The DOM was not sampled between the two recovery reads, so which recovery read
first displayed the run was not established.

Limitations and stop condition:
- The observer was subscribed when checked before the click, but expired during
  the execution window. The pre-write check did not ensure sufficient lifetime
  headroom. Cross-tab SSE-only UI attribution therefore did not pass.
- Writer INSERT callbacks and SSE refetch are confirmed, but safe event record ID
  and commit timestamp are null. Their extraction requires local investigation;
  this observation alone does not establish whether the SDK payload shape or
  diagnostic extraction caused the missing fields. Do not log full payloads.
- This is not full Realtime validation or approval of a live/reactive baseline.
  Preserve the new run and all fixtures. No further mutation is authorized.
- Next work should first investigate the safe metadata extraction locally and
  improve the observation window around reconnect expiry. Any additional hosted
  write requires separate explicit approval.

Private read-only evidence files: /tmp/bar-tools-one-run-observation/before.json,
after.json, verification.json. No credentials are included. Results documented
locally only; no source behavior was modified.

## Local-only metadata/lifecycle diagnosis — 2026-09-29

No hosted access or mutation in this phase. Retain run
6d38ce08-19e8-4825-8386-37339fb42b82 and all existing fixtures.
The writer's INSERT -> sse-stale -> authoritative read before polling is proven.
Its earlier user-action read means SSE was not proven to cause the *first* paint.
The outstanding scenario remains a different bartender's change delivered to a
stable passive observer via SSE, with no recovery/polling explanation.

### Null fields: established facts and uncertainty

Installed and lockfile versions match: supabase-js/realtime-js 2.116.0,
@supabase/phoenix 0.4.5. The installed RealtimeChannel transform takes the wire
`{ids, data}` envelope and supplies the registered callback with:
`schema`, `table`, `eventType`, `commit_timestamp`, `new`, `old`, `errors`.
An offline test feeds synthetic INSERT and UPDATE wire messages through this
actual installed SDK channel/transform/filter/callback path without subscribing
or opening a socket. Both produce new.id and commit_timestamp correctly.

Consequently, the exact cause of hosted recordId/eventTimestamp=null is NOT
established locally. The prior hosted logging discarded payload shape. We cannot
recover that evidence without a future event, and must not claim a reproduced
SDK regression or that these changes conclusively fix the hosted nulls.

New helper accepts only matching public table/event metadata in either:
- Normalized callback: new.id (new.account_id for inventory_balances,
  new.recipe_id for recipe_operational_settings), commit_timestamp,
  schema/table/eventType.
- Documented wire envelope: data.record.<same primary-key column>,
  data.commit_timestamp, data.schema/table/type, with an ids array.

Only a UUID is retained as recordId. INSERT and UPDATE both use the new record;
we do not borrow an old row ID. Unknown/mismatched shapes return null metadata.
Only a valid supplied commit_timestamp becomes eventTimestamp. It explicitly
means database commit time, never receipt time. receivedAt is separately generated
on the SSE server and timestamp on the browser. No full row, arbitrary field,
credential or raw error is logged. No dependency version was changed.

### Observer reconnect cause

The route deliberately executes setTimeout(dispose, 45000). Its subscribe receive
time 20:49:08.713 and cleanup receive time 20:49:53.713 differ by exactly 45s.
Cleanup reported SUBSCRIBED, not CHANNEL_ERROR/TIMED_OUT. This is affirmative
evidence of normal application-request expiry; no evidence supports Vercel timeout,
Auth refresh, browser visibility or stale-generation protection as the initiating
cause. The route exports Node runtime/maxDuration=60. Vercel's documented duration
includes time spent streaming; heartbeats do not extend it.

Server cleanup revokes authority, clears debounce/expiry/heartbeat, removes the
abort listener, removes the channel, and disconnects its socket. Response EOF leads
to EventSource.onerror; the client explicitly closes that source (cancelling native
retry), revokes its generation, performs a recovery read, and opens a replacement
after 3s. Later failures back off to 30s. Browser close is synchronous; server
transport disposal is asynchronous and is not acknowledged to the browser. Existing
source/generation guards remain necessary even if server cleanup overlaps.

Auth is reverified on each route connection. The captured session token is not
refreshed in this dedicated Realtime client. Existing middleware/session handling
remains unchanged. Request abort/cancel and terminal channel status also dispose
the stream, but were not observed as this event's cause.

### Local changes

- Added 15s SSE `: keepalive` comments while idle. No application data and no
  message/invalidation event. They can help idle transports but do not fix the
  deliberate 45s gap. No lifetime, runtime setting or retry delay was increased.
- First connected acknowledgement is now attributed initial-load (also repairs
  the initial-read/subscription gap). Only replacement connections use
  reconnect-recovery. Duplicate connected acknowledgements are ignored.
- Polling remains every 30s when visible, even with healthy SSE. SSE/recovery,
  user-action and polling causes remain separate; coalesced causes remain explicit.
- Old-source callbacks and obsolete in-flight SSE reads remain rejected.

Files: app/api/bartender/events/route.ts, lib/bartender/realtime-metadata.ts,
lib/bartender/use-workspace.ts, scripts/bartender.test.mjs, this document.

Validation: 42 Realtime/UI/API tests, 32 Auth tests, typecheck, production build,
and git diff --check pass locally. Tests cover actual SDK INSERT/UPDATE transforms,
wire fallback, absent/invalid timestamp, invalid UUID, alternate primary keys,
metadata mismatch rejection, idle keepalives preserving the channel, cleanup,
initial vs replacement handshake, stale callbacks/reads, SSE/poll attribution and
related-event coalescing. These tests do not reproduce Vercel idle behavior or
prove a hosted payload fix.

### Future observer proof procedure (not executed or newly authorized)

Use distinct existing synthetic bartender identities in writer and observer sessions.
Before any write, verify observer visible, SUBSCRIBED, stable generation N and
connection UUID. Record subscribe/receive time, most recent poll and the next 30s
boundary. Wait for all initial/recovery/poll reads to settle. Require at least 20s
before the route's scheduled expiry and 15s before next poll; otherwise wait for
another window WITHOUT writing. Execute only once while those conditions still hold.
Capture matching run UUID + supplied commit time on generation N, sse-stale-only
read and UI application before polling, with no generation change or recovery cause.
Abort attribution if a disconnect occurs; preserve data and never repeat a write.

A further explicitly authorized single mutation is still needed for the remaining
cross-identity observer proof, after diagnostic code publication is separately
approved. No new write is authorized by this local diagnosis. If the safe metadata
remains null, stop and investigate rather than fabricate identity/time evidence.

References: [Supabase Realtime protocol](https://supabase.com/docs/guides/realtime/protocol),
[Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration),
[Vercel streaming](https://vercel.com/docs/functions/streaming-functions).

## Local lifecycle correction — no periodic application rotation

This section supersedes the prior local diagnosis's retained 45s-expiry behavior
and its future proof-window instructions. Not deployed; no hosted access/writes.

Removed `expiry = setTimeout(dispose, 45000)` and its timer bookkeeping from
app/api/bartender/events/route.ts. A healthy SSE request now has no application
age limit. It ends on request abort/cancellation, a terminal Realtime channel
status, transport enqueue failure, or actual runtime/network termination. The
15s `: keepalive` comment remains: no business data, no message event, no refetch.
Cleanup still removes its interval and awaits channel/socket disposal.

The browser no longer closes/replaces a healthy EventSource for visibility or
online notifications. Those notifications can reopen an absent source when the
page is visible. A real error closes/revokes the old source once, schedules retry,
and its replacement SUBSCRIBED acknowledgement triggers one reconnect-recovery
read. Duplicate acknowledgements are ignored. There is no recovery read merely
because time passed or an online/visibility event fired. Initial subscription uses
initial-load. Revocation prevents old callbacks and in-flight generation-bound
reads from applying state; each replacement advances generation exactly once.
Unmount closes the current source and cancels timers. Existing Auth/RLS and
server-only token handling are unchanged. Each new connection revalidates access.

Expected lifetime: no intentional 45s rotation. The existing Node route's
`maxDuration = 60` is unchanged, so hosted Vercel requests remain platform-bounded;
this change does NOT promise an indefinite hosted connection. Heartbeats do not
extend that maximum. Recovery remains necessary after a real platform EOF/error.
No platform setting or hosted Auth/session setting was modified.

30s visible-page polling remains active while SSE is healthy, independently tagged.
Defensive normalized/wire metadata extraction and null timestamp semantics remain
unchanged. No domain writes occur in any callback or recovery path.

Local validation covers six idle heartbeats (90s of scheduled intervals), with no
expiry timeout registered and no channel disposal; polling through three 30s
cycles with the same client generation; redundant online/visibility notifications;
real error/retry producing exactly one replacement generation; one recovery read
on its acknowledgement; stale callback/in-flight read rejection; SSE-only reads,
coalescing, cleanup, and installed SDK INSERT/UPDATE metadata extraction.
42 Realtime/UI/API tests and 32 Auth tests pass; typecheck/build/diff check pass.
These are deterministic local lifecycle tests, not a Vercel longevity claim.

Ready for a separately authorized diagnostic Preview deployment. First confirm
hosted connection health beyond 45s read-only and observe the actual platform
lifetime. A final separately authorized single mutation using a distinct writer
identity is still needed for passive-observer proof. Select a fresh stable observer
connection with a settled initial/recovery read and ample time before both next
poll and platform termination; require matching UUID/event metadata, sse-stale-only
application and unchanged generation across that proof. Do not retry on ambiguity.
Run 6d38ce08-19e8-4825-8386-37339fb42b82 and all hosted fixtures remain untouched.
