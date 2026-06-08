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

## 6. Open gates / follow-ups

- **First real import** (Josh): ~50–100 Central West employers/carriers → preview → commit → agent reconciles preview-vs-created + honesty audit → green-light scale 1k→10k.
- **Gate 1B**: events + `search_queries` emitting (contact/apply tracking, zero-result logging); claim flow (claims → admin review → ladder bump + business_members).
- **Freshness cron**: expire/stale scraped listings past `expires_at`.
- **ABR verification**: claimed → abn_verified on ABN Lookup match (needs `ABR_GUID`).
- **Owner analytics**: supply/demand/zero-result by region/vertical.
- **Deferred**: live job-ad/load posting source; security hardening (search_path pins — `gen_short_id` needs `public,extensions`; review SECURITY DEFINER views; enable leaked-password protection in Auth dashboard); Prisma removal + drop dead `jobs`/`profiles`; `vertical` NOT NULL once all write paths set it; M6 `regions` geo/lat-lng + `region_id` FKs.

---

## 7. Conventions

snake_case; `country_code` + `vertical` on cross-cutting tables; metric/UTC/ISO/(amount,currency_code) stored, localised on render; taxonomies as rows; migrations timestamped with RLS in-file + rollback notes + idempotent; **commit locally, never push until Josh says** (push = Vercel prod deploy). See `HANDOFF.md` for live-state notes and `docs/INGEST-IMPORT-FORMAT.md` for the import contract.
