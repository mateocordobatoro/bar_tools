# Functional bartender workspace — local implementation

2026-09-26, `feat/supabase-foundation`. No commit, push, application deployment,
remote SQL, hosted fixture change or Production access occurred in this implementation.
Migrations 001–005 are unchanged. The prior hosted backend validation is documented
in PREVIEW_INVENTORY_DEPLOYMENT_RESULTS.md; it does not constitute a hosted test of
this new UI.

## Routes and boundaries

- `/bartender`: existing server-protected bartender route, now the operational UI.
- `/api/bartender`: same-origin, no-store GET/POST interface. Every request verifies
  Supabase Auth and the current active bartender database profile. Management,
  unprovisioned and inactive accounts cannot use bartender actions. POST checks Origin.
- `lib/bartender/service.ts`: caller-session Supabase reads and RPC calls, no elevated
  client. RLS remains authoritative. Reads paginate rather than silently truncating at
  the PostgREST default; more than 10,000 rows in a queried collection fails closed.
- `lib/bartender/model.ts`: validated action contracts and view selectors.
- `lib/bartender/use-workspace.ts`: fetching, polling, selection, pending writes/retries.
- `app/bartender/workspace.tsx`: presentation. Styling remains in globals.css.

This unfinished operational release is gated to the exact Preview Supabase origin
`https://mfwoutniamoldcieoqvc.supabase.co`. Vercel Production and any other project
are rejected before creating a Supabase client in the API. Local development with
that Preview configuration is supported. Administrative credentials are not needed.

## Operational flow

Prep prioritizes open Requests, Suggested to prep, Ready to make, Can start and
other unavailable recipes. Suggestions use backend `should_prep`; no threshold
editor exists. Request cards show requested, fulfilled, remaining and underway.
Backend auto-association is the only assignment path. Excess production is allowed
and explained as additional Batch Stock.

Recipe detail uses the published version's backend-provided batch options and
rechecks availability for each selection. Quantities/units are read-only ingredient
instructions; there is no physical-output, ingredient-quantity or actual-yield input.
Base units are displayed exactly from structured definitions; bottle/package counts
are not inferred without explicit data. Simple instructions are not a persisted
step workflow. Confirm production calls the atomic simple RPC once.

Multistep work fixes the version/quantity at start. In progress shows completed,
next and later steps, required ingredients, missing inputs and the latest blocker.
Only the next reachable step can be completed; any active bartender can continue.
Pause requires a reason; Resume uses the existing server transition. No abandonment,
count, reconciliation, authoring or threshold controls are exposed.

Batch Stock aggregates by stock identity, including historical published identities,
with fractional balances. Uninitialized stock is shown as count needed, not zero.
READY/completion transitions into stock; there is no permanent Ready tab or lot list.

## RPCs

Reads: `get_prep_overview`, `get_request_progress`, `get_recipe_availability`,
`get_run_availability`. Caller-session SELECTs supply names, read-only version/step
requirements, shared runs, blockers and aggregate balances.

Writes: `produce_simple_batch`, `start_multistep_run`, `complete_batch_step`,
`transition_batch_run` restricted to BLOCK/RESUME. No request/actor/output fields
are accepted. The database calculates consumption, fulfillment and stock atomically.

## Freshness, failures and retries

Refresh runs after writes, on returning to the visible tab, manually, and every ten
seconds while visible. This is polling, not Realtime subscription. Snapshots can
change between SELECTs; RPCs always revalidate under database locks. A concurrent
run completion may make a read fail transiently; the next refresh resolves it.

Known transactional database rejection displays a stock/work-changed message and
refreshes. An uncertain transport outcome preserves the exact command and UUID in
per-staff sessionStorage, disables new writes and offers Retry same action. This
storage contains operation parameters only, never credentials. Reload in the same
browser tab retains retry state. Closing the tab loses it: inspect work/stock before
submitting new production from another tab. No cross-device retry receipt is exposed
by the current backend. Session loss/deactivation redirects through existing auth
pages. Read and write transport waits are bounded.

## Sales simulator — explicitly deferred by user

The requested bartender demo controls conflict with the current ingestion boundary:
`ingest_sale` requires an active management actor. The simulator engine is local-only;
reset creates a fresh fixture namespace through management RPCs and preserves old
history. A secret/service key is not an authorized substitute for that actor.

The user chose to keep the simulator blocked and design authorization later. Preview
shows disabled Simulate sales / Reset demo with a short explanation. There is no
sales/reset API, background process, live feed or management credential reuse in this
release. Production cannot render the operational demo controls or execute simulator
commands. Existing local simulator tests remain intact. No claim is made that UI
start/stop/reset or hosted UI-driven sales have passed.

