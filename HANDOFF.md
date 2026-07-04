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
   Karim is a real farm (sparse Google data). Curated file:
   **`data/staged-directory-pilot-7.json`** (7 records, junk row dropped).

## Runbook — Josh's next actions, in order

1. **Watched push** (~10 min): `git push origin main`, watch the Vercel build, then
   spot-check `/robots.txt`, `/sitemap.xml`, `/services`, and a jobs detail page.
   Run the Rich Results test on the Farm Hand ad.
2. **Vercel env — 2 quick wins while in there:** Resend DNS for
   outbackconnections.com.au is **verified live** (DKIM + SPF checked 4 Jul), so update
   `FROM_EMAIL` to `Outback Connections <help@outbackconnections.com.au>`; and confirm
   `CRON_SECRET` is set.
3. **Directory import** (sprint item 3): `node scripts/ingest-rural-directory.mjs
   data/staged-directory-pilot-7.json` (uses .env.local), then the honesty audit:
   badges/ScrapedNotice/claim/source-redirect on `/jobs`, no junk rows.
4. **Adzuna key** (sprint item 2): register free at https://developer.adzuna.com/, set
   `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` in Vercel, redeploy, then staged rollout:
   `node scripts/adzuna-pull.mjs --dry` → review sample → `--limit 10` → spot-check
   `/jobs` → widen. The daily cron takes over after that.
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
