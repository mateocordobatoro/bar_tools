# Dedicated Sales Demo fixtures — Preview provisioning verified

Target: `bar_tools_preview` (`mfwoutniamoldcieoqvc`) only. Provisioning committed with exit code 0; an independent read-only connection verified the baseline with exit code 0. No simulated day, sales, reset, application deployment, feature-flag changes or Production access occurred.

## Exact dataset

Every name has prefix `DEMO60-v1 `. UUIDs and serving references are also available in [the operational manifest](SALES_DEMO_FIXTURES_PREVIEW.json). That file contains no credentials or Auth identity inventory.

| Raw item | Unit / quantum | Baseline | Item UUID | Account UUID |
|---|---|---:|---|---|
| DEMO60-v1 Tequila | ml / 1 | 900 | `dc4d9685-710a-4c7d-b856-a53720eee9b2` | `44a087be-ed47-4ba2-8e7b-94885ae270f7` |
| DEMO60-v1 Lime | ml / 1 | 1200 | `58145021-40c0-403b-8364-73d657f44c4a` | `eccaa87e-2fdb-46a0-91c3-97e5d7fe312e` |
| DEMO60-v1 Vodka | ml / 1 | 300 | `175cd6a7-b2d5-428c-a09a-78a56a6c4a65` | `943e71b8-57b5-4093-a3d7-08e23605abd8` |
| DEMO60-v1 Coffee liqueur | ml / 1 | 200 | `89f41884-3c8d-48ae-9c2d-68ffc3f32397` | `778d54c5-fc81-443f-a343-7de5289840bf` |
| DEMO60-v1 Espresso | ml / 1 | 200 | `8e729475-1c02-4822-b0ef-299aa682608a` | `d7a90e67-3c7b-4155-a2c0-c26ed9eea337` |
| DEMO60-v1 Wine | ml / 1 | 750 | `17082966-fc90-4ea3-9085-a84afd5e5aaa` | `465676ff-7b08-4f37-9a55-85bcf4121632` |
| DEMO60-v1 Beer | unit / 1 | 2 | `413205ed-3948-4c80-9a57-67c04bc2453e` | `b67f7379-910a-47c0-a463-b99fb7368e4e` |

One active SIMPLE Margarita recipe, one approved version, one Combine step, and two structured recipe requirements: tequila 600 ml and lime 400 ml per standardized batch. Standard output: 1 L; production increment: 0.5 batch.

- Recipe: `aff2be75-d9da-45fc-a269-d2cb0898af7d`
- Version: `4c1f5491-0904-477f-a0a4-88a5ed0d38b9`
- Stock identity: `9128cf48-5987-42cf-8505-926f295f572a`
- Prepared account: `7a214754-143c-46dc-a218-fa1aabae136c`
- Prepared baseline: **1 batch**.
- Operational prep threshold: **0.30 batch**.

| Menu item | Menu UUID | Serving-definition UUID | Per-serving consumption |
|---|---|---|---|
| DEMO60-v1 Margarita | `f5bf3d53-ade0-48db-83c1-e0dc92de7cb4` | `ab60d5f3-036c-47c3-a107-53527a2ac3bd` | 0.1 dedicated Margarita batch |
| DEMO60-v1 Espresso Martini | `1fbafdc1-2d68-4a91-aa8c-1798d1f6f93a` | `93638395-1cd6-43d7-962e-071c7d57275f` | Vodka 45 ml + coffee liqueur 20 ml + espresso 30 ml |
| DEMO60-v1 Tequila shot | `d419b2aa-66da-4543-aca5-ef44bb6d291e` | `ca52ca8e-5221-43eb-ac6e-a2001640821c` | Tequila 30 ml |
| DEMO60-v1 Wine glass | `5b4403db-509f-4b67-91b4-2b07a8acdc88` | `faa79794-4de2-49c3-a0b4-c2c152128aca` | Wine 150 ml |
| DEMO60-v1 Beer | `3eae72a1-9456-4258-b4e1-b886b965d5da` | `8c5c58de-6fd6-4df5-8064-975e07f51a99` | Beer 1 unit |