Future work: separately approve a server-side demo operator/scenario boundary,
fixture isolation and non-destructive reset, then implement/test its controls.

## Validation and review

- 24 new tests: command allowlist, environment/role/origin denial, safe errors, exact
  retry keys, service aggregation/unknown counts, and mounted React interactions
  using jsdom with a simulated HTTP transport (no hosted credentials).
- Mounted UI coverage includes requests/fulfillment/overproduction, ingredient display,
  full-vs-partial preparation, simple production increasing stock, externally reduced
  stock triggering a suggestion on refresh, start/next-step, another bartender
  continuation, block/resume, and a lost response after a simulated commit retried
  with the same operation key. Simulator controls remain disabled.
- Existing 67 configuration/contract/auth/simulator unit tests passed.
- 28 real Next.js Auth HTTP checks passed against a loopback Auth stub.
- Disposable PostgreSQL 17.6: 299 cutover assertions, 197 domain assertions, 54 baseline
  assertions, five concurrency and six atomicity scenarios passed. Includes actual
  simulator → ingestion → ledger → threshold → production semantics locally.
- Typecheck and production build passed. jsdom is development-only; dependency install
  reported zero npm audit findings. CI includes the new bartender test command.

The HTTP and PostgreSQL suites initially hit sandbox loopback/shared-memory restrictions;
they passed outside the sandbox with the approved isolated local targets.

Review locally with `npm run dev`, then `http://localhost:3000/bartender` (or the port
printed by Next). An active synthetic Preview bartender must sign in at `/login`.
Local actions use the real Preview database; they are not mock/demo actions. Do not
perform production confirmations unless physically/test-intentionally warranted.
The stable Vercel Preview URL still serves the previous deployment until a separately
approved commit/push/deployment. No new hosted UI acceptance or visual browser review
is claimed. Remaining UX validation: real mobile browser review with Preview recipes,
and live end-to-end production against an approved synthetic scenario.

## Local browser → hosted Preview read-only check — 2026-09-26

After the operator signed in at `http://localhost:3000/bartender`, browser inspection
confirmed the exact original Step 33 bartender label. The actual UI fetched the
retained BTINV synthetic recipes/stock from the configured Preview backend.

- Prep showed no open requests, no low-stock suggestions, no completable recipes
  and no startable multistep recipe. Both unavailable recipes remained inspectable.
- Simple detail exposed only allowed batch choices and ingredient instructions.
  At 0.5 batch it reported Raw A 50 ml short and disabled Confirm production.
- Multistep detail displayed ordered Mix / Finish requirements. Selecting 0.5 then
  1 batch changed the read-only ingredients from 50/25 ml to 100/50 ml, and the
  backend missing Raw A result from 50 to 100 ml. Start stayed disabled.
- In progress showed no work underway.
- Batch Stock showed Multistep 1 batch and Simple 1.72 batches, aggregated.
- Simulate sales / Reset demo remained disabled.

Only navigation, recipe inspection and availability selection were performed. No
production, inventory adjustment, request, sales or hosted configuration write was
executed. This verifies live read integration and insufficient-input controls, not
successful live production. Existing fixtures lack Raw A; testing successful writes
requires a separately reviewed synthetic stock setup using management operations.
The earlier statement that no browser review was claimed is superseded for this
read-only check; mobile layout and successful hosted UI writes remain pending.

## Authorized live browser production — 2026-09-26

The operator authorized synthetic stock preparation, a 0.5-batch request, one
simple batch, and the multistep start/step/pause/resume/completion scenario in Preview.
The private preparation journal `/tmp/bar-tools-ui-acceptance/result.json` reports
PASS: original Step 33 management actor, Raw A count from 0 to 1000 ml at expected
revision 7, followed by an OPEN Simple request for 0.5 batch. Raw B baseline was
450 ml; stock was Simple 1.72 / Multistep 1. No users or hosted settings changed.

Using the original Step 33 bartender session at localhost, the agent observed and
executed through the actual rendered UI:

- Request 0.5 batch displayed. Selecting 1 batch explained automatic association
  and excess stock. One confirmed simple production removed the open request and
  increased Simple stock to 2.72 batches.
- Started one Multistep batch, completed Mix, paused with a synthetic acceptance
  reason, resumed, then completed Finish. Mix remained DONE throughout. The run
  disappeared from In progress and Multistep stock increased to 2 batches.
