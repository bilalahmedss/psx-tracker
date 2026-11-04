# PSX Tracker

Personal portfolio tracker for the Pakistan Stock Exchange. Product brief: [PLAN.md](PLAN.md). Project rules: [CLAUDE.md](CLAUDE.md).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase values.
3. `npm run check:supabase` to confirm the keys work.
4. `npm run dev` and open http://localhost:3000

## Scripts

- `npm run dev` / `npm run build` / `npm run lint`
- `npm test`: Vitest
- `npm run db:generate` / `npm run db:migrate`: Drizzle migrations (uses `DIRECT_URL`)
