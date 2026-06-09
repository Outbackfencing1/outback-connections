// scripts/scrape-rural-directory.mjs
// ------------------------------------------------------------
// Phase 1 ingestion 1A — employer + carrier DIRECTORY scraper.
// Ported from the proven outback-ops store-scraper pattern (Outscraper Google
// Maps, dedupe by place_id, --test flag, file out). Acquisition only: this
// produces a JSON file (+ a CSV preview). Push into the DB via the REVIEWED web
// path: paste the .json into /dashboard/admin/import (Preview -> Commit). That
// keeps the service_role key server-side on Vercel. Do NOT use the CLI ingest
// for manual runs — it takes the service_role key on the command line.
//
// Usage:
//   node scripts/scrape-rural-directory.mjs jobs     [--test] [--limit 20] [--out data/x.json]
//   node scripts/scrape-rural-directory.mjs freight  [--test] [--limit 20] [--out data/x.json]
//   node scripts/scrape-rural-directory.mjs services [--test] [--limit 20] [--out data/x.json]
//
// Key: OUTSCRAPER_API_KEY in .env.local (this repo). Josh runs the real scrape.
//
// Verified 2026-06-08 against the live Outscraper Maps API (async submit + poll)
// — real Orange/Dubbo results. toRecord coalesces common field-name variants;
// run with --raw if a future response shape ever differs.
// `services` mode added 2026-06-09 — rural SUPPLY STORES into the Services
// vertical (vertical=service, side=supply, kind=service_offering downstream).
// It rides the identical Maps path / ImportRecord shape, so it is verified by
// construction; --test it once to confirm your account's response shape.
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
  // Carrier directory (the freight "twin" — same script in freight mode, so the
  // ImportRecord shape, dedupe, async-poll and honesty marking are shared; only
  // the query/category map differs). Transport companies, depots and carriers
  // across every freight cargo type. vertical=freight; side=supply is derived
  // downstream in ingest_scraped_business / preview_scraped_import.
  freight: [
    // livestock
    { term: "livestock transport", category_slug: "livestock-freight" },
    { term: "stock cartage", category_slug: "livestock-freight" },
    { term: "cattle transport", category_slug: "livestock-freight" },
    // grain / bulk
    { term: "grain haulage", category_slug: "grain-freight" },
    { term: "bulk grain transport", category_slug: "grain-freight" },
    // hay / fodder
    { term: "hay transport", category_slug: "hay-freight" },
    { term: "fodder transport", category_slug: "hay-freight" },
    // machinery / oversize
    { term: "heavy haulage", category_slug: "machinery-freight" },
    { term: "machinery transport", category_slug: "machinery-freight" },
    { term: "oversize float transport", category_slug: "machinery-freight" },
    // fuel / water
    { term: "fuel cartage", category_slug: "fuel-water-freight" },
    { term: "water cartage tanker", category_slug: "fuel-water-freight" },
    // refrigerated
    { term: "refrigerated transport", category_slug: "refrigerated-freight" },
    // general carriers / depots
    { term: "rural freight transport", category_slug: "general-rural-freight" },
    { term: "transport company", category_slug: "general-rural-freight" },
    { term: "freight depot", category_slug: "general-rural-freight" },
    { term: "carrier transport", category_slug: "general-rural-freight" },
  ],
  // Supplier directory (the services "twin" — same script in services mode, so
  // the ImportRecord shape, dedupe, async-poll and honesty marking are shared;
  // only the query/category map differs). Rural supply stores, produce, stock
  // feed, machinery dealers + the national rural-retail majors. vertical=service
  // and side=supply are derived downstream in ingest_scraped_business /
  // preview_scraped_import.
  //
  // CATEGORY NOTE: the live Services taxonomy is contractor-services only —
  // there is no ACTIVE "rural supplies / produce / stock feed / machinery
  // dealer / fodder" category yet (the only supply-ish slugs, feed-hay &
  // steel-supply, are inactive). So every supply term maps to the active
  // catch-all `services-other` ("Other rural service"), via the SAME
  // query->category fallback jobs/freight use. When supply categories are
  // added, swap these slugs and a re-scrape reclassifies (idempotent).
  services: [
    // generic rural retail / merchandise
    { term: "rural supplies store", category_slug: "services-other" },
    { term: "farm supplies", category_slug: "services-other" },
    { term: "agricultural supplies", category_slug: "services-other" },
    { term: "rural merchandise", category_slug: "services-other" },
    { term: "produce store", category_slug: "services-other" },
    // feed / fodder
    { term: "stock feed supplier", category_slug: "services-other" },
    { term: "fodder hay supplier", category_slug: "services-other" },
    // machinery dealers
    { term: "farm machinery dealer", category_slug: "services-other" },
    // national rural-retail majors + CRT network (independents surface under the
    // generic terms above)
    { term: "Nutrien Ag Solutions", category_slug: "services-other" },
    { term: "Landmark rural store", category_slug: "services-other" },
    { term: "Elders rural store", category_slug: "services-other" },
    { term: "CRT rural store", category_slug: "services-other" },
  ],
};

