// scripts/scrape-rural-directory.mjs
// ------------------------------------------------------------
// Phase 1 ingestion 1A — employer + carrier DIRECTORY scraper.
// Ported from the proven outback-ops store-scraper pattern (Outscraper Google
// Maps, dedupe by place_id, --test flag, file out). Acquisition only: this
// produces a JSON file (+ a CSV preview). Pushing into the DB is a SEPARATE
// step — scripts/ingest-rural-directory.mjs — so you can eyeball the file first.
//
// Usage:
//   node scripts/scrape-rural-directory.mjs jobs    [--test] [--limit 20] [--out data/x.json]
//   node scripts/scrape-rural-directory.mjs freight [--test] [--limit 20] [--out data/x.json]
//
// Key: OUTSCRAPER_API_KEY in .env.local (this repo). Josh runs the real scrape.
//
// ⚠️ VERIFY AGAINST outback-ops/scripts/scrape-rural-leads.ts: I could not read
//    that file from this machine. The Outscraper endpoint, async mode, and
//    response indexing below follow Outscraper's public Maps API — confirm they
//    match your working store scraper (esp. data[] shape + field names) before
//    relying on a full run. --test keeps it tiny so you can check cheaply.
// ------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// --- tiny .env.local loader (no dotenv dep, mirrors repo's no-deps scripts) ---
function loadEnvLocal() {
  try {
    const txt = readFileSync(".env.local", "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local — rely on real env */
  }
}
loadEnvLocal();

// ------------------------------------------------------------
// Seed region: Central West NSW (where Outback Fencing is densest). Expand
// the town list to widen coverage. postcode/state are the fallback location
// when a scraped place is missing its own postal_code.
// ------------------------------------------------------------
const TOWNS = [
  { suburb: "Orange", postcode: "2800", state: "NSW" },
  { suburb: "Dubbo", postcode: "2830", state: "NSW" },
  { suburb: "Bathurst", postcode: "2795", state: "NSW" },
  { suburb: "Mudgee", postcode: "2850", state: "NSW" },
  { suburb: "Molong", postcode: "2866", state: "NSW" },
  { suburb: "Parkes", postcode: "2870", state: "NSW" },
  { suburb: "Forbes", postcode: "2871", state: "NSW" },
  { suburb: "Cowra", postcode: "2794", state: "NSW" },
];

// Search term -> our taxonomy slug. Terms are what you'd type into Google Maps.
// Unknown/edge slugs fall back to *-other inside the ingest function.
const QUERIES = {
  jobs: [
    { term: "farm", category_slug: "station-hand" },
    { term: "grazing pastoral company", category_slug: "station-hand" },
    { term: "shearing contractor", category_slug: "shearer" },
    { term: "agricultural contractor", category_slug: "jobs-other" },
    { term: "feedlot", category_slug: "dairy-feedlot" },
    { term: "dairy farm", category_slug: "dairy-feedlot" },
    { term: "fencing contractor", category_slug: "fencing-labour" },
    { term: "grain farm", category_slug: "harvest-worker" },
  ],
  freight: [
    { term: "livestock transport", category_slug: "livestock-freight" },
    { term: "stock cartage", category_slug: "livestock-freight" },
    { term: "grain haulage", category_slug: "grain-freight" },
    { term: "hay transport", category_slug: "hay-freight" },
    { term: "rural freight transport", category_slug: "general-rural-freight" },
    { term: "heavy haulage", category_slug: "machinery-freight" },
  ],
};

// ------------------------------------------------------------
function parseArgs(argv) {
  const a = { vertical: argv[2], test: false, limit: 20, out: null };
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--test") a.test = true;
    else if (argv[i] === "--limit") a.limit = parseInt(argv[++i], 10) || 20;
    else if (argv[i] === "--out") a.out = argv[++i];
  }
  return a;
}