- No simulator, account/profile changes, migrations or Production actions occurred.
- The first accessibility click on simple confirmation failed during target checking;
  the visible UI remained unchanged. A subsequent semantic button click completed
  the operation successfully. No business-operation retry was needed.

The stock changes and workflow passed browser observation. Exact ingredient balances,
request credit and recorded actors require the prepared read-only operator verifier
`/tmp/bar-tools-ui-acceptance/verify.command` before claiming those assertions passed.
Expected values: Raw A 800 ml, Raw B 400 ml, request credit 0.5 batch, two new completed
runs of one batch each. No second bartender was provisioned or activated for this test.

### Final independent data verification — PASS

The read-only verifier completed at 2026-09-26T09:49:44.164180Z in Preview
`mfwoutniamoldcieoqvc`. Evidence is retained privately in
`/tmp/bar-tools-ui-acceptance/verification.json`; no credentials are recorded.
This supersedes the pending exact-data verification above.

- Raw A: 800 ml, revision 10; Raw B: 400 ml, revision 4.
- Aggregate stock: Simple 2.72 batches; Multistep 2 batches.
- The 0.5-batch request is FULFILLED with exactly one 0.5-batch credit referencing
  the new simple run. One batch was produced; fulfillment did not cap production.
- Exactly one new one-batch COMPLETED run per tested version was found in the
  acceptance window. The simple run references the request; multistep has no request.
- Both runs record the original Step 33 bartender as starter and completer. Both
  multistep steps are DONE with the same authenticated actor. One BLOCK, one RESUME
  and two STEP_COMPLETED events were verified; history was preserved.
- No IN_PROGRESS/BLOCKED run remains. No corrective writes or retries were needed.

The scoped live local-browser → Next.js → Supabase Preview production acceptance
has passed. This does not claim a new Vercel deployment, mobile layout acceptance,
new hosted cross-bartender continuation, simulator enablement or successful PKCE.
No commit, push, Production change, migration edit or fixture deletion occurred.
Final documentation whitespace validation: `git diff --check` passed.

## Persistent multistep workspace — local revision, 2026-09-27

Multistep start opens one persistent batch workspace. Ingredients, instructions,
all ordered steps, completed markers and per-step missing inputs stay visible.
Each currently valid next step can be completed directly in the checklist;
completing, blocking or resuming does not navigate away. In progress is for
re-entering retained work. Navigation is disabled while a sequence is running.

`Complete remaining steps` is a convenience for physical work already performed.
It sends existing step-completion commands sequentially, each with its own persisted
idempotency key. It refreshes authoritative state before starting and after every
operation, verifies the completed step, then selects the next ordered step. It
stops on missing inputs, blocked work, a rejected command, an uncertain response,
or a failed refresh. It never marks steps complete locally. An uncertain command
must be retried with its original key; the whole sequence is not automatically retried.
A failed refresh disables new production actions until state can be refreshed.

The existing final-step RPC completes the run and credits stock. The workspace
shows the completed checklist and `Batch completed · … added to Batch Stock` from
server-read completion state; no separate stock-writing operation is introduced.
The read adapter retains completed/abandoned runs already returned by its existing
RLS SELECT for detail rendering, while In progress still lists unfinished runs only.
`Can't continue` uses the existing BLOCK operation and stores the entered reason;
Resume uses the existing RESUME operation. Simple `Start Batch` remains atomic.

Local checks: 33 bartender UI/API tests (including sequential success, missing
inputs after partial success, server rejection, lost response, refresh failure),
32 Auth tests, typecheck and build passed. Mobile fixture `/run` measured at
320/375/430px: no overflow, targets at least 44px, input font 16px.
Review routes: application `/bartender`; read-only local fixture server
`http://127.0.0.1:3107/run`, `/blocked`, `/multi`, `/simple`.
Fixtures have no live write handlers. A 375px screenshot was rendered in the task.
No migrations, RPC/domain semantics, permissions, hosted data, commit, push or
redeployment are part of this revision. The hosted Preview still runs the previous UI.

### Compact checklist refinement

The subsequent user review replaces always-expanded step contents with compact,
numbered rows. Every step remains visible; native disclosure arrows reveal its
instructions, inputs and missing quantities. A short `Missing inputs` label stays
visible on the affected row. Overall ingredients and the stopper form are also
collapsible. Removed the green step stripe/background and bartender notice left
border; reduced explanatory copy. Persistent navigation, sequential execution and
backend validation are unchanged. Updated 33 UI and 32 Auth checks, typecheck,
build and diff check pass; 320/375/430px checks show no overflow and no step border.
