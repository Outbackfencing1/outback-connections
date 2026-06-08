# SPINE-BUILD.md — architecture source of truth

**Project:** Outback Connections — Australia's free rural operating system (Jobs, Freight, Services now; Harvest/Livestock later).
**Stack:** Next.js 14 (App Router) · Supabase (Postgres + Auth + RLS) · Vercel · Resend.
**Supabase project:** `csisezoohgfrpjrhkmls` (ap-southeast-2). **Live:** https://www.outbackconnections.com.au
**Schema management:** raw SQL via Supabase MCP, one logical change per timestamped file in `supabase/migrations/`. Prisma is dead weight (vestigial; removal drafted, not applied). The live DB is the source of truth; the migration files reproduce it.

This doc is the spine's source of truth. Update it when the spine changes.

---

## 1. The model: spine + verticals + country packs

A country/vertical-neutral **spine** carries identity, reputation, provenance, taxonomy, and capture; **vertical detail tables** hang off it 1:1; everything is **country-scoped** (`country_code`, default `'AU'`) so NZ/US are config, not rewrites. Reputation attaches to the **business**, not the user, so it carries across every vertical — the moat.

```
auth.users ──┐
             ├─ user_profiles (per-person)
businesses ──┤   business_members (user⇄business, role)   claims (claim-this-business)
             └─ listings (polymorphic, 1 per directory entry / post)
                   ├─ job_details / freight_details / service_details (1:1)
                   ├─ listing_sources (every scrape sighting; raw_payload; dedupe/freshness)
                   └─ listing_flags / listing_edits / moderation_actions
countries · regions · categories(taxonomy) · policy_versions   (reference)
events (append-only) · search_queries (incl. zero-result demand gap)   (capture)
```

---

## 2. Migrations applied (the chain)

| File | What |
|---|---|
| `00000000000000_baseline_live_schema.sql` | Squashed baseline of the 11 pre-existing MCP migrations (the live marketplace: listings + 3 detail tables, flags/edits/moderation, legal/consent, auth_events, regions ~2,655 rows, categories). Reproduces the live `public` schema. |
| `…_spine_countries_businesses_claims` (M1) | `countries` (seed AU), `businesses` (reputation home), `business_members`, `claims`. RLS-first. **No direct claimant UPDATE on businesses** — trust/provenance columns are service-role-only. |
| `…_listings_spine_columns` (M2) | Adds to `listings`: `country_code`, `business_id`, `vertical`, `side`, `data_source`, `source_platform/url/external_id`, `scraped_at`, `imported_at`, `freshness_status`, `duplicate_group_id`, `canonical_listing_id`, `metadata`. Makes `user_id` + `policy_version_id` nullable (scraped rows have neither). 3 trust guards (below). Drops unused owner INSERT/UPDATE policies → listing writes are service-role-only. Public read unchanged + strict (`status='active' AND expires_at>now()`). Dedup unique index on `(source_platform, source_external_id)`. |
| `…_listing_sources` (M3) | Per-sighting source log; `raw_payload` (private), `last_seen_at` (freshness). Admin read + service_role only — NO public read (raw_payload may hold third-party content/PII). |
| `…_events_and_search_queries` (M4) | `events` (append-only capture) + `search_queries` (every search incl. `result_count=0`). Service-role write, admin read, no public. |
| `…_categories_country_scope` (M5) | `categories.country_code` (default AU); slug uniqueness → `(country_code, slug)`; country-scoped browse index. |
| `…_business_source_key_and_ingest_fn` | `businesses.source_platform/source_external_id` (place_id dedupe key) + unique index; **`ingest_scraped_business()`** (the write path). |
| `…_preview_scraped_import_fn` | **`preview_scraped_import()`** — read-only dry-run for the admin import preview. |

`insertListing()` (lib/posting) sets `vertical`/`side` on user posts.

---

## 3. Trust model

**Visible ladder** (on `businesses.claim_status`): `unclaimed → claimed → abn_verified → trusted`. Numeric `confidence_score` (data quality) + `trust_score` (behaviour/verification) sit underneath for granularity — deliberately NOT a many-tier enum.

