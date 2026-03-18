# Dormy — Project Overview (Source of Truth)

## Detailed Project Description
Dormy is an all-in-one web app for managing dormitory operations at **Visayas State University — Molave Men’s Hall**, with an architecture that can later support **multi-dorm tenancy** (separate data per dorm) and cross-dorm events.

The app centralizes:
- **Occupant management** (rosters, rooms, floors/levels, moves/exit)
- **Fines** (searchable, rule catalog, balances, deductions/points)
- **Finance monitoring** across separate ledgers (**Adviser**, **Student Assistant**, **Treasurer**)
- **Evaluation & ranking** (dynamic metrics/weights, top 30% retention workflows)
- **Events** (calendar, ratings/comments, photos, teams + scoring + rankings)
- **Exports** (Excel `.xlsx` reports)
- **AI + Voice** assisted structuring (e.g., event concepts → structured plan text)

## Confirmed Product Decisions (v1)
- **Dorm scope**: Molave only in v1 UI, but **tenant-aware** data model and APIs from day 1.
- **Auth**: Users can sign in with **Google** (recommended) or with an admin-provisioned email+password account.
  - Dorm access is granted via **Invites** (preferred) or **Applications** reviewed by staff.
  - **No public dorm access**: signing in does not automatically grant a dorm role.
- **Roles**: Adviser and Assistant Adviser share the same UI/permissions.
- **Theme**: VSU/Molave-inspired (green + gold) with **dark mode**.
- **Fines defaults**: Minor (₱10, -1 point), Major (₱50, -10 points); per-rule overrides allowed.
- **Payments**: Partial payments allowed anytime (end-of-sem settlement still supported as a workflow).
- **Exports**: Excel `.xlsx` only.
- **Events**: calendar + ratings/comments + photos + competition mode (teams/scoring/rankings).
- **AI**: Google Gemini (free tier where possible) + browser voice-to-text.
- **Evaluation**: semester rules are fixed; **metrics and weights are configured later** (must be dynamic in the system).

## Tech Stack (Confirmed)
- **Framework**: Next.js **16.1.1** (App Router)
- **Language**: TypeScript **5.x**
- **UI**: Tailwind CSS **4.x** + **shadcn/ui**
- **Backend**: Supabase (Postgres + Auth + Storage)
- **AI**: Google Gemini API (free tier where possible)
- **Exports**: Excel `.xlsx`
- **Package Manager**: npm
- **Runtime**: Node.js 20+ recommended

## Repo Status (Current)
- The repository is already scaffolded as a Next.js app at the repo root (`package.json`, `src/app/*`).
- The `.maba/` folder contains the planning system and branch guides.

## Environment & Secrets
Required environment variables (use `.env.local`, never commit secrets):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; used for admin provisioning and privileged ops)
- `GEMINI_API_KEY` (server-side only)

## Data & Security Model (v1)
- **Tenant scoping**: every dorm-owned table must include `dorm_id` (FK → `dorms.id`).
- **Authorization source of truth**: `dorm_memberships` links `user_id` to `dorm_id` with a role.
- **RLS-first**: enable Postgres RLS on all dorm-scoped tables; default deny; allow by membership + role.
- **Occupant self-access**: occupant records may link to an auth user (`occupants.user_id`) so occupants can read their own data (balances, fines, evaluations) without exposing others.
- **Privileged actions**: Admin provisioning and cross-role operations must run server-side (server actions/routes) using `SUPABASE_SERVICE_ROLE_KEY`.
- **Auditability**: money/roles/scores changes should write an immutable audit event (append-only).
- **Finance safety**: prefer append-only finance records (void/reversal instead of hard delete).

### RBAC Summary (v1)
- **Admin**: full access to all modules and dorms (future), including configuration and audit logs.
- **Student Assistant (SA)**: manage occupants/rooms, fines (rules + issuance), and cleaning schedules; view clearance-relevant balances.
- **Treasurer**: manage event contributions/collections; view occupant roster and clearance-relevant balances.
- **Adviser / Assistant Adviser**: manage maintenance fee ledger; view clearance status and summary balances.
- **Dorm Officer (Events)**: manage events, teams, scoring, and rankings; view event-related contributions if needed.
- **Occupant**: view only own balances/fines/clearance status; participate in event ratings/comments and evaluations (no self-rating).

## Design System (Confirmed)
- **Visual direction**: VSU/Molave-inspired (green + gold), modern admin UI
- **Dark mode**: Yes (first-class, not an afterthought)
- **Component system**: shadcn/ui building blocks, accessibility-first

### UI/UX Rules (v1)
- Role-based navigation and dashboards (Admin sees all; Adviser & Assistant Adviser share UI)
- Fast global search for occupants and fines
- “Auditability by design”: every money-related action should be traceable (who, what, when)
- Mobile-friendly for quick checks (fines lookup, event attendance, quick collection status)

## Molave Baseline (v1 Defaults)
These are initial defaults for Molave; the system should keep them configurable for other dorms later.

