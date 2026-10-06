# Fake Supabase for page checks (local only)

A small stand-in for the Supabase API so a **built** page can be checked with
fake signed-in people (member, staff, admin). Fixture data and fake contacts
only; nothing talks to a hosted service, and results are never a hosted test.

```bash
node scripts/fake-supabase/run.mjs &            # :54421
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54421 NEXT_PUBLIC_SUPABASE_ANON_KEY=fake
npm run build && npx next start -p 3300 &
PW_CHROMIUM=/path/to/chromium npx playwright test -c scripts/fake-supabase/playwright.config.ts
```