// ------------------------------------------------------------
function parseArgs(argv) {
  const a = { vertical: argv[2], test: false, limit: 20, out: null, raw: false };
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--test") a.test = true;
    else if (argv[i] === "--raw") a.raw = true;            // dump raw Outscraper response
    else if (argv[i] === "--limit") a.limit = parseInt(argv[++i], 10) || 20;
    else if (argv[i] === "--out") a.out = argv[++i];
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Outscraper's Google Maps endpoint is heavy: it normally returns a PENDING
// request you must poll (async), even when you ask for async=false. So we
// submit, poll the results location until Success, then normalise the envelope
// to a flat place[] array. Run with --raw to print the actual shapes if this
// still doesn't line up with your account's response.
async function outscraperMapsSearch(query, limit, apiKey, raw = false) {
  const submitUrl =
    "https://api.outscraper.com/maps/search-v3" +
    `?query=${encodeURIComponent(query)}&limit=${limit}&async=true`;
  const res = await fetch(submitUrl, { headers: { "X-API-KEY": apiKey } });
  const json = await res.json().catch(() => ({}));
  if (raw) console.error(`[raw submit] ${JSON.stringify(json).slice(0, 1000)}`);
  if (!res.ok) {
    throw new Error(`Outscraper submit ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }

  // Some plans return results inline; otherwise poll the request id / location.
  let payload = json;
  if (!Array.isArray(json?.data)) {
    const loc =
      json?.results_location ||
      (json?.id ? `https://api.outscraper.com/requests/${json.id}` : null);
    if (!loc) {
      throw new Error(`Outscraper: no data and no results_location/id: ${JSON.stringify(json).slice(0, 300)}`);
    }
    payload = await pollResults(loc, apiKey, raw);
  }
  return unwrapPlaces(payload, raw);
}

async function pollResults(loc, apiKey, raw) {
  const MAX = 40;
  const DELAY = 5000; // ~3.3 min max
  for (let i = 0; i < MAX; i++) {
    await sleep(DELAY);
    const res = await fetch(loc, { headers: { "X-API-KEY": apiKey } });
    const json = await res.json().catch(() => ({}));
    const status = String(json?.status || "").toLowerCase();
    if (raw && i === 0) console.error(`[raw poll] status=${status} ${JSON.stringify(json).slice(0, 600)}`);
    if (status === "success" || Array.isArray(json?.data)) return json;
    if (status === "error" || status === "failed") {
      throw new Error(`Outscraper request failed: ${JSON.stringify(json).slice(0, 300)}`);
    }
    // pending / inprogress -> keep polling
  }
  throw new Error("Outscraper: polling timed out (still pending after ~3 min)");
}

// Normalise the Outscraper envelope to a flat array of place objects. Outscraper
// returns `data` aligned to queries ([[place,...]] for a single query), and
// occasionally a flat [place,...]. Handle both.
function unwrapPlaces(payload, raw) {
  const data = payload?.data;
  if (raw) {
    console.error(`[raw data] type=${Array.isArray(data) ? "array[" + data.length + "]" : typeof data}`);
    const first = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0]?.[0] : data[0]) : null;
    if (first && typeof first === "object") console.error(`[raw place keys] ${Object.keys(first).join(", ")}`);
  }
  if (!Array.isArray(data) || data.length === 0) return [];
  if (Array.isArray(data[0])) return data.flat();          // per-query nesting
  if (data[0] && typeof data[0] === "object") return data; // flat
  return [];
}

