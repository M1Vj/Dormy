# Feature 13 — Cleaning Schedule (Molave) Closeout

## Branches and PRs
- `feature/cleaning-schedule-core` -> PR #21 -> merged to `develop`
- `feature/cleaning-schedule-ui` -> PR #22 -> merged to `develop`

## Scope Delivered
- Added cleaning schedule domain/server actions (`src/app/actions/cleaning.ts`)
- Added cleaning types (`src/lib/types/cleaning.ts`)
- Added cleaning DB integrity migration (`supabase/migrations/20260216003000_cleaning_constraints.sql`)
- Added `/cleaning` role-aware page and workspace UI
- Added sidebar navigation entry for cleaning module

## Verification
- `supabase db push --local --include-all --yes`
- `npm run lint`
- `npm run build`
- Playwright:
  - admin: load areas, generate assignments, edit assignment, add/remove exception
  - student assistant: management controls visible
  - occupant: view-only schedule
  - route smoke checks for key modules

## Artifacts
- `output/playwright/cleaning-admin.png`
- `output/playwright/cleaning-sa.png`
- `output/playwright/cleaning-occupant.png`