async function outscraperMapsSearch(query, limit, apiKey) {
  // Sync mode (async=false). For very large pulls the proven scraper may use
  // async + polling — match that if you scale up.
  const url =
    "https://api.outscraper.com/maps/search-v3" +
    `?query=${encodeURIComponent(query)}&limit=${limit}&async=false`;
  const res = await fetch(url, { headers: { "X-API-KEY": apiKey } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Outscraper ${res.status} for "${query}": ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  // data is an array per query; sync single-query => data[0] is the place list.
  const list = Array.isArray(json?.data) ? json.data[0] ?? [] : [];
  return list;
}

// Map an Outscraper place + the query context into an ingest-ready record.
function toRecord(place, q, town, vertical) {
  const placeId = place.place_id || place.google_id;
  if (!placeId) return null; // no stable dedupe key -> skip (honest)
  const name = (place.name || "").trim();
  if (!name) return null;
  const postcode = (place.postal_code || town.postcode || "").toString().trim();
  if (!/^\d{4}$/.test(postcode)) return null; // postcode is required + must be real
  const sourceUrl =
    place.location_link || // Google Maps listing URL (best source attribution)
    (place.google_id ? `https://www.google.com/maps/place/?q=place_id:${place.google_id}` : null) ||
    place.site ||
    `https://www.google.com/maps/search/${encodeURIComponent(name + " " + town.suburb)}`;
  return {
    vertical,
    source_platform: "google_maps",
    source_external_id: placeId,
    source_url: sourceUrl,
    name,
    category_slug: q.category_slug,
    postcode,
    suburb: place.city || town.suburb,
    state: place.state || town.state,
    website: place.site || null,
    geo_lat: place.latitude ?? null,
    geo_lng: place.longitude ?? null,
    // Full source record kept for the private raw_payload archive (incl. phone).
    raw_payload: place,
  };
}

function toCsvPreview(records) {
  const cols = ["name", "category_slug", "suburb", "postcode", "state", "source_external_id", "website"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of records) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.vertical !== "jobs" && args.vertical !== "freight") {
    console.error("Usage: node scripts/scrape-rural-directory.mjs <jobs|freight> [--test] [--limit N] [--out path]");
    process.exit(1);
  }
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    console.error("OUTSCRAPER_API_KEY missing. Add it to .env.local (this repo).");
    process.exit(1);
  }
  // The ingest fn uses singular vertical ('job'|'freight'); CLI uses plural.
  const vertical = args.vertical === "jobs" ? "job" : "freight";

  let queries = QUERIES[args.vertical];
  let towns = TOWNS;
  let limit = args.limit;
  if (args.test) {
    queries = queries.slice(0, 2);
    towns = towns.slice(0, 2);
    limit = Math.min(limit, 3);
    console.error(`[test] ${queries.length} queries x ${towns.length} towns x limit ${limit}`);
  }

  const byPlaceId = new Map(); // dedupe across every query x town
  let calls = 0;
  for (const town of towns) {
    for (const q of queries) {
      const query = `${q.term} ${town.suburb} ${town.state}`;
      calls++;
      try {
        const places = await outscraperMapsSearch(query, limit, apiKey);
        let kept = 0;
        for (const place of places) {
          const rec = toRecord(place, q, town, vertical);
          if (!rec) continue;
          // First sighting wins; keep the most specific category by not
          // overwriting (a re-scrape via the ingest fn handles refresh).
          if (!byPlaceId.has(rec.source_external_id)) {
            byPlaceId.set(rec.source_external_id, rec);
            kept++;
          }
        }
        console.error(`  "${query}": ${places.length} places, ${kept} new`);
      } catch (e) {
        console.error(`  "${query}": ERROR ${e.message}`);
      }
    }
  }

  const records = [...byPlaceId.values()];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = args.out || `data/scraped-${args.vertical}-${stamp}.json`;
  if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(records, null, 2));
  writeFileSync(out.replace(/\.json$/, ".csv"), toCsvPreview(records));

  console.error(`\nDone. ${calls} Outscraper calls -> ${records.length} unique businesses.`);
  console.error(`JSON: ${out}`);
  console.error(`CSV preview: ${out.replace(/\.json$/, ".csv")}`);
  console.error(`Next: inspect the CSV, then:`);
  console.error(`  node scripts/ingest-rural-directory.mjs ${out} <supabase_url> <service_role_key>`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
