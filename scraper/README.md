# Outback Connections — Rural Fencing Contractor Pipeline (`scraper/`)

Practical, source-verified discovery, enrichment, classification, deduplication, and staged-export pipeline for genuine rural fencing contractors in Australia (`fencing-contractor`, category ID `bb33b79d-d274-4e55-9eb6-f16badb5ec1a`).

> **Scope & Safety:** This pipeline performs **read-only** database inspection and writes **local staged exports only**. It never publishes listings, modifies production database records, alters existing listing visibility, or contacts contractors.

---

## Architecture & Module Overview

- [`scraper/config.ts`](./config.ts) — Category constants, configurable source registry (`SOURCES`), per-source supplier artifact blocklists (preventing supplier footer phones, emails, addresses, and ABNs from bleeding into contractor records), and bounded HTTP settings.
- [`scraper/types.ts`](./types.ts) — TypeScript interfaces for raw sightings, phone records, evidence references, classification output, ABN checks, consolidated candidates, existing-listing reviews, and audit reconciliation.
- [`scraper/normalise.ts`](./normalise.ts) —
  - HTML entity decoding (`decodeHtmlEntities`).
  - Australian phone normalisation (`normaliseAustralianPhone`) supporting mobile (`04xx` -> `+614xxxxxxxx`), landline (`02`/`03`/`07`/`08` -> `+612xxxxxxxx`), and `1300`/`1800`/`13` numbers without forcing landlines or toll-free numbers into mobile patterns.
  - Plain-text public email extraction (`extractPublicEmail`), stripping `<head>`, `<style>`, `<script>`, `<noscript>`, and HTML comments (preventing CSS font-author comments from being extracted) and rejecting protected-email placeholders (`*protected email*`, `[email protected]`, `/cdn-cgi/l/email-protection`, `data-enc-email`, `data-cfemail`).
  - Australian `(locality, state, 4-char postcode)` validation (`validateAndResolveLocation`, `formatPostcode4`), preserving leading-zero 4-character postcodes (`"0800"`, `"0870"`), handling border postcodes (`2620` NSW/ACT), rejecting ambiguous multi-state town names when state is missing, and keeping `published_service_areas` distinct from `base_location_established`.
- [`scraper/abn.ts`](./abn.ts) — Official 11-digit ATO modulus-89 checksum validation (`isValidAbnChecksum`) and optional ABR XML API lookup (`verifyCandidateAbn`) when `ABN_LOOKUP_GUID` is configured. Distinguishes `"unchecked_no_abn"`, `"unchecked_no_guid"`, `"invalid_checksum"`, `"no_confident_match"`, `"api_error"`, `"confirmed_active"`, and `"confirmed_cancelled"`, never treating API errors or missing credentials as business closure.
- [`scraper/sources/`](./sources/) —
  - [`http.ts`](./sources/http.ts): Bounded HTTP fetcher with timeouts, rate-limit delay, bounded retries, local cache support, and `robots.txt` check.
  - [`westonfence.ts`](./sources/westonfence.ts): Extracts accredited installers from `https://westonfence.com.au/accredited-installers/`, preserving multi-contact/multi-phone entries and hyphenated names, treating `Area:` strictly as `published_service_areas` (`base_location_established: false`), and rejecting obfuscated email placeholders.
  - [`rotech-rural.ts`](./sources/rotech-rural.ts): Strips `<script>` templates first, then extracts `#contractor-cards .rr-contractor-card__body` from `https://rotechrural.com.au/fencing-contractors/`, capturing `.rr-city`, contact person, phone, website, and rejecting Cloudflare email-protection links.
  - [`website-enricher.ts`](./sources/website-enricher.ts): Inspects official contractor websites linked from pilot directory cards, extracting plain-text email, published ABN, street/base address, additional phone numbers, and verbatim rural fencing specialty excerpts while flagging broken/paywalled domains.
