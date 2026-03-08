# Outback Connections

Rural Australia's marketplace for jobs, freight, and equipment. Built by Outback Fencing & Steel Supplies Pty Ltd.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Auth**: NextAuth v5 (Google OAuth)
- **Database**: PostgreSQL via Supabase
- **ORM**: Prisma
- **Styling**: Tailwind CSS
- **Validation**: Zod
- **Hosting**: Vercel

## Getting Started

```bash
cp .env.example .env.local
# Fill in your environment variables
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Environment Variables

See `.env.example` for all required variables. The app runs in demo mode without database credentials — job posting and live listings are disabled until Supabase is connected.

## Deploy on Vercel

Push to `main` to trigger auto-deploy via Vercel. Make sure all environment variables are set in the Vercel dashboard.
