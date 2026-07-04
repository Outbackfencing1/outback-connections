# Jobs Ingestion Engine v1 — PLAN (blueprint; syndicated layer now built)

**Status update (4 Jul 2026):** the SOURCE decision (§7) was made — **Adzuna**, but as a
**syndicated layer**, which supersedes parts of this plan: Adzuna ads are attributed,
link-out, **no JSON-LD**, **not claimable**, and **not linked to businesses** (no
employer→business resolution). That layer is BUILT (`lib/adzuna.ts` +
`/api/cron/adzuna-sync` + `SyndicatedNotice`), env-gated on `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`,
and needs **no schema change** (ad extras live in `listings.metadata`; the `_drafts/`
columns stay parked). This plan's full business-linked, claimable model still applies to
**first-party jobs** (the 50-jobs milestone) — never conflate the two layers.

**Original status:** reviewed blueprint. Gated on (a) this plan's review, (b) the 8-business directory pilot passing, and (c) Josh picking a job-ad SOURCE (§7). Schema columns it needs are drafted (not applied) in `supabase/migrations/_drafts/` (see §8).

## 1. Scope — and how it differs from what's already built

We already have the **business directory** pipeline (`ingest_scraped_business` / `preview_scraped_import` / `/dashboard/admin/import`): it ingests *businesses* as one **directory listing each** (`kind=job|freight`, scraped/unclaimed, no apply path beyond the source URL). That seeds *who's out there*.

This plan is for **real job ADS** — an actual vacancy ("Station hand wanted, Mudgee, $35/hr, apply by 30 June") — which is a different record: it has a title/description that is the *ad*, a salary, an employment type, an application URL, a closing date, and it belongs to an employer (a `business`). A job ad is still `vertical=job, side=demand`, `data_source=scraped`, unclaimed, source-attributed — never presented as employer-posted.

