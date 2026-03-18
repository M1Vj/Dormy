# Review-06: Payments Clearance & Finance Module

**Reviewer:** Quality Assurance Lead (The Auditor)
**Date:** 2025-12-29
**Branch:** `feature/payments-clearance`
**Scope:** `src/app/actions/finance.ts`, `src/app/(app)/admin/finance/**/*`, Schema Usage.

## Findings

### 1. Correctness & Multi-Tenancy (High Priority)
**Issue:** Admin pages (`EventsFinancePage`, `MaintenancePage`) lack explicit `dorm_id` filtering in their Supabase queries.
**Context:** The app supports multiple dorms (evidenced by `dorm-switcher.tsx`).
**Risk:** If a user is an Admin of multiple dorms, RLS will return data for *all* of them. The UI will mix events and occupants from different dorms into a single list, violating tenant isolation context.
**Recommendation:** 
- Obtain the current `dorm_id` (likely from URL params or a server-side context helper) and enforce `.eq('dorm_id', currentDormId)` on all top-level queries (`events`, `occupants`, `ledger_entries`).
- Current implementation in `MaintenancePage` tries to guess `dormId` for the dialogs using `occupants[0]?.dorm_id`, which is brittle.

### 2. Robustness: Signed Arithmetic (Medium Priority)
**Issue:** `recordTransaction` in `finance.ts` trusts the caller to provide the correct sign for `amount`.
**Context:** Payments must be negative to reduce debt. The `PaymentDialog` correctly negates the input (`-values.amount`), but the backend action accepts raw numbers.
**Risk:** Future API calls (or other dialogs) might mistakenly send positive numbers for payments, INCREASING debt instead of resolving it.
**Recommendation:** Enforce logic in `recordTransaction`:
- If `entry_type === 'payment'`, force `amount = -Math.abs(amount)`.
- If `entry_type === 'charge'`, force `amount = Math.abs(amount)`.

### 3. Performance (Low Priority)
**Issue:** `EventsFinancePage` fetches global `ledger_entries` (scoped by RLS) and does client-side aggregation (JS `reduce`).
**Context:** It fetches all treasurer entries for the allowed scope to calculate `collected`/`charged`.
**Risk:** As the ledger grows, this query will become slow.
**Recommendation:** In the future, create a Database View or RPC to calculate event balances server-side. For now, it is acceptable for V1 but worth noting.

## Status: FAIL
**Reason:** The missing `dorm_id` filtering in Admin views is a functional correctness issue for multi-dorm admins and creates UI confusion.

## Action Plan
1.  **Backend Coder:** Update `recordTransaction` to enforce sign based on `entry_type`.
2.  **Frontend Coder / Backend Coder:** Update `EventsFinancePage` and `MaintenancePage` to retrieve the current `dorm_id` context and filter queries. (Note: This might require checking how `layout.tsx` handles dorm context or if it should be a dynamic route `[dormId]`).

*(Note: If the app design strictly enforces "One User = One Dorm" at the RLS level for the current session, the filtering issue might be mitigated, but explicit filtering is standard practice.)*