All five serving definitions are approved version 1. Their seven requirement rows reference only dedicated accounts/stock. Made-to-order and direct pours consume raw inventory; Margarita consumes prepared Batch Stock. No conversion or simulated parallel inventory system exists.

## Evidence and isolation

- Preflight verified the installed 006 catalog, absent demo-prefix collisions, and an existing active, confirmed, nonanonymous synthetic management identity with EXECUTE access to all six authoring/count RPCs.
- One transaction used existing RPCs under the authenticated management database role. Staff/domain locks serialized provisioning; no session was terminated or historical fixture reused.
- Exact additions: seven raw items; eight accounts/balances; one recipe/version/step/stock identity/operational setting; two recipe requirements; five menu items/serving definitions; seven serving requirements.
- Exactly eight counts, eight OPENING_BALANCE movement headers and eight movement lines initialized the eight accounts. Every balance has revision 1. No other stock movements or stock events were added.
- Expected administrative records: 22 idempotency-operation rows and 70 audit rows. Audit includes the initial operational-setting INSERT and threshold UPDATE; these explain the two records omitted in the first local expected-count draft.
- All pre-existing row-content hashes remained present across the 26 public/private application tables. The transaction checked exact per-table addition counts. The independent connection reconfirmed historical-row preservation and all fixture baselines.
- Nine catalog groups remained unchanged, including RLS, grants, default privileges, function signatures/bodies, constraints, column nullability, triggers and publication.
- Demo requests: **0**. Demo runs: **0**. Demo sales: **0**. No Auth users were created.
- 001–006 hashes remain unchanged. No migration was executed or history repaired.
- Local PostgreSQL 17.6 rehearsal verified atomic provisioning, exact baseline/mappings, independent read-only verification and rejection of duplicate provisioning. Demo/API tests passed **22/22**, including Production, wrong-project and role denial.
- 006 compatibility was checked through the unchanged installed function definitions, signed quantity constraint and valid immutable serving mappings. No fixture sale was submitted to test the mapping; the previously approved 006 behavioral proof remains separate.

Private execution evidence and one-shot launcher remain under `/tmp/bar-tools-sales-demo-provision`; do not rerun provisioning or commit private captures.

## Vercel preparation — no changes applied

Read-only Dashboard inspection of the `bar-tools` project found:

- `NEXT_PUBLIC_SUPABASE_URL` for All Pre-Production Environments is exactly `https://mfwoutniamoldcieoqvc.supabase.co`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is present for pre-production; its value was not revealed or changed.
- `SALES_DEMO_ENABLED` is absent from project variables. No shared variables are linked. The default therefore remains OFF, including Production.
- Production variable rows retain their displayed Sep 20 update dates; no Production values were revealed or changed. No Production deployment or database was accessed.

For a future separately authorized UI deployment:

1. Add `SALES_DEMO_ENABLED=1` only to Vercel **Preview**, preferably restricted to `feat/supabase-foundation`. Never select Production or All Environments.
2. Keep the existing Preview Supabase URL and publishable key. `VERCEL_ENV=preview` is supplied by Vercel; System Environment Variables are already enabled.
3. No UUID environment variables or code changes to fixture IDs are needed. `lib/sales-demo/fixtures.json` defines the exact prefix/names and expected mappings; the server resolves and validates them against the IDs documented above.
4. Keep Production flag absent/OFF and Production variables unchanged. The server explicitly rejects `VERCEL_ENV=production`, a missing enable flag, an unexpected Supabase URL and nonmanagement sessions.
5. Isolate the approved demo code from unrelated pending work, rerun release checks, and deploy only the feature branch after authorization. Then test the management UI and bartender SSE together.

**Ready for a controlled UI deployment preparation:** database fixtures and read-only baseline validation passed. UI deployment/enablement and the 60-second end-to-end demo remain pending; this result does not claim those flows were exercised.
