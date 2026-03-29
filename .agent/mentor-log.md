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
- Added a third `COFILANG Faction Shirt` store item option, `ATHELETE Shirt Chinese Collar`, priced at `₱410.00`, through a follow-up contribution metadata migration.
- Fixed treasurer contribution detail navigation to rely on the shared subpage back button and updated store order-detail rendering to wrap long item labels and option text inside the payment table cell.
- Blocked duplicate settled store payments for contribution-specific payment flows by validating `recordTransaction` against the targeted contribution balance instead of the occupant's aggregate contributions balance.
- Removed the batch-payment UI path that allowed selecting already-settled store contributions and added server-side rejection for the same case.
- Expanded contribution detail order rendering to infer safe fallback cart details from fixed-price store amounts, recover previously missing COFILANG shirt order details, and normalize legacy `Default size` labels to `Submitted elsewhere` in the UI.
- Applied a targeted live migration that voided six bogus duplicate COFILANG shirt payment rows, backfilled missing cart payloads for ten paid occupants, and normalized the remaining legacy `Default size` cart rows to `Submitted elsewhere`.
- Expanded the batch payment dialog so any fully settled contribution now surfaces a `Settled` state and warning copy instead of only store contributions, while server-side batch validation rejects any selected contribution that already has zero remaining balance.
- Fixed the contribution-detail filter row so `Reset` stays inside the control group and changed the occupant table to show the latest payment timestamp in a `Payment Date` column instead of repeating the contribution deadline per row.
- Restored intentional extra-payment support for settled contributions by requiring an explicit warning confirmation in the batch dialog and single-payment dialog before allowing another payment to be recorded.
- Updated settled store add-on handling so confirmed additional merch purchases append to the existing cart metadata and increase the stored charge total instead of overwriting the earlier order.
