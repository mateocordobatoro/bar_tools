# Preview setup — 2026-09-21

**Project and application variables configured; migrations and a new Vercel
Preview deployment have not been executed.**

## Verified targets

| Target | Supabase project | Project reference | Status |
| --- | --- | --- | --- |
| Vercel Production | `bar_tools` | `njhcumxecwrrpbmjfdti` | Original URL and legacy key values preserved; now scoped only to Production. |
| Vercel Preview + Development | `bar_tools_preview` | `mfwoutniamoldcieoqvc` | New URL and publishable key saved as All Pre-Production Environments. |
| Local application / `check:supabase` | `bar_tools_preview` | `mfwoutniamoldcieoqvc` | Effective configuration verified against this exact origin. |
| Supabase CLI migration target | None | Unlinked | No `supabase/.temp/project-ref`; do not claim migrations are ready to run through linked CLI. |

Project names and references are identifiers, not credentials. No key or database
password belongs in this document. `.env.local` remains Git-ignored with mode 0600.
Exported shell variables take precedence over its values; recheck the effective
configuration in the shell that will execute any future operation.

## Completed

- User created `bar_tools_preview` after personally entering its database password.
- Dashboard verified Preview's distinct reference, Healthy status, us-east-1,
  no connected GitHub repository, and no migrations listed.
- Creation form used Data API ON, automatic table exposure OFF, and no global
  automatic-RLS trigger. Recheck actual settings as part of Preview preflight;
  migration 002 explicitly enables RLS on the seven tables.
- Vercel original `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  were restricted to Production without replacing their values.
- Added `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  for Preview and Development only, using Preview's matching configuration.
- Updated only the two corresponding application variables in `.env.local`;
  checked the effective URL against Preview and checked for a conflicting CLI link.
- `npm run check:supabase` passed against Preview after granting network access.
  This verifies Auth API reachability only, not key validity, SQL, users or RLS.

Step 23 completed: public signup disabled only in Preview, saved and verified
after reloading. Email and email confirmation remain enabled; anonymous sign-in
remains disabled. No SQL, CLI linking or users were involved.

Dashboard preflight completed in step 22: see [PREVIEW_PREFLIGHT.md](PREVIEW_PREFLIGHT.md)
for actual catalog, Auth/API settings and pending authorizations.

Step 24 SQL inspection completed: [catalog results](PREVIEW_CATALOG_RESULTS.md).
The empty-install prerequisites are compatible; recovery review and migration
authorization remain pending. CLI remains unlinked.

## Still pending, before migration or user access

1. Dashboard review and the authorized signup restriction are completed. SQL
   catalog inspection is now complete; recovery validation remains pending. See the step 22 report
   and its step 23 update.
2. Set up operator access to the verified Preview reference through an approved
   credential flow. Never reuse the current runbook's `bar_tools_dev` alias for
   Production. That alias may refer to Preview only after explicitly configured.
   Do not manufacture a CLI link marker: run the real link command when needed,
   verify its result, and never rely on the project name or current directory alone.
3. Read-only catalog preflight passed for the inspected empty-install prerequisites. Obtain approval for the migration
   execution after its prerequisites and domain decisions are closed. No SQL has
   been executed in either hosted project by this setup task.
4. Deploy this branch's compatible application code to Vercel Preview in a later
   authorized action. Existing remote code may still read the legacy variable;
   the local branch uses the new publishable name. No push, commit or deployment
   was made here, so the new environment configuration is not yet validated in a
   running Vercel Preview build. Do not redeploy old code and assume compatibility.
5. Existing deployments retain build-time variables. Review/restrict old Preview
   deployments before real data; saving variables does not retrofit their bundles.
6. Test migrations and the MVP only in Preview first. Production promotion remains
   a separate reviewed action after the MVP works there, including the production
   variable-name update, backup/recovery, Auth settings and invitation/login flow.

During initial environment setup, no Auth settings were modified, users created by the agent, fixtures inserted,
migrations executed, GitHub integration enabled, or Production deployment changed.

## Local checks

TypeScript, production build and `git diff --check` passed using the new local
Preview application configuration. Current scaffold pages do not query Supabase
at build time. The existing local disposable database test runners remain isolated
from hosted project variables.
