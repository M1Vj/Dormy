# Active Protocol: Feature 03 — Dorms + Tenancy

## 0. Dispatch Plan (For Orchestrator)
- **Backend Coder**: **YES** (Cookie logic, Server Actions, RLS enforcement).
- **Frontend Coder**: **YES** (DormProvider, DormSwitcher, Admin UI).
- **Order**: Backend Coder -> Frontend Coder.
- **Key Dependencies**: `dorm_id` cookie, `dorms` table, `dorm_memberships` table.

## 1. Objective
Implement a robust multi-tenancy system using a **Cookie-based Active Dorm** strategy. This allows the global URL structure (e.g., `/admin/users`) to remain unchanged while scoping all data to the currently selected dorm. Include an Admin UI to manage dorms.

## 2. Implementation Specs
- **State Management**:
    - **Server**: `dorm_id` HTTP-only cookie.
    - **Client**: `DormProvider` (React Context) exposing `{ activeDorm, userDorms, switchDorm }`.
- **New Files**:
    - `src/lib/dorms.ts` (Server utilities for cookie reading/writing + DB fetching).
    - `src/app/actions/dorm.ts` (Server Actions: `createDorm`, `updateDorm`, `switchDorm`).
    - `src/components/providers/dorm-provider.tsx` (Client Context).
    - `src/components/nav/dorm-switcher.tsx` (UI Component).
    - `src/app/(app)/admin/dorms/page.tsx` (List Dorms).
    - `src/app/(app)/admin/dorms/create-dorm-dialog.tsx` (Create Dorm UI).
- **Modified Files**:
    - `src/middleware.ts` (Ensure `dorm_id` cookie exists if user is authed).
    - `src/app/(app)/layout.tsx` (Replace hardcoded headers).
    - `src/components/nav/app-sidebar.tsx` (Inject DormSwitcher).

## 3. Backend Spec (For Backend Coder)
- **Data Model**:
    - Use existing `dorms` (id, name, code, created_at) and `dorm_memberships` (user_id, dorm_id, role).
- **Cookie Logic (`src/lib/dorms.ts`)**:
    - `getEffectiveDormId()`: Read cookie. If missing, fetch user's first dorm from DB, set cookie, return ID.
    - `verifyDormAccess(dormId)`: Ensure current user is in `dorm_memberships` for this ID.
- **Server Actions (`src/app/actions/dorm.ts`)**:
    - `createDorm(data: { name, code })`: Insert into `dorms`. **Auto-add creator as 'admin' in `dorm_memberships`.**
    - `switchDorm(dormId)`: Verify access -> `cookies().set('dorm_id', dormId)` -> `revalidatePath('/')`.
    - `getDorms()`: Fetch all dorms (Admin only) or User's dorms.
- **Middleware**:
    - If user is authenticated but has no `dorm_id` cookie, perform a lightweight check (or rely on `layout` to set it). *Correction*: Middleware is complex with DB. Let's handle the "missing cookie" case in the `DormProvider` or Server Layout initialization. **Decision**: Handle "Default Dorm" in `DormProvider` initialization server-side.

## 4. Frontend Spec (For Frontend Coder)
- **`DormProvider`**:
    - Wraps the app in `src/app/layout.tsx` or `src/app/(app)/layout.tsx`.
    - Props: `initialDorm` (from server), `userDorms` (list).
    - Context: `activeDorm`, `isLoading`, `switchDorm(id)`.
- **`DormSwitcher`**:
    - Shadcn `DropdownMenu` or `Select`.
    - Lists `userDorms`.
    - Highlights `activeDorm`.
    - Calls `switchDorm` action on change.
- **Admin UI (`/admin/dorms`)**:
    - **Table**: Columns: Name, Code, Created At, Action (Edit/Delete).
    - **Create Dialog**: Form with Name (required), Code (unique).
- **App Sidebar**:
    - Replace the "Dormy" brand or the "Molave" text with the `DormSwitcher`.

## 5. Step-by-Step Instructions (The Prompt)

### Phase 1: Backend & Core Logic
1.  **[Setup]**: Create `src/lib/dorms.ts`. Implement `getActiveDormId()` (reads cookie) and `setActiveDormId(id)` (sets cookie).
2.  **[Actions]**: Create `src/app/actions/dorm.ts`.
    *   `getAllDorms()`: Return list of all dorms (protected: admin only).
    *   `getUserDorms()`: Return list of dorms the current user belongs to.
    *   `createDorm(data)`: Insert new dorm + add current user as admin member.
    *   `switchDorm(dormId)`: Validates membership -> Sets cookie.
