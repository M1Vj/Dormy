# Mentor Log

## 2026-02-23
- Started `feature/contribution-finance-suite` from `develop`.
- Registered atomic feature guide `14-contribution-finance-suite`.
- Updated checklist and quick-reference to include the new branch and scope.
- Scope set from `prompt.md`: contribution-first collections, grouped contribution expenses, multi-contribution payment flow, and reporting upgrades.
- Reworked treasurer finance navigation: removed `Finance` menu entry and promoted direct `Contributions` and `Contribution Expenses` entries.
- Added conditional treasurer maintenance visibility across sidebar, home, reporting, and maintenance workflows using `dorms.treasurer_maintenance_access`.
- Removed the treasurer finance hub route behavior (`/treasurer/finance` now resolves as not found) to enforce direct workflow entry points.

## 2026-02-25
- Added `scripts/extract_treasurer_drive_data.py` to recursively crawl the treasurer Drive folder and export spreadsheet values in DB-ready formats.
- Generated semester-separated artifacts under `output/spreadsheet/treasurer_drive_extract_2026_02_25`:
  - `first_sem_aug_2025_to_dec_2025` (all first sem sheets)
  - `second_sem_directory` (current root/second sem sheet directory)
- Produced `manifest_all_files.json`, `db_import_bundle.json`, and `db_import_rows.ndjson` for traceability and future database ingestion.

## 2026-03-02
- Fixed production crash on `/admin/home` by making service-role Supabase client creation fail-safe when `SUPABASE_SERVICE_ROLE_KEY` is missing.
- Updated announcements and global admin stats server actions to gracefully fall back instead of throwing runtime exceptions in production render paths.
- Standardized finance-facing date/time output to `Asia/Manila` to prevent Vercel UTC shifts in server-rendered contribution pages, receipt emails, and XLSX exports.

## 2026-03-05
- Removed role AI workspaces from Admin, Adviser, Student Assistant, Treasurer, and Officer by deleting all `/ai` role pages.
- Removed remaining home-page AI shortcuts from Adviser and Officer dashboards to avoid dead links.
- Added middleware guard to redirect any direct `/role/ai` access attempts back to `/<role>/home`.

## 2026-03-06
- Stress-tested occupant workflows across desktop, tablet, and mobile using Playwright-driven UI navigation.
- Fixed occupant fine-report detail navigation by routing report links to `/occupant/fines/reports/[id]` instead of non-role `/fines/reports/[id]`.
- Fixed event rating flow mismatch with database constraints by standardizing ratings to `1-5` in UI and server action validation.
- Updated rating scale labels so `Poor`, `Satisfactory`, and `Excellent` remain visible on mobile.
- Stress-tested adviser workflows end-to-end (committees, maintenance finance, evaluation templates, reporting print trigger) via Playwright-driven UI navigation.
- Fixed committee member assignment failures by auto-healing missing `dorm_memberships` rows for valid active occupants in the same dorm.
- Added server-side overpayment guards in finance transaction recording to block payments that exceed outstanding ledger balance.
- Enabled Adviser/Admin/Student Assistant template activation UI with a working action button and hardened `updateTemplate` authorization + service-role write fallback.

## 2026-03-29
- Fixed contribution detail store rendering to use one canonical cart snapshot so the same ordered item is not shown twice when charge and payment metadata both carry cart payloads.
- Added optional contribution support across treasurer contribution creation, batch payment, per-occupant payment, contribution details, reporting, finance totals, exports, and reminder flows.
- Implemented per-occupant optional decline handling as non-income contribution adjustments that zero only that contribution's payable while keeping other contributions unaffected.
- Added optional-decline email delivery so occupants receive a "will not pay" or "will not avail" notice instead of a receipt when no income is recorded.
- Applied and committed live Supabase migrations for `COFILANG Faction Shirt` to add `Submitted elsewhere` size choice metadata and mark the contribution optional.
- Fixed treasurer finance table overflow and verified the new optional decline UX in the browser, including automatic total recalculation to `₱0.00`.
