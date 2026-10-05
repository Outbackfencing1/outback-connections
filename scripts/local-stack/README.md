# Local stack (no hosted services, no cost)

A throwaway environment for proving the digital-services flow end to end
**locally**. It isn't a hosted test, and its results must never be reported
as one.

It runs four pieces:
- Postgres 16, with the draft migrations applied exactly as written;
- PostgREST;
- a small gateway that mimics the Supabase API paths (`/rest/v1`, `/auth/v1/user`);
- persona sign-ins minted with a random per-run secret.

The app imports nothing from this folder.

```bash
# needs: Postgres 16 binaries, a PostgREST v12 binary, Playwright Chromium
POSTGREST_BIN=/path/to/postgrest scripts/local-stack/start.sh
set -a; source /var/tmp/oc-local-stack/app.env; set +a
npm run build && npx next start -p 3200 &
npx playwright test -c scripts/local-stack/playwright.local.config.ts
scripts/local-stack/stop.sh
```

`flow.spec.ts` checks:
- **The owner queue gate:** logged out goes to sign-in. An ordinary member gets 404. A different marketplace admin (`user_profiles.is_admin`) gets 404.
- **No JavaScript:** nothing is saved and no personal field reaches the URL.
- **Public page:** the form saves exactly one enquiry. The alert result is recorded (no mail key here, so `notify_error=no_api_key`) and the lead is kept. Replaying the exact submission returns the same reference without a second row.
- **Joshua's queue:**
  - shows the lead;
  - a status change says "saved" only once the database returns the updated row;
  - a refused write says "Not saved";
  - a deleted row says it no longer exists.

`seed-pilot.mjs <pack.json>` loads a private pilot pack into the draft pilot
tables and checks the database's draft hashes match the pack's. Pilot packs
hold prospect data, so they stay out of this public repository.

Recordings are off. The spec saves one deliberate screenshot of fixture data
to the path in `FLOW_SCREENSHOT`.
