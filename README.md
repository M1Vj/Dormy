# Dormy

Dormy is a dormitory operations web app for **Visayas State University (VSU) — Molave Men's Hall**. It is built with **Next.js + Supabase** and designed to be **tenant-aware** so it can expand to multi-dorm use later.

## What It Covers (v1)

- Occupant roster and room assignments
- Fine rules + fines ledger (Student Assistant workflow)
- Payments and clearance status across separate ledgers:
  - SA fines
  - Treasurer event contributions
  - Adviser maintenance fees
- Evaluation and ranking (configurable metrics/weights; never allow self-rating)
- Events calendar + photos + ratings/comments + competition mode (teams/scoring)
- Cleaning schedule operations (Molave defaults, configurable later)
- Excel (`.xlsx`) exports
- AI helpers (Google Gemini) and voice-to-text capture

## Roles & Permissions (v1)

- `admin`: full access; can create `adviser` accounts and manage users
  - **Important:** `admin` cannot be assigned through the app UI. It must be set in the database.
- `adviser` / `assistant_adviser`: maintenance ledger and clearance workflows (can provision users, but cannot create `adviser` accounts)
- `student_assistant`: occupants/rooms, fines, cleaning schedule (can add occupants)
- `treasurer`: creates payable event contributions with deadlines, records paid users, and handles clearance-relevant finance views
- `officer`: creates/manages events and competition workflows
- `occupant`: read-only self view (balances/clearance), can participate in ratings/evaluation

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Supabase (Auth, Postgres, RLS, Storage)
- shadcn/ui + Radix + Tailwind CSS
- Sonner, React Hook Form, Zod

## Data Model Notes

- All dorm-owned tables are scoped by `dorm_id` (tenant-aware).
- `dorm_memberships` is the source of truth for who has access to which dorm and which `role`.
- Row Level Security (RLS) is enabled for dorm-scoped data. Server-side privileged actions use `SUPABASE_SERVICE_ROLE_KEY`.

## Prerequisites

- Node.js 20+
- npm
- Docker Desktop (only if you want local Supabase)
- Supabase CLI

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
cp .env.example .env.local
```

### Remote Supabase (hosted, recommended)

1. Set `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>`
- `SUPABASE_SERVICE_ROLE_KEY=<your service role key>` (server-side only)
- `GEMINI_API_KEY=<your gemini key>` (server-side only)

2. Link the repo to your Supabase project:

```bash
supabase link --project-ref <project-ref> --password <db-password> --yes
```

3. Push migrations to hosted DB:

```bash
supabase db push --linked --include-all --yes -p <db-password>
```

4. Seed core data (recommended)

Local development runs `supabase/seed.sql` automatically during `supabase db reset`. For hosted Supabase, run `supabase/seed.sql` in the Supabase Dashboard SQL editor to create:

- the Molave dorm (`molave-mens-hall`)
- room inventory
- starter fine rules (optional)

5. Bootstrap the first admin (required)

There is **no public sign-up**. You must:

- Create an auth user in Supabase Auth (Dashboard or service-role tooling).
- Insert/update `public.profiles` for that `auth.users.id`.
- Insert/update `public.dorm_memberships` with `role = 'admin'`.

Seed template (replace `<ADMIN_USER_ID>`):

```sql
with dorm as (
  select id from public.dorms where slug = 'molave-mens-hall'
)
insert into public.profiles (user_id, display_name)
values ('<ADMIN_USER_ID>'::uuid, 'Dorm Admin')
on conflict (user_id) do update set display_name = excluded.display_name;

with dorm as (
  select id from public.dorms where slug = 'molave-mens-hall'
)
insert into public.dorm_memberships (dorm_id, user_id, role)
select dorm.id, '<ADMIN_USER_ID>'::uuid, 'admin'::app_role
from dorm
on conflict (dorm_id, user_id) do update set role = excluded.role;
```

6. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

### Local Supabase (optional)

Local is useful for offline development, but hosted is recommended for team/dev/prod.

1. Start local Supabase:

```bash
supabase start
```

2. Reset local DB (migrations + `supabase/seed.sql`):

```bash
supabase db reset --local --yes
```

3. Set `.env.local` using keys from:

```bash
supabase status -o env
```

4. Run the app:

```bash
npm run dev
```

## Scripts

### Import Occupants From XLSX

This imports occupants into the configured Supabase target (remote or local). Keep spreadsheets out of git.

```bash
set -a; source .env.local; set +a
npm run import:occupants:xlsx -- /absolute/path/to/occupants.xlsx
```

If your main workbook lists BigBrods separately (common in Molave), pass the BigBrods room assignment workbook as a second argument:

```bash
set -a; source .env.local; set +a
npm run import:occupants:xlsx -- /absolute/path/to/occupants.xlsx /absolute/path/to/bigbrods-room-assignments.xlsx
```

Notes:

- The import script seeds Molave room inventory if rooms are missing (room codes `1-3`, `4a/4b`, `5-9`, `10a/10b`).
- The script will fail if any occupant is missing a room assignment, to avoid partially-assigned rosters.

Optional env overrides:

- `DORMY_DORM_SLUG` (default: `molave-mens-hall`)
- `DORMY_OCCUPANT_SHEET` (default: `ALPHABETICAL`)
- `DORMY_OCCUPANT_BY_ROOM_SHEET` (default: `BY ROOM`)
- `DORMY_BIGBRODS_ROOM_SHEET` (default: first sheet in the BigBrods workbook)
- `DORMY_OCCUPANT_JOINED_AT` (default: today)
- `DORMY_ROOM_ASSIGNMENT_START_DATE` (default: `DORMY_OCCUPANT_JOINED_AT`)
- `DORMY_OCCUPANT_STATUS` (default: `active`)

### Demo Account Password Reset (local/demo only)

When demo users already exist, normalize all demo passwords:

```bash
set -a; source .env.local; set +a
npm run reset:demo-passwords
```

Default password: `DormyPass123!` (override with `DORMY_DEMO_PASSWORD`).

## Quality Gates

```bash
npm run lint
npm run build
npm run start
```

## Deployment (Vercel)

```bash
vercel login
vercel link
vercel env pull .env.local
npm run build
vercel deploy
vercel deploy --prod
```

## Troubleshooting

- "Invalid login credentials": make sure you are pointing at the expected Supabase project in `.env.local` (remote vs local), and that the auth user exists with a known password.
- "Supabase env is not configured": copy `.env.example` to `.env.local` and set keys.
