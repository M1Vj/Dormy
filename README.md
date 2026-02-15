# Dormy

Dormitory operations web app for Molave Men's Hall, built with Next.js + Supabase.

## Stack

- Next.js 16 (App Router, TypeScript)
- Supabase (Auth, Postgres, RLS, Storage)
- shadcn/ui + Radix + Tailwind CSS
- Sonner, React Hook Form, Zod

## Modules

- Role-based workspaces: `admin`, `student_assistant`, `treasurer`, `adviser`, `assistant_adviser`, `event_officer`, `occupant`
- Occupants, rooms, assignments
- Fines and ledger tracking
- Payments and clearance flows
- Evaluation cycles and scoring
- Events, competition mode, photos, ratings
- Cleaning schedule operations
- AI organizer + audit log
- XLSX exports

## Prerequisites

- Node.js 20+
- npm
- Docker Desktop
- Supabase CLI

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Choose a Supabase target:

- Remote Supabase (hosted): fill `.env.local` with your hosted project URL + keys (see below).
- Local Supabase: keep `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and use the keys from `supabase status -o env`.

4. Start local Supabase:

```bash
supabase start
```

5. Apply migrations + seed local DB:

```bash
supabase db reset --local --yes
```

6. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Remote Supabase Setup (Hosted)

1. Link the repository to your Supabase project:

```bash
supabase link --project-ref <project-ref> --password <db-password> --yes
```

2. Apply migrations to the hosted database:

```bash
supabase db push --linked --include-all --yes -p <db-password>
```

3. Set `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>`
- `SUPABASE_SERVICE_ROLE_KEY=<your service role key>`

4. Run the app:

```bash
npm run dev
```

## Demo Account Password Reset

When seeded demo users already exist, normalize all demo account passwords:

```bash
set -a; source .env.local; set +a
npm run reset:demo-passwords
```

Default password: `DormyPass123!` (override with `DORMY_DEMO_PASSWORD`).

Demo emails:

- `admin@dormy.local`
- `sa@dormy.local`
- `treasurer@dormy.local`
- `adviser@dormy.local`
- `assistant.adviser@dormy.local`
- `events@dormy.local`
- `occupant@dormy.local`

## Import Occupants From XLSX

```bash
set -a; source .env.local; set +a
npm run import:occupants:xlsx -- /absolute/path/to/occupants.xlsx
```

Optional env overrides:

- `DORMY_DORM_SLUG` (default: `molave-mens-hall`)
- `DORMY_OCCUPANT_SHEET` (default: `ALPHABETICAL`)
- `DORMY_OCCUPANT_JOINED_AT` (default: today)
- `DORMY_OCCUPANT_STATUS` (default: `active`)

## Quality Gates

```bash
npm run lint
npm run build
npm run start
```

## Vercel Deployment

```bash
vercel login
vercel link
vercel env pull .env.local
npm run build
vercel deploy
vercel deploy --prod
```

## Notes

- The app requires Supabase env vars for auth-enabled runtime paths.
- Local `supabase/config.toml` and generated artifacts should stay uncommitted.