// Map an Outscraper place + the query context into an ingest-ready record.
function toRecord(place, q, town, vertical) {
  const placeId = place.place_id || place.google_id || place.cid;
  if (!placeId) return null; // no stable dedupe key -> skip (honest)
  const name = String(place.name || place.title || "").trim();
  if (!name) return null;
  // Prefer the place's own postcode; else pull the last 4-digit group from the
  // full address; else fall back to the query town's postcode.
  const addrMatch = String(place.full_address || place.address || "").match(/\b\d{4}\b/g);
  const addrPc = addrMatch ? addrMatch[addrMatch.length - 1] : null;
  const postcode = String(place.postal_code || place.postcode || addrPc || town.postcode || "").trim();
  if (!/^\d{4}$/.test(postcode)) return null; // postcode is required + must be real
  const website = place.site || place.website || null;
  const sourceUrl =
    place.location_link || // Google Maps listing URL (best source attribution)
    (place.google_id ? `https://www.google.com/maps/place/?q=place_id:${place.google_id}` : null) ||
    website ||
    `https://www.google.com/maps/search/${encodeURIComponent(name + " " + town.suburb)}`;
  return {
    vertical,
    source_platform: "google_maps",
    source_external_id: String(placeId),
    source_url: sourceUrl,
    name,
    category_slug: q.category_slug,
    postcode,
    suburb: place.city || place.borough || town.suburb,
    state: place.state || place.us_state || town.state,
    website,
    geo_lat: place.latitude ?? place.lat ?? null,
    geo_lng: place.longitude ?? place.lng ?? null,
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
  if (!["jobs", "freight", "services"].includes(args.vertical)) {
    console.error("Usage: node scripts/scrape-rural-directory.mjs <jobs|freight|services> [--test] [--limit N] [--out path]");
    process.exit(1);
  }
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    console.error("OUTSCRAPER_API_KEY missing. Add it to .env.local (this repo).");
    process.exit(1);
  }
  // The ingest fn uses singular vertical ('job'|'freight'|'service'); CLI uses plural.
  const vertical =
    args.vertical === "jobs" ? "job" : args.vertical === "freight" ? "freight" : "service";

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
        const places = await outscraperMapsSearch(query, limit, apiKey, args.raw);
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
  if (records.length === 0) {
    console.error(
      "\nNo records produced — nothing written. The Outscraper response shape " +
      "likely didn't match (async/polling or envelope). Re-run with --raw to dump " +
      "the raw response + place keys, then share them and I'll tune the mapping."
    );
    process.exit(1);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = args.out || `data/scraped-${args.vertical}-${stamp}.json`;
  if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(records, null, 2));
  writeFileSync(out.replace(/\.json$/, ".csv"), toCsvPreview(records));

  console.error(`\nDone. ${calls} Outscraper calls -> ${records.length} unique businesses.`);
  console.error(`JSON: ${out}`);
  console.error(`CSV preview: ${out.replace(/\.json$/, ".csv")}`);
  console.error(`Next: glance at the CSV, then open the .json, copy it, and paste into`);
  console.error(`the reviewed web import (keeps your service_role key server-side):`);
  console.error(`  https://www.outbackconnections.com.au/dashboard/admin/import`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
