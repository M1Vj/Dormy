# Active Protocol: Occupants & Rooms Management

See detailed plan at: `.maba/plans/04-occupants-rooms.md`

## 0. Dispatch Plan (For Orchestrator)
- **Backend Coder**: YES (Refine actions)
- **Frontend Coder**: YES (Build UI)
- **Order**: Backend -> Frontend
- **Key Dependencies**: `src/app/actions/occupants.ts`, `src/app/actions/rooms.ts`

## SHARED JOURNAL (APPEND ONLY)
- **[Researcher]:** Started investigation for 'Occupants + Rooms' UI patterns.
- **[Researcher]:** Checked `src/app/(app)/admin` and `src/components/ui`.
- **[Researcher]:** Found that `admin/users` uses a raw HTML `table` inside a `Card`. No `table` component in `ui` folder.
- **[Researcher]:** Validated strict adherence to existing "Card + HTML Table" style for consistency.
- **[Researcher]:** Concluded that 'Rooms' is best visualized as a Grouped Grid (Levels -> Room Cards) rather than a table.
- **[Orchestrator]**: Validated research. Delegating to **Planner** to generate `.maba/plans/04-occupants-rooms.md`.
- **[Planner]**: Generated implementation plan `.maba/plans/04-occupants-rooms.md`. Defined backend actions (history/moves) and frontend views (Roster Table, Room Grid, Occupant Profile). Ready for dispatch.
- **[Orchestrator]**: Delegating to **Backend Coder** to implement server actions as per plan.
- **[Backend Coder]**: Refined `src/app/actions/occupants.ts`: `getOccupants` now returns active assignment reliably. Added `getOccupant` with history sorting.
- **[Backend Coder]**: Refined `src/app/actions/rooms.ts`: `getRoomsWithOccupants` ensures empty rooms are returned. `assignOccupant` handles atomic move (close old -> open new) and prevents duplicate assignment.
- **[Backend Coder]**: HANDOFF: Backend -> Frontend. Actions are ready. Frontend can assume `current_room_assignment` is null or an object with `room`. `room_assignments` history is available on single fetch.
- **[Orchestrator]**: Delegating to **Frontend Coder** (via Codex) to implement UI components and pages.
- **[Frontend Coder]**: Built `OccupantTable` (Card + HTML pattern) and `RoomGrid` (Level-grouped). Implemented `/admin/occupants` and `/admin/rooms` pages. Verified build success (`npm run build`).
- **[Frontend Coder]**: HANDOFF: Frontend -> Reviewer. UI is ready for audit.
- **[Orchestrator]**: Delegating to **Reviewer** to audit code quality, security, and plan alignment.
- **[Reviewer]:** Auditing '04-occupants-rooms'.
- **[Reviewer]:** CHECK: Backend actions use Supabase SDK and separate RLS client. (PASS)
- **[Reviewer]:** CHECK: RoomGrid structure matches Molave levels. (PASS)
- **[Reviewer]:** CHECK: Occupant Profile page `/admin/occupants/[id]`. (FAIL - Page does not exist)
- **[Reviewer]:** CHECK: Assignment UI interactivity. (FAIL - 'Assign occupant' buttons in RoomGrid are disabled; 'Edit' button in OccupantTable is disabled)
- **[Reviewer]:** CHECK: Filter capabilities. (FAIL - Missing 'Room' and 'Level' filters in Occupant List as per spec)
- **[Reviewer]:** FAILED. Returning to **Frontend Coder** to complete the UI implementation (Profile page, Assignment Modal/Dialog, and Edit functionality).
- **[Orchestrator]**: Delegating to **Frontend Coder** (via Codex) to fix issues: Create Profile page, implement Assign Dialog, enable buttons.
- **[Frontend Coder]**: Implemented `/admin/occupants/[id]`, `AssignOccupantDialog`, and filters for Room/Level. Wired Edit button to `?mode=edit`. Added `edit-occupant-form.tsx`.
- **[Backend Coder]**: Added `updateOccupant` action to support Edit functionality.
- **[Orchestrator]**: Delegating to **Reviewer** for final check.
- **[Reviewer]:** Auditing fixes for '04-occupants-rooms'.
- **[Reviewer]:** CHECK: Occupant Profile page created and functional (including Edit mode). (PASS)
- **[Reviewer]:** CHECK: Filters added to Occupants list. (PASS)
- **[Reviewer]:** CHECK: Assign Occupant Dialog implemented. (PASS)
- **[Reviewer]:** PASSED. Ready to merge.
- **[Orchestrator]**: Delegating to **Logger** to finalize feature `04-occupants-rooms`.
- **[Logger]:** Committing changes to 'feature/occupants-rooms'.
- **[Logger]:** Updating checklist item 04.
- **[Logger]:** Merging into 'develop'.
- **[Logger]:** Archiving RAM and resetting protocol.