**`data_source` (provenance, on businesses + listings):** `scraped` · `imported` · `claimed` · `manual` · `verified`. Honest by construction — a scraped row is never presented as employer-posted (operating rule #5).

Transitions: scraped ingest creates `unclaimed`; claim approval → `claimed` + `claimed_by` + `business_members`; ABR match → `abn_verified`; repeat/verified behaviour → `trusted`.

---

## 4. The 1A ingestion machinery

**Write path — `ingest_scraped_business(...)`** (SECURITY INVOKER, `search_path public,extensions`, execute = service_role only). Atomic + idempotent:
1. upsert `businesses` deduped on `(source_platform, source_external_id)` (place_id), `data_source='scraped'`, `claim_status='unclaimed'`, canonical resolved; **re-scrape updates descriptive fields only — never claim_status/trust** (can't un-claim).
2. upsert ONE directory `listings` row: `vertical` (job/freight), `side` (job→demand, freight→supply), `scraped_at=now()`, `expires_at=now()+45d`, `freshness_status='fresh'`, `user_id`/`policy_version_id` null, source attribution set.
3. ensure the detail row (`job_details`/`freight_details`) so the browse `!inner` join surfaces it.
4. upsert `listing_sources` (`raw_payload` archive).

**Privacy:** scraped phone/email go ONLY into private `listing_sources.raw_payload` — never `businesses`/`listings` contact columns (those are publicly readable; would be a harvest vector). Public "how to reach them" = `source_url`.

**Preview — `preview_scraped_import(jsonb)`** (read-only, service_role): per-row validation, category resolve + fallback, would-create vs would-update (deduped), summary. Mirrors ingest resolution; read-only so drift only affects preview accuracy.

**Import format:** `docs/INGEST-IMPORT-FORMAT.md` (the `ImportRecord[]` contract). Scrape → preview → commit:
- `scripts/scrape-rural-directory.mjs <jobs|freight> [--test] [--raw]` (Outscraper, dedupe by place_id, async+poll, CSV+JSON out). Josh runs it (key in `.env.local`).
- `/dashboard/admin/import` (admin-gated): paste JSON → Preview (dry run) → Commit (writes valid rows via the RPC). Reusable for every import.
- `scripts/ingest-rural-directory.mjs` — CLI alternative to the web commit.

**Honesty UI:** scraped rows show an amber **Unclaimed** badge (cards) and a **ScrapedNotice** (detail) in place of the contact block — "unclaimed, not posted by the business", source link, claim CTA. **JSON-LD gate:** the jobs detail page emits `JobPosting` structured data ONLY for real posts (`data_source !== 'scraped'`) — a directory entry is never advertised to Google as a job.

---

## 5. Security model

- **RLS-first**: every table RLS-on with explicit policies. Public read is strict (`status='active' AND expires_at>now()`).
- **Writes**: all scraped/admin writes go through `service_role` (server actions / RPCs), never client-side. The service-role key is server-only (`lib/supabase/admin.ts`).
- **Admin gating**: server-side `requireAdmin()` (validates JWT via `auth.getUser()` then `user_profiles.is_admin`) before any privileged RPC; admin RPCs are `execute`-granted to `service_role` only. Unbypassable from the client.
- **Trust guards on `listings`** (DB-enforced honesty): `listings_scraped_needs_source` (scraped ⇒ source_platform+source_url), `listings_consent_when_user_posted` (manual/claimed ⇒ policy_version_id), `listings_contact_required` (email|phone|source_url).
- Quarantined: `ericka_sales_quotes` (foreign app — never touch). Out of scope: the calculator, Shopify nav.

---

## 6. Gate status

**BUILT + deployed (Gate 1B + supporting):**
- **events + `search_queries` emitting** — browse logs searches incl. zero-result; detail logs listing_view + contact_reveal (`lib/analytics.ts`).
- **Claim flow** — `submitClaim` → ScrapedNotice ClaimButton → `/dashboard/admin/claims` review → `approve_claim`/`reject_claim` (ladder unclaimed→claimed + `business_members`).
- **Source-click tracking** — `/listings/[id]/source` logs `source_click` then 302s to the source (apply intent for scraped rows).
- **Freshness/expiry cron** — `expire_stale_scraped_listings()` + `/api/cron/expire-scraped` (daily 04:00 UTC).
- **ABN capability** — `lib/abr.ts` + `mark_business_abn_verified()` + `verifyBusinessAbn` action (claimed→abn_verified). ⚠️ untested against the live ABR (needs `ABR_GUID`); transition logic tested on mock.
- **Owner analytics** — `admin_analytics_summary()` + `/dashboard/admin/analytics` (read-only).
- **Security hardening — APPLIED** — search_path pinned on the 6 functions (`gen_short_id` = `public,extensions`); `admin_duplicate_accounts_by_ip` → security_invoker + anon/authenticated SELECT revoked (latent leak closed).
- **Admin nav** — gated nav across `/dashboard/admin/*` + dashboard entry card.

**STILL OPEN:**
- **First real import** (Josh): pilot 8 → preview → commit → agent reconciles + honesty audit → staged scale 10→50→250→1k→5k.
- **Live job-AD ingestion** (distinct from the business directory): see `docs/JOBS-INGESTION-PLAN.md`; the job-ad SOURCE is an open decision for Josh; schema columns drafted in `supabase/migrations/_drafts/`.
- **ABR live-key testing** (`ABR_GUID`); **leaked-password protection** (Supabase Auth dashboard toggle).
- **Drafted, not applied**: drop dead `jobs`/`profiles` + Prisma removal (`_drafts/drop_legacy_jobs_profiles.sql`); job-postings columns (`_drafts/`).
- **Deferred**: `vertical` NOT NULL once all write paths set it; M6 `regions` geo/lat-lng + `region_id` FKs; the SECURITY DEFINER **EXECUTE** revocations (separate lower-priority pass).

---

## 7. Conventions

snake_case; `country_code` + `vertical` on cross-cutting tables; metric/UTC/ISO/(amount,currency_code) stored, localised on render; taxonomies as rows; migrations timestamped with RLS in-file + rollback notes + idempotent; **commit locally, never push until Josh says** (push = Vercel prod deploy). See `HANDOFF.md` for live-state notes and `docs/INGEST-IMPORT-FORMAT.md` for the import contract.