- [`scraper/classifier.ts`](./classifier.ts) — Evidence-based classifier (`include`, `review`, `exclude`) with optional Gemini structured output (`GEMINI_API_KEY` + `GEMINI_MODEL`) and deterministic verifier (`verifyClassificationOutput`) that enforces verbatim excerpt matching against source text and strips any unsupported specialties.
- [`scraper/descriptions.ts`](./descriptions.ts) — Generates factual, non-fabricated unclaimed listing copy (`buildUnclaimedFencerDescription`) after classification and validates compliance (`isDescriptionCompliant`).
- [`scraper/dedupe-and-match.ts`](./dedupe-and-match.ts) — Consolidates sightings across sources, detects cross-source/intra-source location or phone conflicts, matches against existing Supabase `listings` (protecting claimed, owner-edited, and suppressed records), and audits existing database fencing records (`auditExistingFencingListings`).
- [`scraper/export.ts`](./export.ts) & [`scraper/run-pilot.ts`](./run-pilot.ts) — Orchestrates the pipeline and writes staged JSON/CSV exports.

---

## Environment Variables

Read automatically from `.env.local` or process environment:

| Variable | Required? | Purpose |
| :--- | :---: | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (for live DB check) | Read-only inspection of `public.listings` and `public.categories`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (for live DB check) | Public read key. Note: RLS hides `deleted_by_admin` rows, private contact columns (`contact_phone`, `contact_email`), and `listing_sources`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | If provided for read-only audit, allows inspecting `listing_sources` and suppressed rows (`deleted_by_admin`, `hidden_flagged`). Never used for writes in this pipeline. |
| `GEMINI_API_KEY` | Optional | Enables Gemini structured classification before deterministic verification (`verifyClassificationOutput`). |
| `GEMINI_MODEL` | Optional | Model identifier when `GEMINI_API_KEY` is set (e.g., `gemini-2.5-flash`). |
| `ABN_LOOKUP_GUID` | Optional | Enables live ABR XML lookup (`abr.business.gov.au`) in addition to offline ATO modulus-89 checksum validation. |

---

## Configuring Sources

Edit [`scraper/config.ts`](./config.ts) (`SOURCES` array) to enable, disable, or add permitted public sources:
- Every enabled source must record its `url`, `accessMethod`, `reuseBasis`, and `supplierBlocklist` (supplier footer phones, emails, ABNs, and addresses that must never be attributed to listed contractors).
- Policy-blocked sources (`google_maps`, `yellow_pages`) are explicitly marked `enabled: false` with documented policy reasons.

---

## Running the Pipeline & Verification Tests

```bash
# Run the bounded pilot and regenerate staged exports
node --experimental-strip-types scraper/run-pilot.ts

# Run the rural fencer pipeline unit & integration tests (Vitest)
npx vitest run tests/rural-fencer-pipeline.test.ts

# Run the full test suite and typechecker
npm test
npx tsc --noEmit
```

---

## Staged Output Files

Generated in `scraper/out/` (and mirrored in the repository root for convenience; both locations are git-ignored so scraped business data is never committed):

1. **`rural_fencers_seed.json`** — Accepted `include` candidates (`seed_new` and `seed_existing_match`) with full `ListingSeedPayload` (`public_listing_row`, `private_contact_staging`, `listing_sources_row`, `service_area_metadata`) and supporting evidence.
2. **`rural_fencers_seed.csv`** — Flat CSV representation of accepted candidates with 4-character postcodes preserved as strings.
3. **`rural_fencers_review.csv`** — Combined review queue containing:
   - `candidate_review`: Pilot candidates held for human confirmation (cross-source phone/town conflicts, broken contractor websites, missing locality, or generic contracting names without explicit fencing installation evidence).
   - `existing_listing_correction`: Existing database `fencing-contractor` records flagged for hygiene cleanup (ACT/NSW `2620` state mismatch, active duplicate pairs, non-rural/food/pool/balustrade/temporary-panel businesses, and materials-only warehouses).
4. **`rural_fencers_audit.json`** — Full reconciliation report comparing raw sightings, consolidated candidates, accepted vs review counts, live database fencing counts vs public page counts, and Yellow Pages provenance findings.
