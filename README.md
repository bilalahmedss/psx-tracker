# PSX Tracker

Personal portfolio tracker for the Pakistan Stock Exchange. Product brief: [PLAN.md](PLAN.md). Project rules: [CLAUDE.md](CLAUDE.md).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase values.
3. `npm run check:supabase` to confirm the keys work.
4. `npm run db:migrate` to create the tables, policies and seed data.
5. `npm run dev` and open http://localhost:3000

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `lint` | Next.js dev server, production build, ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:rls` | Row-level security isolation test against your Supabase project |
| `npm run db:generate` / `db:migrate` | Create / apply Drizzle migrations (uses `DIRECT_URL`) |
| `npm run db:inspect` | Read-only report of RLS status, policies and seed data |
| `npm run dev-user -- create` / `delete` | A confirmed test login, saved in `.env.local` |
| `npm run check:supabase` | Check `.env.local` keys and database connections |
