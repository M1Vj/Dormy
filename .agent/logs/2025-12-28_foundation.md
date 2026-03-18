# Active Protocol: Reviewer (Quality Audit)
*Status:* Foundation Complete / Ready for Next Phase

## 0. Dispatch Plan (For Orchestrator)
- **Backend Coder**: NO (No DB/API work yet; strictly UI foundation).
- **Frontend Coder**: YES (Primary).
- **Order**: Frontend Coder only.
- **Key Dependencies**: Next.js 16, Tailwind 4, shadcn/ui.

## 1. Objective
Initialize the "Dormy" application shell, including the design system (shadcn/ui), routing architecture (auth vs app groups), navigation layouts, and placeholder pages for the core modules.

## 2. Implementation Specs
- **UI Library**: `shadcn/ui` (latest).
- **Icons**: `lucide-react`.
- **Styling**: Tailwind CSS 4 (via `postcss` and css variables).
- **Theme**: "Molave" (Primary Color: Deep Green). Support Dark/Light mode.
- **Folder Structure**:
  - `src/components/ui`: Primitive components.
  - `src/components/nav`: Navigation components (Sidebar, Topbar).
  - `src/lib`: Utilities (`utils.ts`).
  - `src/app/(auth)`: Public/Auth routes.
  - `src/app/(app)`: Protected application routes.

## 3. Backend Spec (N/A)
*Skipped for Foundation phase.*

## 4. Frontend Spec (For Frontend Coder)
- **Design System**:
  - Initialize `shadcn/ui` with CSS variables.
  - Ensure `src/lib/utils.ts` contains the standard `cn()` helper (`clsx` + `tailwind-merge`).
  - Define "Molave Green" in `globals.css` as the primary color.
- **Layouts**:
  - Root Layout (`src/app/layout.tsx`): Load fonts, metadata, and ThemeProvider.
  - Auth Layout (`src/app/(auth)/layout.tsx`): Centered layout for login/signup.
  - App Layout (`src/app/(app)/layout.tsx`):
    - Left Sidebar (Collapsible): Navigation links.
    - Top Header: Breadcrumbs/Title + Theme Toggle + User Menu (placeholder).
    - Main Content Area.
- **Navigation Items**:
  - Dashboard (`/`)
  - Occupants (`/occupants`)
  - Fines (`/fines`)
  - Payments (`/payments`)
  - Evaluation (`/evaluation`)
  - Events (`/events`)
  - Admin (`/admin`)
- **Verification**:
  - `npm run dev` boots without errors.
  - Sidebar toggles correctly on mobile/desktop.
  - Dark mode switch works instantly.

## 5. Step-by-Step Instructions
1.  **[Setup]**:
    - Install core libs: `npm install lucide-react clsx tailwind-merge class-variance-authority next-themes`.
    - Run `npx shadcn@latest init`. Use `src/components`, `src/lib/utils.ts`, and CSS variables.
    - *Note*: Ensure `globals.css` retains Tailwind 4 directives (`@import "tailwindcss";`).
2.  **[Theming]**:
    - Update `src/app/globals.css`: Add CSS variables for light/dark mode. Set `--primary` to a "Molave Green" (e.g., HSL for a rich forest green).
    - Create `src/components/theme-provider.tsx` (wrapper for `next-themes`).
    - Wrap `src/app/layout.tsx` with `ThemeProvider`.
3.  **[Components]**:
    - Add basic shadcn components: `npx shadcn@latest add button card separator sheet dropdown-menu avatar input`.
    - Create `src/components/nav/app-sidebar.tsx`: Use `lucide-react` icons for the modules.
    - Create `src/components/nav/user-nav.tsx`: Placeholder user dropdown.
4.  **[Routing & Pages]**:
    - Move `page.tsx` (Dashboard) to `src/app/(app)/page.tsx`.
    - Create `src/app/(app)/layout.tsx`: Implement the Sidebar + Header shell.
    - Create empty pages (return `<div className="p-4"><h1>Title</h1></div>`) for:
      - `src/app/(app)/occupants/page.tsx`
      - `src/app/(app)/fines/page.tsx`
      - `src/app/(app)/payments/page.tsx`
      - `src/app/(app)/evaluation/page.tsx`
      - `src/app/(app)/events/page.tsx`
      - `src/app/(app)/admin/page.tsx`
    - Create `src/app/(auth)/login/page.tsx` (Placeholder login form).
5.  **[Cleanup]**:
    - Remove default Next.js homepage content (vercel logos etc) if present.

## 6. Definition of Done
- `npm run build` passes.
- Visiting `/` shows the Dashboard inside the App Shell.
- Visiting `/login` shows the Auth Layout.
- Navigation links work and highlight active state.
- Dark mode toggles correctly.

## 4. SHARED JOURNAL (APPEND ONLY)
<!-- AGENTS MUST APPEND CONCISE ENTRIES BELOW THIS LINE -->
- **[Builder]:** Initialized project structure and .maba ecosystem.
- **[Researcher]:** Analyzed `package.json` (Next.js 15.1.0, React 19, Tailwind 4).
- **[Researcher]:** Reviewed 14 feature files in `.maba/features/`. Validated scope covers full dorm lifecycle (Occupants -> Fines -> Events -> Evaluation).
- **[Researcher]:** Confirmed dependencies: `shadcn/ui` (Foundation), `Supabase` (Database/Auth), `Gemini` (AI).
- **[Orchestrator]:** Verified feature files and initialized Foundation phase. Dispatching Planner.
- **[Planner]:** Defined "Foundation" spec. Focus: App Shell, Tailwind 4 config, shadcn/ui init, and Routing Structure ((app)/(auth)). Dispatching Frontend Coder.
- **[Orchestrator]:** Intervened to execute Foundation Plan due to CLI issues.
- **[Orchestrator]:** Initialized shadcn/ui, configured Tailwind 4 + Molave Theme (`globals.css` + `tailwind.config.ts`), built App Shell (Sidebar/Layouts), and created placeholder routes.
- **[Orchestrator]:** Verified build: PASS. Foundation phase complete.
- **[Reviewer/Orchestrator]:** Audited Foundation against spec. Found 4 issues: missing ModeToggle, missing UserNav, no active link highlighting, using `<a>` instead of `<Link>`.
- **[Orchestrator]:** Fixed all issues: Created `mode-toggle.tsx`, `user-nav.tsx`, updated `app-sidebar.tsx` (Link + usePathname), updated `(app)/layout.tsx` (header with toggle + user nav).
- **[Orchestrator]:** Final build verified: PASS. All routes compile. Foundation phase COMPLETE. Ready for commit.
