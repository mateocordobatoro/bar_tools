# Observed sales and temporary management demo

Migration 006 is installed and minimally behavior-tested in Preview; see
[Preview validation](SALES_DEMO_PREVIEW_VALIDATION.md). Dedicated fixtures are now
provisioned and independently verified; see [exact IDs and baseline](SALES_DEMO_FIXTURES_PREVIEW.md).
The demo application remains local: no feature flag changes, application commit/push
or deployment have been performed for this workstream. Earlier local-only notes below
describe the implementation phase; demo enablement and UI deployment remain pending.

## Domain correction: migration 006

`006_observed_sales.sql` supersedes the low-stock sale behavior of 004/005 without
editing them. Apply later only through an approved transactional deployment with
writers drained; the migration takes the staff table lock before the domain lock.

Valid observed sales post `SALE_CONSUMPTION` even at zero or negative theoretical
stock. Only that movement type may decrease an account into/beyond a deficit.
Balances remain bounded finite values with unit quantum validation. Ledger history,
sale IDs, actor attribution and exact-payload idempotency remain unchanged.
Existing historical REJECTED sale IDs remain terminal; there is no replay or repair.
Unknown menu mappings, uninitialized accounts and invalid quantities remain technical
configuration/validation errors, not inferred stock shortages or variance reasons.

Simple production and consuming multistep steps still require sufficient inventory.
Positive replenishment may reduce a deficit without clearing it completely. Physical
counts use existing revision-checked compensating movements. Availability never
advertises negative producible batches. Bartender stock labels show zero for a
deficit; the signed authoritative balance remains available for future management
reconciliation. No variance analysis or automatic requests are introduced.

## UI and server boundary

`/management` contains a small panel: Start simulated day, Stop, Reset demo, and
the latest five successful sales. One fixed sequence contains 20 sales across five
menu items. The first sale starts immediately; subsequent sales wait three seconds
after the previous request settles: about 57 seconds plus request latency. Displayed
operating time advances from 17:00 to 00:36. Stored sold_at uses the execution start
plus the fixed sequence offset; retry preserves all five ingestion fields exactly.
Server names are synthetic feed labels, never authorization identities.

The same-origin `/api/management/demo` route resolves the active database management
profile on every request. POST accepts only execution ID and sequence index, builds
the fixed sale on the server and calls real `ingest_sale`. GET checks fixture readiness.
DELETE accepts no payload and resets only the fixed verified fixture accounts.
There are no service-role keys or new users, tables, permissions or RPCs for the demo.

Enablement requires server-only `SALES_DEMO_ENABLED=1` and:

- Vercel Preview with exact Supabase URL `https://mfwoutniamoldcieoqvc.supabase.co`; or
- local NODE_ENV=development without VERCEL_ENV, with that Preview URL or disposable
  local Supabase `http://127.0.0.1:54321`.

Vercel Production, standalone production mode, wrong URLs and missing flags deny
execution and hide the panel. `.env.example` defaults off. Do not change Production.

The management browser schedules one short request at a time. Stop prevents future
sales and lets the in-flight sale settle; navigation/unmount cancels future scheduling.
An uncertain result stops the sequence and offers Retry same sale. sessionStorage
retains only execution ID/index until confirmation (no credentials or autonomous
executor). Start/reset remain blocked until that exact idempotent sale is resolved.
Closing the tab loses this recovery token: inspect unresolved activity before resetting.

## Reset and operating limitations

Use one management controller window. Stop other demo writers and finish dedicated
demo production before reset. Each count uses the current balance revision; no direct
balance edits, new opening balances, deletions or historical test-fixture reuse occur.
Reset refuses open demo runs/requests and verifies the transitive fixed recipe/serving
definitions before touching any account. It restores only changed demo accounts and
then rereads all baselines. Reset is multiple existing count transactions, not one global
transaction: partial failure shows Reset incomplete and blocks Start until baseline
verification succeeds. Retrying completes remaining adjustments.

There is deliberately no multi-operator coordinator. A concurrent writer may cause a
revision conflict or change stock after verification. Quiesce demo activity for reset;
do not treat the readiness check as a database-wide lock. Prefixes are reserved demo
identifiers; missing, duplicated or changed fixture definitions fail closed.
Accumulated sales/ledger remain synthetic history and must be excluded from future
operational analytics. This implementation does not build analytics filtering.

## Exact dedicated fixtures (now verified in Preview)

All names below have the reserved prefix `DEMO60-v1 `. No new Auth identities.
Use an already authorized active management session and existing active bartender.

| Raw item | Base unit / quantum | Baseline |
|---|---|---:|
| Tequila | ml / 1 | 900 |
| Lime | ml / 1 | 1200 |
| Vodka | ml / 1 | 300 |
| Coffee liqueur | ml / 1 | 200 |
| Espresso | ml / 1 | 200 |
| Wine | ml / 1 | 750 |
| Beer | unit / 1 | 2 |

One approved SIMPLE Margarita version, standard batch 1 L, production increment
0.5 batch, one Combine instruction, tequila 600 ml + lime 400 ml per batch. Its single
stock identity/account starts at 1 batch; operational prep threshold 0.3 batch.
Initial counts initialize these seven raw accounts and one prepared stock account.

| Menu item / approved serving definition | Requirements per serving |
|---|---|
| Margarita | 0.1 Margarita batch |
| Espresso Martini | vodka 45 ml + coffee liqueur 20 ml + espresso 30 ml |
| Tequila shot | tequila 30 ml |
| Wine glass | wine 150 ml |
| Beer | beer 1 unit |

Exact immutable demo configuration and ordered sale quantities are in
`lib/sales-demo/fixtures.json`. The local-only helper `scripts/sales-demo-fixtures.mjs`
uses existing authoring/count RPCs in disposable database tests; it has no hosted
connection or automatic provisioning entry point.

Without bartender production, the sequence sells 15 Margarita servings, four Espresso
Martinis, five shots, four wines and three beers. Final balances: Margarita -0.5 batch,
tequila 750 ml, lime 1200 ml, vodka 120 ml, coffee 120 ml, espresso 80 ml, wine 150 ml,
beer -1. Producing one real Margarita batch then yields stock 0.5 and clears its
0.3 threshold. No manager request is created. Existing balance Realtime events drive
the normal authoritative bartender refetch; no new subscription/client stock math.

## Validation and deployment prerequisites

Local tests cover real SQL negative sales, idempotency, strict production, reconciliation,
the complete 20-sale fixture sequence, prep crossing/recovery, unchanged request count
and retained sales after reset. Unit/controller/API tests cover environment/role denial,
fixed mapping/injection, stop/retry/disposal and partial reset. Existing Auth and
Realtime/UI/API suites are regression checks; no hosted or browser demo validation
is claimed here.

Local results: 235 domain assertions, 299 cutover assertions, 54 foundation assertions,
six transaction/rollback checks and five concurrency checks passed in disposable
PostgreSQL 18.4. Demo tests 22/22, Realtime/UI/API 42/42, Auth 32/32, database contract
5/5 and existing simulator 9/9 passed. Typecheck, production build and diff check passed.
This is not a hosted PostgreSQL 17 or real-browser/SSE demo validation.

Before any controlled Preview deployment, separately approve and verify migration 006,
dedicated fixture creation via trusted management RPCs, the Preview-only enable flag,
an authorized management login and a quiescent reset procedure. Review the staged diff
to exclude unrelated pending work. Then validate management sales and bartender SSE
side by side in Preview. Do not deploy the demo against pre-006 semantics.
