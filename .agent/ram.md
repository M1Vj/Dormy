# RAM

## Current Status
- Implemented the finance separation follow-up for gadgets and clearance: gadget-specific action layer, gadget workspace UI for student assistant, gadget summaries on occupant detail pages, gadgets in finance totals / clearance / exports, and client-side non-reloading search on occupant and finance collection pages.
- Tightened contribution expense permissions so contribution submissions are limited to treasurer / officer / student assistant (plus admin override) and contribution approvals are treasurer-only (plus admin override), while maintenance stays adviser / assistant adviser / student assistant scoped.
- Verified the new search UX and gadget workspace rendering with Playwright, fixed new TypeScript/build regressions introduced around the finance work, and pushed the pending gadget migrations to the linked Supabase project.
- Remote Supabase now includes `occupant_gadgets` and the `gadgets` ledger enum value, so the gadget finance path is no longer blocked by schema drift.

## Shared Journal
- **[2026-02-25]**: Discovered missing fallback logic in `parseContributionMetadata` on the treasurer detail page.
- **[2026-02-25]**: Fixed the `parseContributionMetadata` missing fallback logic in `[id]/page.tsx` and `[id]/receipt/page.tsx` to handle early entries with no metadata contribution ID.
- **[2026-02-25]**: Added explicit SQL `.or` filter queries to the contribution detail endpoints to solve premature data truncation by Supabase.
- **[2026-03-13]**: Traced the admin semester edit bug to two separate causes: global semester writes were still using the authenticated RLS client even though global rows have `dorm_id = NULL`, and archived legacy semesters were still included in overlap validation.
- **[2026-03-13]**: Updated `src/app/actions/semesters.ts` so global create/update/delete flows use a service-role client, archived rows no longer block overlap checks, and zero-row writes now return an explicit failure instead of a false success.
- **[2026-03-13]**: Updated `src/components/admin/semester-management.tsx` so the status badge reflects the stored semester status (`active` / `archived` / planned) instead of inferring status only from dates.
- **[2026-03-13]**: Added `tests/admin-semesters.spec.ts` to lock the regression: archived rows render the archived badge, and admin edits persist even with archived legacy overlaps.
- **[2026-03-13]**: Added gadget finance support across actions and UI: `src/app/actions/gadgets.ts`, `src/lib/gadgets.ts`, the student assistant gadget ledger page, occupant gadget cards, and gadget-aware finance overview / export / reporting code paths.
- **[2026-03-13]**: Replaced server-form occupant/collection search with client-side query updates in `src/components/admin/occupants/occupant-filters.tsx` and `src/components/finance/collection-filters.tsx`, removing full-page reloads from the search workflow.
- **[2026-03-13]**: Confirmed the linked Supabase project was missing the gadget schema, added an explicit migration-required warning path so `/student_assistant/finance/gadgets` and occupant gadget sections rendered predictably, then linked the project and pushed the missing migrations to remote.

HANDOFF: The linked Supabase project is now in sync for the gadget schema. If the gadget warning ever reappears in another environment, re-run `supabase migration list` and confirm remote contains `20260307125000` and `20260313123000`.

Commands run:
- `npx playwright test tests/admin-semesters.spec.ts --project=chromium`
- `npx eslint src/app/actions/semesters.ts src/components/admin/semester-management.tsx tests/admin-semesters.spec.ts`
- `npm run build`
- `npx playwright test tests/gadgets-search.spec.ts --project=chromium --no-deps`
- `supabase link --project-ref zyufuzktvqvvbdcaywet --password ...`
- `supabase db push --password ...`