One employer can have many job ads. So: **job ads are `listings` rows linked to a `business`** (reusing the directory's business dedup), with the ad-specific fields in **`job_details`** (extended — §8).

## 2. Input — the job `ImportRecord`

The scrape/normalise step emits an array of:

| field | notes |
|---|---|
| `source_platform` | e.g. `seek`, `google_jobs`, `council_xyz` (the chosen source — §7) |
| `source_url` | the original ad URL (attribution + fallback apply path) |
| `source_external_id` | the source's stable ad id — **primary dedupe key** |
| `title` | the ad title |
| `description` | the ad body |
| `employer_name_raw` | employer string as scraped (pre-linking) |
| `employer_site` | employer website if present (helps business dedup/match) |
| `location_text` | raw location string |
| `postcode`, `state_code` | resolved from `location_text` (required: postcode) |
| `category_raw` | raw category/occupation string |
| `salary_raw` | the raw salary string (kept verbatim) |
| `salary_min`, `salary_max`, `salary_period` | parsed structured salary (period: hour/day/week/year) |
| `salary_currency` | default `AUD` |
| `employment_type` | full_time / casual / contract / seasonal / day_rate (maps to existing `job_details.work_type`) |
| `accommodation_included` | bool (maps to existing `job_details.accommodation_provided`) |
| `start_date` | maps to existing `job_details.start_date` |
| `application_url` | where to apply (NEW column) |
| `closing_date` | application deadline (NEW column) |
| `scraped_at`, `expires_at` | provenance + freshness (default `closing_date` or scraped_at + 30–45d) |
| `raw_payload` | full source record → private `listing_sources.raw_payload` (incl. any scraped contact) |

## 3. Normalisation (raw → ImportRecord)

- **Category:** `category_raw` → existing `categories` (AU, pillar=jobs) by a synonym map; unknown → `jobs-other` (preview shows the fallback, same as the directory).
- **Employer → business:** **reuse the directory dedup.** Resolve/create the `business` from `employer_name_raw` + `employer_site` + location. If the source gives a stable employer id, use it as the business `source_external_id`; else dedup on name+postcode (+website) and flag low-confidence matches for review. The job-ad listing's `business_id` = the resolved (canonical) business.
- **Location:** `location_text` → `postcode`/`state` (postcode required; reject ads without a resolvable postcode, like the directory).
- **Salary:** parse `salary_raw` → `salary_min/max/period/currency`; keep `salary_raw` verbatim. Map period words ("p.a.", "per hour") → enum; ranges → min/max; single value → min=max.
- **Dates:** `start_date`, `closing_date` parsed to dates; `expires_at` = `closing_date` if present else `scraped_at + 30–45d`.
- **Employment type:** `employment_type` → existing `job_details.work_type` enum (no new column).

## 4. Dedup

- **Primary:** `(source_platform, source_external_id)` on `listings` (existing unique index) + `listing_sources` — re-imports update, never duplicate (same as the directory).
- **Secondary:** `source_url`.
- **Fallback (cross-source / no id):** a hash of `lower(title) + business_id + postcode` → `duplicate_group_id`; pick a `canonical_listing_id` per group so the same vacancy posted to two boards collapses to one shown ad with multiple `listing_sources`.

## 5. Trust / honesty (non-negotiable, operating rule #5)

Every imported job ad is `data_source='scraped'`, `claim_status` inherited from its business (`unclaimed` until claimed), `user_id` null, source-attributed (`source_platform`+`source_url` — DB trust guard enforces it), expiring, with a **claim option** (the existing claim flow promotes the employer's business). It is **never** shown as employer-posted: the Unclaimed badge + ScrapedNotice + the `/listings/[id]/source` apply redirect all apply. **No JSON-LD `JobPosting`** for scraped ads either, *unless* we decide scraped-with-valid-apply-URL ads should be discoverable — that's a deliberate call to make at review, not a default (current gate suppresses JSON-LD for all scraped).

## 6. Staged import (each stage = preview → import → reconcile → UI spot-check → analytics-check)

`10 → 50 → 250 → 1k → 5k`. At each stage: dry-run preview (extend `preview_scraped_import` or a job-ad twin), commit, reconcile preview-vs-created, spot-check the live `/jobs` rendering + claim/source paths, and read the analytics funnel (jobs_live, source-click rate, zero-result) before widening. Stop and tighten queries/relevance if junk rate climbs (the directory pilot already showed scraped noise like a "wedding venue" for a "farm" search).

## 7. ⚠️ OPEN DECISION FOR JOSH — the job-ad SOURCE

The source is **not chosen** and this plan does **not** pick one or build a scraper to it. Options, with trade-offs:

- **Google for Jobs / aggregator** — broad coverage, but ToS/scraping-legality and attribution concerns; data quality varies.
- **Council / employer / industry-body pages** — cleaner provenance + relevance (rural-specific), but many small sources = more per-source scraper work.
- **Claimed-business posting** — no scraping at all: claimed employers post their own ads (real, consented, employer-posted). Highest trust, lowest volume early; the long-term right answer but needs claimed businesses first.

**Recommendation to weigh (not a decision):** start with *claimed-business posting* for trust + a small set of *council/industry* sources for seed volume; treat broad aggregators cautiously pending a legal read. **Pick one before any scraper is built.**

## 8. Schema (drafted, not applied)

`job_details` already has `work_type`, `pay_type`, `pay_amount`, `start_date`, `duration_text`, `accommodation_provided`. The genuinely-missing ad fields (`application_url`, `closing_date`, structured `salary_min/max/period/currency`, `salary_raw`, `employer_name_raw`) are drafted in `supabase/migrations/_drafts/job_postings_columns.sql` — **review-gated with this plan; not applied.** `employment_type` and `accommodation_included` map to existing columns (no duplicates).

## 9. Reuse (don't rebuild)

Business dedup, `listing_sources`, the trust guards, the honesty UI (badge/ScrapedNotice/source redirect), the claim flow, the freshness cron, and the admin Preview page are all built and reused. The job-ad engine is: a job scraper (to the chosen source), a job normaliser (§3), and an `ingest_scraped_job_ad()` write path (a sibling of `ingest_scraped_business` that also writes the extended `job_details`), plus a preview. That's the only net-new code — gated on §7.
