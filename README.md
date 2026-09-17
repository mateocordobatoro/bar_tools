# BarThings

MVP stack: Next.js + TypeScript + Supabase + Vercel.

## MVP
- PIN login
- Roles: management / bartender
- Batch requests
- Batch runs
- Partial steps
- Blocked reasons
- Quantities
- Ready status

## Local setup
Use Node.js 24 (see `.nvmrc`) and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set the Supabase project URL and anon key in `.env.local` before using the
Supabase helpers. The current scaffold builds without Supabase credentials.
Database migrations in `supabase/migrations/` are not run by setup or CI.

## Validation
```bash
npm run typecheck
npm run build
```

GitHub Actions runs `npm ci` and both checks for pushes and pull requests.

## Docs
See `docs/` for scope, architecture, UX, and design; `AGENTS.md` summarizes
development conventions.
