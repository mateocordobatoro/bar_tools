# Management V1

Status: application implementation passed local validation. Migration 007 is installed and its backend validation is complete in Supabase Preview `mfwoutniamoldcieoqvc`: 73 hosted checks plus 38 final unprovisioned-identity/security checks passed. Staff states were restored (12 profiles, 2 active management, 2 active bartenders); no inventory operational settings persisted. Normal Preview activity may resume. Management UI publication is authorized; hosted UI acceptance remains pending. Production is outside this release.

## Database contract

`007_management_operations.sql` adds:

- `inventory_item_operational_settings`, keyed by existing raw inventory item. Categories: LIQUOR, BEER, WINE, GARNISH, JUICE_MIXER, OTHER. Low and critical thresholds are nullable normalized base quantities; critical requires low and cannot exceed it. No automatic thresholds or backfill. Prepared Batch Stock remains separate.
- Optional `preferred_display_unit` references the existing item-specific conversion through a composite foreign key. Null uses the base unit. No universal packaging conversion is assumed.
- Management-only SELECT under RLS. No client write grants, configuration editor, or configuration mutation RPC. Trusted developer maintenance stamps actor/time and writes immutable private audit events; a database operator without an Auth identity has a null actor.
- `update_staff_profile(p_target uuid, p_role app_role, p_active boolean, p_operation_key uuid)`: active management only, existing profiles only, at least one changed field requested. Actor is resolved in PostgreSQL, not accepted from the browser. Existing operation records provide exact-payload idempotency; existing staff auditing preserves changes.

The staff RPC takes an EXCLUSIVE table lock on app_users before actor/domain-operation locks. This serializes staff changes and drains in-flight actor SHARE locks while allowing ordinary reads. It checks that at least one active manager survives. Simultaneous self-deactivation cannot remove both final managers. This intentionally trades brief staff-write serialization for a simple enforceable invariant. Direct profile UPDATE remains unavailable. A caller that deactivates/demotes itself cannot bypass current authorization by retrying afterward.

No Auth users, passwords, invitations, ledger semantics, or migrations 001–006 are changed.

## Application contract

`/management` requires an active database management profile and exposes Overview, Inventory, Prep, Recipes, and Staff in one desktop workspace. `/api/management/operations` independently checks current role, same-origin writes, strict command fields, and the existing Preview/development target guard. Wrong project and Production execution fail closed. No administrative credential is introduced.

- Overview prioritizes configured low/critical inventory, negative theoretical quantities, low Batch Stock, and open requests. Unconfigured raw items remain neutral. Count discrepancy history is labeled separately from current negative balances.
- Inventory supports category/status/search, familiar units, receiving, and physical counts. Negative quantities remain visible to management only.
- Receive resolves conversions server-side using exact decimal arithmetic and existing item quantum, then uses positive `adjust_inventory` with reason `Receipt`. Prepared stock must come from production, not receiving.
- Bulk counts call `record_inventory_count` independently per row with the captured balance revision. Applied rows are not replayed; a conflict requires reviewing the new state and re-entering the count. It is not a global transaction.
- Uncertain transport results retain the exact operation and idempotency key in session storage and block new writes until resolved. An idempotency payload conflict stays unresolved rather than creating a replacement write. Do not change item conversions while an operation is unresolved.
- Prep reuses authoritative overview/progress RPCs, threshold update, standardized batch request with optional note, and cancellation. No deadline or automatic request creation.
- Recipes are read-only current published definitions, ingredients, steps, and increments.
- Staff supports activation, deactivation and role changes through the new RPC only, with confirmation.
- The existing gated Sales Demo component is retained without changes.

Management refetches after actions and offers Update view. This delivery does not add management Realtime. Bartender UI, subscriptions, reconciliation visibility and domain behavior are unchanged.

## Deliberately deferred

No catalog/category/packaging/raw-threshold editor, recipe authoring, supplier schema, Auth administration, or advanced analytics. V1.1 perishables should use separate receipt lots with received_at, expiry_date and quantity so distinct receipts can expire independently; no perishable fields or behavior are implemented now.

## Local validation

PostgreSQL 17.6 disposable local test database:

| Suite | Passed assertions |
| --- | ---: |
| Foundation | 54 |
| Atomicity | 6 |
| Concurrency | 5 |
| Cutover / transitions | 299 |
| Migration 006 verifier | 49 |
| Management 007 | 28 |
| Domain / inventory | 235 |

007 coverage includes clean installation, transaction rollback, role denials, last-manager deactivation/demotion, concurrent self-removal, idempotency, auditing, category/threshold/conversion validation, RLS and direct-write denial.

Application suites: Management 22, Bartender Realtime/UI/API 42, Auth 32, Sales Demo 22, database contract 5. TypeScript, production build and diff whitespace checks pass. Migrations 001–006 SHA-256 values match their previous tested versions; 006 remains `36a94af55ab9e313fa23b00da376a9fbc258e08ada1ac465dc6c465854d12765`.

Management tests render synthetic local HTML snapshots at `/tmp/bar-tools-management-review/`: overview, inventory, counts, prep, recipes, staff. These are static visual review artifacts without backend connections, not a hosted end-to-end test. With the local review server running, open `http://127.0.0.1:3127/overview.html` (change filename for other screens). UI interaction tests use mocked responses. Desktop review at 1440px and responsive fallback at 320/375/430px verify page containment; wide tables scroll internally. Inventory controls are at least 44px. Mobile tables intentionally require horizontal scrolling; this is a desktop-first workspace.

## Preview UI release and acceptance

Publish only the Management workspace, operations API, model/service, application tests and documentation on `feat/supabase-foundation`. Existing Bartender and Sales Demo components remain unchanged. Do not replay migrations or provisioning.

After the automatic Vercel Preview deployment, validate the five Management sections using existing synthetic identities. Test one demo receipt and explicit count restoration, per-row stale count handling, recipe prep threshold update/restoration, request creation/cancellation, and staff update/restoration. Verify role separation and responsive table containment. Record results separately; local tests do not establish hosted UI acceptance.

The current Preview inventory has no packaging conversions. Receiving and counting must use supported base units; bottle/case conversion is not a hosted capability yet. Raw inventory categories/thresholds remain operator-maintained and read-only in V1; recipe prep thresholds remain editable independently.
