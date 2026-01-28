This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Dashboard setup (env + Supabase schema)

- This project supports running without environment variables configured (for lint/build runs). To fully exercise the dashboard features, set up a Supabase-backed environment.
- Copy the example env file and populate the values when you have a Supabase project:
  - cp .env.example .env.local
  - In .env.local, set at least:
    - NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
    - NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
- Install dependencies and run the app as usual:
  - npm install
  - npm run dev

- Supabase schema (MVP) is provided in the repo at supabase/schema.sql. To initialize your database, import this schema into your Supabase database (or run equivalent SQL in your Postgres instance):
  - Option A (Supabase SQL Editor): copy/paste the contents of supabase/schema.sql into the SQL editor for your project.
  - Option B (local/Postgres): psql -h <host> -d <db> -U <user> -f supabase/schema.sql
- After setting up the database, re-run the app to verify pages under /dashboard are accessible according to your role.