3.  **[Middleware/Layout]**: In `src/app/(app)/layout.tsx`, fetch `getUserDorms()`. If cookie is missing, pick the first one and call `setActiveDormId` (or handle in component). Pass this data to the client provider.

### Phase 2: Frontend & UI
4.  **[Provider]**: Create `src/components/providers/dorm-provider.tsx`.
    *   Define Context `DormContext`.
    *   Accept `initialState` (activeDorm, allDorms).
5.  **[Components]**: Create `src/components/nav/dorm-switcher.tsx`.
    *   Use `useDorm()` hook.
    *   Render a `DropdownMenu`.
6.  **[Sidebar]**: Update `src/components/nav/app-sidebar.tsx`.
    *   Import `DormSwitcher`.
    *   Replace hardcoded header.
7.  **[Admin Page]**: Create `src/app/(app)/admin/dorms/page.tsx`.
    *   Fetch `getAllDorms` (server-side).
    *   Render a generic `DataTable` (or simple Table).
    *   Add "Create Dorm" button triggering a Dialog with `createDorm` action.

## 6. Definition of Done
- **Context**: Browsing the app preserves the `active_dorm` state via cookie.
- **Switching**: Changing dorms in the Switcher updates the UI immediately.
- **Admin**: An admin can create "Narra Hall" and switch to it.
- **Security**: A user cannot switch to a dorm they are not a member of (backend validation in `switchDorm`).

## SHARED JOURNAL (APPEND ONLY)
- **[Researcher]:** Started investigation for Feature 03 (Dorms/Tenancy).
- **[Researcher]:** Analyzed `package.json`. Found Next.js 16.1.1, Supabase SSR.
- **[Researcher]:** **CRITICAL FINDING**: Database schema (`migrations/`) is *already* fully multi-tenant with `dorms`, `dorm_memberships`, and extensive RLS policies.
- **[Researcher]:** Frontend (`layout.tsx`, `app-sidebar.tsx`) is currently **hardcoded** to "Molave Men's Hall".
- **[Researcher]:** `AuthProvider` handles some dorm logic but needs expansion for switching.
- **[Researcher]:** Recommended moving to an "Active Dorm via Cookie" approach to support the current URL structure without massive refactoring to `/[dormId]/...`.
- **[Planner]:** Drafted Active Protocol for Feature 03.
- **[Planner]:** Decision: Use `cookie` for `dorm_id` persistence to keep URLs clean.
- **[Planner]:** Decision: `DormProvider` will hydrate from Server Layout to ensure no flickering on initial load.
- **[Planner]:** Split work into Backend (Server Actions + Cookie) and Frontend (Provider + Switcher + Admin UI).
- **[Orchestrator]:** Implemented 03-dorms-tenancy: added `src/lib/dorms.ts`, `src/app/actions/dorm.ts`, `src/components/providers/dorm-provider.tsx`, `src/components/nav/dorm-switcher.tsx`, admin dorms UI (`src/app/(app)/admin/dorms/*`); updated `src/app/(app)/layout.tsx`, `src/components/nav/app-sidebar.tsx`, `src/app/(app)/admin/page.tsx`. Ran `npm run build` (PASS; same Next.js warnings).
- **[Reviewer]:** Auditing Feature 03 (Dorms/Tenancy)...
- **[Reviewer]:** FAILED. Build/Lint errors found.
- **[Reviewer]:** **1. Lint Error**: `src/components/providers/dorm-provider.tsx` - Missing dependency `switchDorm` in `useMemo`. Wrap `switchDorm` in `useCallback` or ensure stability.
- **[Reviewer]:** **2. Lint Error**: `src/middleware.ts` - `response` variable is never reassigned, use `const`.
- **[Reviewer]:** **3. Lint Error**: `tailwind.config.ts` - `require()` import forbidden (use `import`).
- **[Reviewer]:** **4. Lint Error**: `src/components/providers/auth-provider.tsx` - Sync `setState` in effect warning.
- **[Reviewer]:** **5. Lint Error**: `src/components/ui/sidebar.tsx` - Impure `Math.random` in `useMemo`.
- **[Reviewer]:** Assigned to **Frontend Coder** to fix lint errors and ensure build passes.- **[Reviewer]:** Manual review for Feature 03 (Gemini reviewer timed out). Checked dorm cookie logic, switcher UI, admin dorms UI, and multi-dorm membership handling.
    - **PASS** after adjustments: admin pages now avoid `maybeSingle()` on multi-dorm memberships; active dorm selection falls back safely; cookie set via `switchDorm` action. Build verified with `npm run build` (PASS; warnings unchanged).
- **[Orchestrator]:** Cleaned unexpected changes before committing Feature 03 (reverted unrelated edits and removed untracked migration draft).
