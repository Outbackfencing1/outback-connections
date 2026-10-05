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
- **Message approval:**
  - It is made only on the review screen, which shows the exact copy, hash, evidence (with age and method) and uncertainties.
  - It goes through Joshua's own session and creates no send event.
  - New evidence makes the revision stale.
  - A member gets a 404 on the screen, and their session calling the function is refused.
- **Sales controls:**
  - draft quote → sent → accepted;
  - production is refused until deposit evidence (with GST) is recorded;
  - duplicate evidence (spacing/case changed) is refused;
  - launch is refused until paid in full;
  - a conversation note is logged against the quote.
- **Quote list:** paged and filtered (open by default, all on request), so 56 fixture quotes stay reachable and a withdrawn one shows under "all".
- **Conversation log:** entries not tied to a quote are paged, so 55 fixture entries stay reachable.

- **Preparation queue:**
  - A job is queued once (idempotent) and handed off to Joshua.
  - The downloaded packet's SHA-256 equals the database's.
  - A result for another packet is rejected; the right one is recorded and says nothing was approved, sent or published.
  - Members get a 404 on the packet.
  - No sideways scroll at phone width.

**Whole customer journey with restarts:** after `npm run build` with `app.env` sourced, run `scripts/local-stack/lifecycle.sh`. It runs `lifecycle.spec.ts` in three phases and restarts the app server between them. It checks the listener PID changed, so each unfinished state really survives a restart.

The phases:
1. Service page → one enquiry (alert fails, lead kept) → logged call → draft quote from the enquiry → sent (the price is then fixed).
2. Written acceptance → an insufficient deposit is gated → a refused save is visible → the remaining deposit → intake → production.
3. Client review → approved → launch gated on the balance → a duplicate balance is refused → launched → handed over. Then a care quote goes live without a payment gate.

Each phase screenshots the phone and desktop widths and fails on sideways scroll. The operator steps are in `docs/digital-services/OPERATOR-WALKTHROUGH.md`.

`seed-pilot.mjs <pack.json>` loads a private pilot pack into the draft pilot
tables and checks the database's draft hashes match the pack's. Pilot packs
hold prospect data, so they stay out of this public repository.

Recordings are off. The spec saves one deliberate screenshot of fixture data
to the path in `FLOW_SCREENSHOT`, and one of the sales section to `SALES_SCREENSHOT`.
