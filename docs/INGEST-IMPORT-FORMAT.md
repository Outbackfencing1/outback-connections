# Scraped Import Format (Jobs/Freight directory ingestion)

The contract between the **scrape** step, the **preview**, and the **commit**.
One JSON array of `ImportRecord` objects flows through all three:

```
scrape (Outscraper, messy)  ──normalise──▶  ImportRecord[]  ──▶  preview (dry run)  ──▶  commit (write)
scripts/scrape-rural-directory.mjs              (this file)        /dashboard/admin/import     ingest_scraped_business()
```

## ImportRecord

| field | type | required | notes |
|---|---|---|---|
| `vertical` | `"job" \| "freight"` | ✅ | directory vertical. job ⇒ `side=demand`; freight ⇒ `side=supply`. |
| `source_platform` | string | ✅ | e.g. `"google_maps"`. Part of the dedupe key + attribution. |
| `source_external_id` | string | ✅ | the **place_id**. The dedupe key — re-imports update, never duplicate. |
| `source_url` | string | ✅ | the original listing URL. Satisfies the `listings_scraped_needs_source` + `listings_contact_required` trust guards and is the public "how to reach them" path. |
| `name` | string | ✅ | business name → listing title + business legal/trading name. |
| `postcode` | string | ✅ | 4 digits. The rural geo model depends on it; rows without a real postcode are rejected. |
| `category_slug` | string | optional | vertical-scoped taxonomy slug (AU). Unknown/missing ⇒ falls back to `jobs-other` / `freight-other` (preview shows a warning). |
| `suburb` | string | optional | stored in listing `metadata`. |
| `state` | string | optional | `state_code` on the business; `state` derived on the listing from postcode regardless. |
| `website` | string | optional | public on the business record. |
| `geo_lat` / `geo_lng` | number | optional | stored on the business for later radius matching. |
| `raw_payload` | object | optional | the **full** source record. Archived **privately** in `listing_sources.raw_payload` (admin/service-role only). **This is where scraped phone/email live — they are never written to the public business/listing contact fields.** |

## Normalisation rules (scrape → ImportRecord)

The scrape script is responsible for turning messy Outscraper output into clean records:

- **place_id required** — a row with no stable `place_id` is dropped (no dedupe key = no honest provenance).
- **postcode** — prefer the place's own `postal_code`; fall back to the query town's postcode; reject if not 4 digits.
- **source_url** — prefer the Google Maps listing URL (`location_link`), else a `place_id` maps URL, else the website; never empty.
- **dedupe within the pull** — keep one record per `place_id` (first sighting wins).
- **category** — mapped from the search term to a taxonomy slug; the DB resolves/falls back at preview + commit.
- **contacts** — phone/email stay inside `raw_payload` only.

## Trust guarantees enforced downstream (not the importer's job to fake)

Every committed row is, by construction of `ingest_scraped_business()`:
`data_source='scraped'`, `claim_status='unclaimed'`, `user_id=null`, `policy_version_id=null`,
`scraped_at=now()`, `expires_at=now()+45d`, `freshness_status='fresh'`, source attribution set,
and shown in the UI with the **Unclaimed** badge + `ScrapedNotice` (never as employer-posted).

## Flow

1. `node scripts/scrape-rural-directory.mjs jobs --test` → writes `data/scraped-jobs-*.json` (ImportRecord[]) + a CSV preview.
2. Open **/dashboard/admin/import** (admin only), paste the JSON, click **Preview** — dry run via `preview_scraped_import()`. Review valid/invalid, would-create/update, category resolution, warnings.
3. Click **Commit** to write the valid rows via `ingest_scraped_business()` (idempotent — safe to re-run).

`preview_scraped_import()` mirrors `ingest_scraped_business()`'s resolution + dedupe rules and must be kept in sync; being read-only, any drift only affects the preview's accuracy, never a write.
