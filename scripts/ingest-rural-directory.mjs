// scripts/ingest-rural-directory.mjs
// ------------------------------------------------------------
// Phase 1 ingestion 1A — push a scraped directory file into the DB by calling
// the ingest_scraped_business() RPC once per business, as service_role. This is
// the ONLY supported write path (atomic + idempotent + trust-guarded in the DB).
// Re-running is safe: dedupe-on-place_id updates instead of duplicating.
//
// Usage:
//   node scripts/ingest-rural-directory.mjs <scraped.json> [supabase_url] [service_role_key] [--dry-run] [--expiry 45]
//   (url/key fall back to NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local)
// ------------------------------------------------------------
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    const txt = readFileSync(".env.local", "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local */
  }
}
loadEnvLocal();

const positional = [];
let dryRun = false;
let expiryDays = 45;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--dry-run") dryRun = true;
  else if (a === "--expiry") expiryDays = parseInt(process.argv[++i], 10) || 45;
  else positional.push(a);
}

const inputPath = positional[0];
const url = positional[1] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = positional[2] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!inputPath || !url || !key) {
  console.error(
    "Usage: node scripts/ingest-rural-directory.mjs <scraped.json> [supabase_url] [service_role_key] [--dry-run] [--expiry 45]"
  );
  console.error("(url/key fall back to .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const records = JSON.parse(readFileSync(inputPath, "utf8"));
if (!Array.isArray(records)) {
  console.error("Input must be a JSON array of scraped records.");
  process.exit(1);
}

const counts = { created: 0, updated: 0, error: 0, skipped: 0 };

for (let i = 0; i < records.length; i++) {
  const r = records[i];
  if (!r?.source_external_id || !r?.name || !r?.postcode || !r?.source_url) {
    console.error(`[${i}] skipped (missing required field): ${r?.name ?? "(no name)"}`);
    counts.skipped++;
    continue;
  }

  const body = {
    p_vertical: r.vertical, // 'job' | 'freight'
    p_source_platform: r.source_platform ?? "google_maps",
    p_source_external_id: r.source_external_id,
    p_source_url: r.source_url,
    p_name: r.name,
    p_category_slug: r.category_slug ?? null,
    p_postcode: r.postcode,
    p_suburb: r.suburb ?? null,
    p_state: r.state ?? null,
    p_website: r.website ?? null,
    p_geo_lat: r.geo_lat ?? null,
    p_geo_lng: r.geo_lng ?? null,
    p_raw_payload: r.raw_payload ?? {},
    p_expiry_days: expiryDays,
  };

  if (dryRun) {
    console.log(`[dry-run ${i}] ${r.vertical} ${r.name} (${r.postcode}) cat=${r.category_slug}`);
    continue;
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/ingest_scraped_business`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[${i}] ${r.name}: ${res.status} ${txt.slice(0, 300)}`);
      counts.error++;
      continue;
    }
    const out = await res.json(); // function returns jsonb
    const action = out?.listing_action ?? "?";
    if (action === "created") counts.created++;
    else if (action === "updated") counts.updated++;
    console.log(`[${i}] ${action.padEnd(7)} ${r.name} (${r.postcode})`);
  } catch (e) {
    console.error(`[${i}] ${r.name}: ${e.message}`);
    counts.error++;
  }
}

console.log(
  `\nDone. created=${counts.created} updated=${counts.updated} error=${counts.error} skipped=${counts.skipped} of ${records.length}`
);
if (counts.error > 0) process.exit(1);
