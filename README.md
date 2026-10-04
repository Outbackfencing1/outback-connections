# Outback Connections

Rural Australia's free business directory and marketplace, run by Outback
Fencing & Steel Supplies Pty Ltd. Live at https://www.outbackconnections.com.au.

Today the live vertical is **Services** (mostly fencing contractors, NSW),
with a staff outreach workspace behind it. Jobs and Freight exist but stay
hidden from navigation while empty.

- Rules for anyone working here (people or agents): `AGENTS.md`
- Architecture source of truth: `SPINE-BUILD.md`
- Current state, decisions and next steps: `HANDOFF.md`

## Stack

- Next.js 16 (App Router), React 18, TypeScript, Tailwind
- Supabase: Postgres + Auth + RLS. Schema is raw SQL in `supabase/migrations/`
- Resend for transactional email
- Vercel: pushing `main` deploys production. Crons in `vercel.json`

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. Without Supabase keys the app runs in a read-only
demo mode. Server-side writes (imports, directory add, claims, analytics)
need `SUPABASE_SERVICE_ROLE_KEY`, which is only set on Vercel.

## Gate before pushing

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

CI (`.github/workflows/ci.yml`) runs the same on every push and pull request.
