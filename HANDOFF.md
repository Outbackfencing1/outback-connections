# HANDOFF

Date: 2026-07-04 (previous: 2026-06-11)
Branch: `main`.
**Local-only / UNPUSHED commits awaiting a deliberate watched push:**
`74ff80c`, `dbce423` (services vertical: ingest fn + scraper mode), `adb57a2` (Gate 1 SEO/AI rails), `4a7721a` (Gate 3 services seeds + DRAFT categories), plus the 4 Jul Adzuna-layer commit (see below).
Nothing deploys until that watched push.

## 4 Jul 2026 session — sprint prep (no deploy, no prod writes)

1. **Watched push DE-RISKED:** `npm install` + `npx tsc --noEmit` + `npm run build` pass
   locally on the full unpushed head (the 11 Jun caveat "not typecheck-verified" is cleared).
2. **Adzuna syndicated layer BUILT (sprint item 2), env-gated:** `lib/adzuna.ts`
   (fetch → normalise → regions-table postcode resolve → service-role upsert into
   listings/job_details/listing_sources), `/api/cron/adzuna-sync` (daily 05:00 UTC,
   `?dry=1&limit=N` staged-rollout knobs), `scripts/adzuna-pull.mjs` (manual driver),
   `SyndicatedNotice` + "via Adzuna" card badge + browse attribution line. Rules:
   attributed, link-out via `/listings/[id]/source`, NO JSON-LD, NOT claimable, no
   business rows. No DB migration needed (`listings.metadata` carries ad extras).
   Without `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` the cron returns `not_configured`.
3. **Directory pilot validated (sprint item 3 prep):** `preview_scraped_import` dry-run
   on the staged 8 → 8/8 valid, 8 would_create, 0 dupes, `station-hand` resolves. Junk
   audit: **"Dubbo Farmers' Markets" is junk** (type=Market, an event not an employer);
   Karim is a real farm (sparse Google data). *(Superseded same evening: the full-payload
   audit cut it to 5 — see the executed-runbook section below.)*

## 4 Jul 2026 — runbook EXECUTED (evening session, Josh-authorised push)

- **Watched push DONE**: `c949426..6978707` (8 commits) → Vercel build READY. Live checks
  all pass: robots.txt (AI bots allowed), sitemap.xml (42 URLs), /services (20 categories),
  Farm Hand emits JobPosting+Organization+BreadcrumbList JSON-LD, adzuna-sync returns 401
  unauthenticated (= CRON_SECRET is set in prod and the auth gate works).
