# Product backlog — single-bar MVP

## Before application testing in Vercel Preview

- **Isolate or deactivate the Step 28 synthetic manager.** Its staff profile remains
  active; logout did not deactivate the profile. Auth ID
  `048235bd-f68b-4e2b-a603-c58eee75c99d`, profile
  `b612ae96-6b7b-4d2b-a2e7-9e7571e8fb55`, run
  `BT28-0416fb8d-d2ee-4ae6-8ecd-7505e8b5ff79`. Do not use this account for application
  testing without a separately approved procedure. Do not delete or modify any
  of the four existing test users/fixtures in this implementation phase.
- Approve an application test identity/session procedure and explicitly choose
  the test accounts and lifecycle. The database tests do not authorize their reuse.
- Approve a Preview build/deployment and record its exact HTTPS hostname. Check
  Preview-only public URL/key, Vercel deployment protection and Auth URL settings
  using [the authentication runbook](APPLICATION_AUTH.md). Do not use Production.
- Verify login, refresh, logout, deactivation and cross-role route denial in that
  actual Preview deployment; current application HTTP tests use a loopback mock.

## Application work after the authentication foundation

- Bartender Requests / In Progress / Ready pages using existing server-enforced
  RPCs and RLS, with quantities, units, preserved completed steps and blockers.
- Management request creation and visibility of operational states.
- Approved invitation/password setup/recovery flows and mail delivery validation;
  the current login is for existing password accounts, not public signup or PIN.
- Shared-device session UX and the limits of logout/access-token expiry.
- Cross-bartender resumption and concurrent-operation application tests.

## Database/deployment follow-ups (separate approval)

- Retain/isolate synthetic history or prepare a reviewed cleanup plan. Do not
  bypass immutable-history triggers or actor foreign keys to remove test data.
- Reconcile the absent migration ledger without replaying 001/002.
- Review permissive default privileges before adding database objects.
- Provision any future real manager through a reviewed operator workflow: the
  existing synthetic manager means the initial bootstrap cannot be reused.
- Backups/recovery, independent Production preflight and explicit promotion.

Inventory/integrations and other deferred features remain outside the MVP.