### Dorm Profile
- Dorm type: men’s dorm (store as a dorm attribute/policy, not hard-coded).
- Typical capacity: 68 occupants (optional 70 if SA room is used for occupancy).

### Room Layout (3 Levels)
- **Level 1**: Room 1, 2, 3
- **Level 2**: Room 4a, 4b, 5, 6
- **Level 3**: Room 7, 8, 9, 10a, 10b
- Default capacities (configurable): normal rooms = 6; split big rooms (`4a/4b/10a/10b`) = 5 each.

### Student Identity
- Student ID format example: `23-1-00140` (store as text; do not treat as a number).
- Fines UX should support searching by name and by student ID.

### Cleaning (Weekdays)
- Weekdays only (holidays/non-class days handled via manual overrides in v1).
- Morning schedule (5:30 AM).
- Rest-week rotation per level: Level 1 → Level 2 → Level 3 → repeat.

### Evaluation & Retention
- “BigBrods” are the top retained occupants (target: top 30%).
- Sem 1 evaluations are tracked but **do not determine retention**; Sem 2 evaluations determine ranking/retention.
- Never allow self-rating.

## Core Functional Requirements (v1)
### Identity & Access
- Google sign-in supported (recommended), with optional password provisioning for staff-managed accounts
- Admin/Adviser can **invite** users by email (membership granted when user accepts)
- Users can **apply** to a dorm after signing in; staff review and approve/reject applications
- Role-based access control (RBAC) and role-specific UI:
  - **Admin** (superuser, all dorms/tenants later)
  - **Student Assistant (SA)** (fines, cleaning schedule tooling later, occupant ops)
  - **Treasurer** (event contributions/collections, payment monitoring)
  - **Adviser / Assistant Adviser** (same UI; maintenance fee tracking, clearance)
  - **Occupant** (view balances, event info, ratings, evaluation participation rules)
  - **Dorm Officer (Events)** (teams/scoring/rankings operations; can be isolated module)

### Multi-dorm Tenancy (Future-ready)
- Data model and APIs must be dorm-scoped (tenant-aware), even if v1 only runs Molave.
- Admin can later add dorms and assign staff/users to dorms.

### Occupants & Rooms
- Occupant list with room assignment and metadata (name + student ID support)
- Room & level model that matches Molave (rooms 1–10 with 4a/4b and 10a/10b; 3 levels)
- Occupants can exit anytime; new occupants can arrive if slots are available

### Fines (Rules + Balances)
- Searchable fines ledger (by occupant, rule, date, status)
- Dynamic fine rules catalog:
  - Default types: **Minor** (₱10, -1 point), **Major** (₱50, -10 points)
  - Support **Severe** violations (typically triggers removal; pesos/points configurable or optional)
  - Rules can be added/renamed/edited; overrides allowed per rule
- Import initial fine rules from the existing Excel sheet (one-time + repeatable import tool)
- Partial payments allowed anytime; final settlement at end-of-sem supported
- Excel `.xlsx` exports (statements and summaries)

### Finance Monitoring & Clearance
- Separate ledgers and reporting for:
  - **Adviser**: maintenance fee
  - **SA**: fines
  - **Treasurer**: event contributions
- Automatic clearance status computation (must be fully paid across required ledgers)

### Evaluation & Ranking (Retention)
- Configurable evaluation metrics and weights (defined later; system must support dynamic setup)
- Semester rules:
  - **Sem 1**: only BigBrods rate everyone (confirmed)
  - **Sem 2**: everyone rates others; never rate self (confirmed)
- Support point deductions from fines as part of evaluation scoring (SA fines-based scoring totals 100%)
- Ranking outputs (top 30% retention) and audit trail of calculations

### Events
- Calendar of events
- Event detail pages: description, attachments/photos, announcements
- Ratings for events with comments
- Competition mode: teams, scoring, ranking tables (can be isolated from core dorm ops)
- Multi-dorm events concept supported in model (later), but v1 is Molave-only

### AI + Voice (v1)
- Voice input → structured text concept capture for events (browser speech-to-text acceptable)
- Gemini-powered helpers (guardrailed):
  - Organize fines data (grouping, summaries, anomaly checks)
  - Turn raw event ideas into structured plans/checklists

## Target Audience & Use Cases
- **Student Assistants**: manage fines, quick lookup, end-of-sem settlement, exports
- **Treasurer**: monitor contributions, reconcile collections, event accounting summaries
- **Adviser/Assistant Adviser**: maintenance fee overview, clearance signing support, reports
- **Occupants**: transparency of balances, event participation, evaluation participation
- **Admin**: configuration, multi-dorm future expansion, full visibility and audit

## Key Non-Goals (for v1)
- Automated room assignment logic (Molave-specific constraints) unless explicitly prioritized later
- Offline-first mobile app (web-first)

## Open Questions / TBD (Tracked)
- Exact evaluation metrics and weight percentages (must be configurable in UI).
- Whether every occupant must have an auth account, or only some (staff + selected occupants).
- Event scoring tie-break rules (e.g., highest last-category, least penalties, manual override).
- Import templates: finalize the exact column mapping for the provided fines Excel file.