- **Pilot import DONE — 5, not 7**: full-payload junk audit caught 2 more noise rows before
  import: Cadagi Farm (Google type "Wedding venue" — the plan's canonical example) and
  Rosedale Farm ("Bed & breakfast" farm-stay). Imported via `ingest_scraped_business()`:
  Martelli Orchards, Hillside Harvest, Paraway Pastoral Co., Karim, DNW Livestock Services
  (all created; curated file now `data/staged-directory-pilot-5.json`). NOTE: `.env.local`
  has no Supabase keys — the import ran via the RPC over MCP; the CLI script needs
  NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local to be usable.
- **Honesty audit PASS**: /jobs shows 6 (5 Unclaimed-badged + Farm Hand); detail pages show
  ScrapedNotice + LocalBusiness JSON-LD (no JobPosting), claim CTA present, contact columns
  NULL (phone only in private raw_payload), 45-day expiry, claim_status=unclaimed.
- ⚠️ **Farm Hand ad expires 08 Jul 2026** — renew it (owner renew flow) or it drops off,
  taking the only JobPosting-emitting page with it. (The renewal-reminders cron should
  also email a signed renew link ~3 days out — check the inbox.)
- **Junk-rate carry-forward — `scripts/filter-scraped-types.mjs`**: the hand-staged pilot
  was 37% junk even after a name-level audit; the 5,890-lead NSW scrape will be dirtier.
  The script classifies by raw Google `type` (KEEP rural / CUT accommodation-events-food-
  tourism / REVIEW unknowns — review is never silently kept), accepts staged or raw
  Outscraper shapes, `--allow`/`--block` overrides. Validated against the pilot ground
  truth: keeps exactly the imported 5, cuts exactly the 3 junk rows. **The NSW list must
  pass through this before it becomes the claim-invite campaign** — otherwise Ali emails
  a wedding venue about claiming their rural business listing.

## Runbook — Josh's remaining actions, in order

1. ~~Watched push~~ **DONE 4 Jul** (see session log above). Still open from this step:
   run the official Rich Results test on the Farm Hand ad (JSON-LD confirmed emitting,
   formal test pending) — and once Adzuna rows exist (step 4), run it on a syndicated ad
   and confirm Rich Results detects **nothing** (the two-layer model needs the negative
   case verified, not just the positive).
2. **Vercel env:** Resend DNS for outbackconnections.com.au is **verified live**
   (DKIM + SPF checked 4 Jul) — update `FROM_EMAIL` to
   `Outback Connections <help@outbackconnections.com.au>`. (`CRON_SECRET` confirmed set.)
3. ~~Directory import~~ **DONE 4 Jul** (5 records — see session log above).
4. **Adzuna key** (sprint item 2): register free at https://developer.adzuna.com/
   (instant; free tier 250 calls/day vs our 8/day), set `ADZUNA_APP_ID` +
   `ADZUNA_APP_KEY` in Vercel, redeploy, then staged rollout:
   `node scripts/adzuna-pull.mjs --dry` → review sample → `--limit 10` → spot-check
   `/jobs` → **hold at 10 for 24h** so one full expire-scraped cycle runs against
   Adzuna rows — confirm re-sighting refreshes live ads and dead ads retire. A dead ad
   surviving the cycle means a dedupe/expiry bug, far easier to diagnose at 10 rows
   than 250. Then widen; the daily cron takes over.
5. **Supabase Auth dashboard** (unchanged, needs you): leaked-password protection
   toggle; email-confirmation + SMTP settings per LEGAL-HARDENING-PASS.md.

## State

- **Production is live** at https://www.outbackconnections.com.au. The marketplace (auth, schema, browse, posting, dashboard, admin) is fully built and shipped.
- **Spine architecture** built per `SPINE-BUILD.md` (the source of truth): businesses (reputation home) + business_members + claims + countries; polymorphic listings + job/freight/service detail tables; listing_sources; events + search_queries; categories taxonomy. Trust ladder + honesty model (scraped never shown as employer-posted).
- **Password-first auth — shipped + pushed** (`c949426`, live): `/signin` + `/signup` default to password; magic link demoted to a labelled backup; Terms/Privacy + 18+ consent intact. No Supabase Auth dashboard changes made.
- **Gate 1 — AI + search discovery rails (committed, UNPUSHED `adb57a2`):** JobPosting JSON-LD on real ads only (never scraped); LocalBusiness on directory + service listings; sitewide Organization; BreadcrumbList; `robots.ts` explicit AI/search bot allow-list; dynamic `sitemap.ts` from live data; `public/llms.txt`. All blocks structurally validated. Not typecheck-verified locally (no `node_modules`) → eyeball the Vercel build on the watched push.
- **Services vertical (committed, UNPUSHED `74ff80c`/`dbce423`):** `ingest_scraped_business`/`preview_scraped_import` extended for `vertical=service` (applied to DB, tested, cleaned); `scripts/scrape-rural-directory.mjs` has a `services` mode.
- **Gate 3 DRAFT (parked):** `supabase/migrations/_drafts/add_services_supply_categories.sql` adds supply buckets (rural-supplies, produce-stock-feed, farm-machinery-dealer, fodder-hay). **NOT applied** — scraped supply rows resolve to `services-other` until it is.
- **DB note:** the real "Farm Hand" user listing + its single `search_queries` row are genuine telemetry — left intact. No test rows in prod.

## Email sender — important (unchanged)

Outgoing transactional email still sends **from `support@outbackfencingsupplies.com.au`** (the Resend-verified domain). Site copy + reply-to point at `help@outbackconnections.com.au`; the From header won't switch until Resend DNS verification on `outbackconnections.com.au` completes.

## Parked next sprint (FEATURE FREEZE until the traction gate)

Do not pick these up until the traction gate is cleared:

1. **Adzuna API key + ingestion** — real job-ad source for the jobs vertical.
2. **50 real claimable jobs** — seed genuine, claimable listings.
3. **Consent + postcode capture** on signup and listings.
4. **Facebook auto-share** of new listings.
5. **ABN verification** on claimed profiles (`lib/abr.ts` + `mark_business_abn_verified()` exist; untested vs live ABR — needs `ABR_GUID`).

## Older parked items (do not pick up without confirming)

1. **Sentry DSN** — `lib/sentry.ts` is a no-op stub. Needs `SENTRY_DSN` + `npx @sentry/wizard@latest -i nextjs`.
2. **`account_deletions` wiring** — table exists; the delete-account flow doesn't yet write a row.
3. **Lawyer review** — see `LEGAL-HARDENING-PASS.md`.
4. **Leaked-password protection** — Supabase Auth dashboard toggle (Josh).

## Resume order

1. `SPINE-BUILD.md` — architecture source of truth + gate status.
2. `LEGAL-HARDENING-PASS.md` — legal pass, env vars, lawyer items.
3. `docs/JOBS-INGESTION-PLAN.md` — the live job-AD ingestion blueprint (source = open decision; Adzuna now chosen per the parked sprint).

`PLAN-MARKETPLACE.md` is stale — do not treat as a build plan.

---
**Project parked.** Effort moved to outback-ops (alert triage, merge sequence, shopify-sync fix, briefing delivery).
