# AGENTS.md — rules for anyone (human or model) working on this repo

Outback Connections is a live site: https://www.outbackconnections.com.au.
Pushing to `main` deploys to production on Vercel. Several agents (Claude Code,
OpenAI Codex, GLM) and people commit here. These rules are the shared floor.

## What this product is (Sep 2026)

A rural business directory + outreach tool, run by Outback Fencing & Steel
Supplies (disclosed on every page). The live vertical is **Services**, mostly
fencing contractors in NSW, which feeds the wholesale outreach pipeline.
Jobs, Freight and For sale (livestock, hay, grain, machinery, gear) exist and are
hidden from navigation while empty. For sale is first-party only: nothing is
scraped into it, and the site never handles payment or takes a commission.
Architecture source of truth: `SPINE-BUILD.md`. Current state: `HANDOFF.md`.

## Non-negotiable product rules

1. **Honesty.** A row we found online is `data_source='scraped'`, shown with
   the Unclaimed badge and ScrapedNotice, says where we found it, and is never
   presented as posted by the business. Never write a third party's business
   through the public post form (that marks it owner-posted). Staff use
   `/dashboard/directory/add`; bulk goes through `/dashboard/admin/import`.
   Both call `ingest_scraped_business()`.
2. **Privacy.** Scraped phone/email live ONLY in private
   `listing_sources.raw_payload`. Never in `listings`/`businesses` contact
   columns (those are readable by signed-in users).
3. **Farmer data.** Quote requests (`listing_enquiries`) are a farmer's
   personal details given under consent for ONE business. Admin-only, never
   public, never bulk-exported, purged after 12 months. The business's
   private contact (from `listing_sources.raw_payload`) is never sent to
   the farmer; a person forwards unclaimed enquiries.
4. **Structured data.** `JobPosting` JSON-LD only on first-party job ads.
   Nothing on scraped or syndicated rows. `LocalBusiness` is fine on
   directory rows.
5. **Claims are the retention mechanism.** Don't build automated re-sighting
   of scraped rows; the directory is refreshed on a calendar (first Monday
   monthly) via an idempotent re-import.
6. **Quarantine.** `ericka_sales_quotes` is a foreign app's table: never
   touch it. The fencing calculator and Shopify nav are out of scope.

## Engineering conventions

- **Schema:** raw SQL, one logical change per timestamped file in
  `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`), applied to the live
  project via the Supabase MCP or CLI, and committed in the same change as
  the code that needs it. Include RLS in-file and a rollback note. Drafts go
  in `supabase/migrations/_drafts/` and are NOT applied.
- **Security:** RLS-first. Admin gating is server-side (`requireAdmin()` or
  `current_user_is_admin()`), never client-only. `SECURITY DEFINER`
  functions check admin internally. Service-role writes happen in server
  actions only (`lib/supabase/admin.ts`), never in client components.
- **Gate before push:** `npx tsc --noEmit`, `npm run lint`, `npm run build`
  all green. CI (`.github/workflows/ci.yml`) runs the same on every PR.
- **Never** commit `.env*`, scraped data under `data/`, or keys. Rotate
  anything that leaks.
- Prisma is vestigial; do not add Prisma usage. Supabase client only.
- Windows checkout: many files are CRLF. Don't reformat whole files.

## Coordination

- `git fetch` before starting; never assume a checkout is current.
- Codex/GLM work on `codex/*` branches via PRs. Claude Code commits to `main`
  directly when Josh has authorised it for the session.
- Record decisions and state in `HANDOFF.md` (not only in chat). If a PR is
  gated on a manual step (e.g. "run the SQL suite on a disposable branch"),
  say so in the PR body and in `HANDOFF.md`.
- Josh's standing decisions from 4 Jul 2026 (traction gate numbers, UTM
  discipline, 4:1 syndicated ratio, first-touch rule, monthly directory
  refresh, JSON-LD rule, claim Outback Fencing as listing #1) are in
  `HANDOFF.md` and are binding unless he changes them.
