# MVP Scope

BarThings is an operational workflow for bar prep and batching.

## Roles
### Bartender
Can view requests, start approved recipes, continue runs, complete steps, block steps, and view ready prep.

### Management
Can view all production states and create batch requests.

## Core model
Recipe -> Recipe Version -> Recipe Steps -> Batch Request -> Batch Run -> Batch Run Steps -> Ready

## Statuses
REQUESTED, IN_PROGRESS, BLOCKED, READY, CANCELLED

## Deferred
Toast API, inventory ledger, theoretical consumption, forecasting, garnish inventory, purchasing, supplier emails, waste/variance, costing, multi-location.
