# Bartender mobile UX review — 2026-09-26

Scope: presentation and client interaction only. No backend/API/Auth/RLS/inventory
contract changes, migration edits, hosted writes, Production access, commits, pushes
or deployments. The simulator remains blocked and its controls were not redesigned.

## Findings and adjustments

- At 320 px, Refresh was only 33 px high; recipe buttons were 43 px. All visible
  workspace buttons, disclosure summaries and input targets now measure at least
  44 × 44 px. Reason input is 48 px high and uses a 16 px font.
- Navigation wrapped to two lines. Three sticky single-line tabs now fit at 320 px.
  Sticky navigation remains at viewport top while scrolling long ingredient lists.
- Empty sections pushed recipes below the fold. Empty sections are compact; an
  empty Other recipes heading is omitted. Requests still precede suggestions.
- A low-stock recipe repeated in Suggested and Ready/Can start. It now appears in
  Suggested with its availability, with a short reference in the otherwise empty
  availability group. Request cards can still repeat that recipe intentionally:
  their purpose is explicit management demand.
- Requests now emphasize remaining demand and use separate Requested/Fulfilled
  labels. Underway quantity remains visible. Automatic association is unchanged.
- Batch choices show the first four backend options, with an expandable remainder.
  No sizes are invented. Selected quantity remains explicit in the action label.
- Completed run steps retain visible names/status but collapse instructions; the
  next step stays expanded and highlighted. Later steps remain inspectable.
- Long missing-input lists show two entries plus an expandable remainder. Missing
  later inputs are labeled separately for startable recipes. Unbroken names wrap.
- Stock rows align fractional amounts for scanning and show Low stock from the
  existing backend should_prep signal, without exposing balances/ledger controls.
- Saving no longer shows a misleading uncertain-result retry warning. Retry appears
  only when the operation remains pending after the request. A 409 is phrased as
  stock or step changed; the existing refresh/idempotency behavior is preserved.
- Same-selection background availability refresh no longer briefly removes the
  confirmation action. Changing version/quantity still clears old availability,
  and every write still revalidates in the backend. No stale availability can bypass
  database checks. Opening recipe/run detail focuses its heading for orientation.

## Browser review

Actual local route: `http://localhost:3000/bartender`, authenticated original synthetic
bartender. Navigation and reads only; no production or inventory action was performed.
The initial 320 px review used current hosted synthetic data. Empty requests/runs
and published recipes were observed through the real client/server flow.

Missing operational states were reviewed by rendering the same Workspace component
with synthetic local hook state, isolated from Auth/Supabase and with no event handlers
for business operations. Run `node scripts/mobile-review.mjs` for these loopback-only
fixtures; the server reads neither .env nor credentials. All fixture routes begin
`http://127.0.0.1:3107/`:

- `prep`: priority request, suggested prep, complete-vs-partial preparation.
- `simple`, `missing`, `multi`: quantities, ingredients, unavailable confirmation,
  missing-later lists and ordered recipe instructions.
- `run`, `blocked`, `progress`: completed/next step, handoff note and resume controls.
- `stock`: fractional balances and low-stock signal.
- `changed`, `session`, `pending`, `saving`: operational copy and action states.

| Width | Scenarios measured | Horizontal overflow | Visible targets below 44 × 44 |
| --- | ---: | ---: | ---: |
| 320 px | 12 | 0 | 0 |
| 375 px | 12 | 0 | 0 |
| 430 px | 12 | 0 | 0 |

All 36 final combinations were measured from actual browser DOM bounding boxes.
Additionally, the long missing list was expanded at every width. At 380 px viewport
height, the reason input retained focus, font 16 px and height 48 px; sticky tabs
remained at top 0. This approximates reduced keyboard space, not a real mobile keyboard.
Viewport overrides were reset after review. Viewport captures of Prep (320), run
(375), and stock (430) were displayed in the conversation. The full-page capture
had a browser stitching artifact; use the viewport captures as visual evidence.

## Validation

- 95 unit/UI/route-integration tests passed, including 28 bartender tests. Mounted
  React coverage was extended for request hierarchy, duplicate removal, additional
  quantity disclosure, collapsed completed steps, next-step emphasis, saving/retry
  copy and a deliberately delayed background availability refresh.
- 28 real Next.js HTTP Auth/session/route checks passed against a loopback stub.
  Session expiry/refresh redirects use the existing Auth behavior. The static session
  fixture evaluates copy only, not an authenticated session-expiry test.
- Typecheck, production build and `git diff --check` passed.
- No PostgreSQL migrations or domain behavior changed; existing database validation
  remains applicable. No hosted mutation test was rerun for this UX-only scope.

## Readiness and remaining limits

Ready to prepare a controlled Vercel Preview deployment, with the simulator disabled.
Deployment is not performed or implied. Existing environment/branch and secret review
requirements still apply before any future authorized commit/push.

Remaining awkwardness: synthetic fixture names are long and require wrapping; large
missing lists still take space when expanded; long recipes require scrolling to
confirmation. Real iOS/Android keyboard behavior and touch ergonomics need a device
smoke check. There is no new successful PKCE test or simulator enablement. No real
integration blocker was found; no backend correction is proposed.
