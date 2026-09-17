# BarThings development conventions

## Source of truth
- Read `docs/MVP_SCOPE.md`, `docs/ARCHITECTURE.md`, `docs/UX_FLOW.md`, and
  `docs/DESIGN_SYSTEM.md` before changing behavior or design. Keep work within
  the documented MVP; deferred integrations and inventory features stay deferred.

## Project structure and checks
- Use Next.js App Router and strict TypeScript. Routes and layouts live in `app/`;
  Supabase browser/server helpers live in `lib/supabase/`; SQL migrations live in
  `supabase/migrations/`. Use the `@/*` alias for root-relative imports.
- Use Node.js 24 (`.nvmrc`) and npm. Install with `npm ci`; commit
  `package-lock.json` when changing dependencies. Run `npm run typecheck` and
  `npm run build` before handing off changes; use `npm run dev` locally.
- Copy `.env.example` to `.env.local` for Supabase configuration. Never commit
  secrets or generated build output. Do not execute migrations without an
  explicit request.

## Domain and UX
- Preserve history and version recipes. Keep work in progress separate from
  ready stock; any future inventory system must use a movement ledger.
- Follow Recipe → Recipe Version → Recipe Steps → Batch Request → Batch Run →
  Batch Run Steps → Ready. Use the documented statuses: `REQUESTED`,
  `IN_PROGRESS`, `BLOCKED`, `READY`, `CANCELLED`.
- Management creates batch requests and sees all production states. Bartenders
  use approved recipes and never edit formulas. Prioritize PIN → Requests /
  In Progress / Ready; preserve completed steps, record blockers, allow later
  resumption, and include quantities and units.
- Follow the design guide: warm off-white, white surfaces, mint/green, teal
  actions, amber warnings, one sans-serif family, compact cards. Avoid progress
  bars, excessive pills, giant cards, heavy shadows, and gradients.
