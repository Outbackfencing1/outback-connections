// scripts/filter-scraped-types.mjs
// ------------------------------------------------------------
// Junk filter for scraped business lists, by Google Maps TYPE — not by name.
//
// Why: the 4 Jul pilot ran 8 hand-staged records through a name-level audit
// and still shipped 37% junk to the import gate — "Cadagi Farm" was a wedding
// venue and "Rosedale Farm" a B&B; only the raw `type` field told the truth.
// Any bigger list (the 5,890-lead NSW scrape feeding the claim-invite
// campaign) MUST pass through this before anyone is contacted: emailing a
// wedding venue about their "rural business listing" reads as spam from
// message one.
//
// Verdicts, decided on the record's primary Google `type`:
//   CUT     type matches the junk blocklist (accommodation, events, food
//           service, tourism, retail-only, community)
//   KEEP    type — or failing that, subtypes — matches the rural allowlist.
//           (Subtypes alone never CUT: real farms carry "Farmers' market" /
//           "Produce market" subtypes, e.g. Martelli Orchards.)
//   REVIEW  everything else. Unknown types are NOT silently kept — a human
//           eyeballs the review file. Missing `type` entirely → REVIEW.
//
// Usage:
//   node scripts/filter-scraped-types.mjs <scraped.json> [--summary-only]
//     [--allow "extra,types"] [--block "extra,types"]
//
// Accepts both shapes: staged ImportRecords (type under raw_payload) and raw
// Outscraper rows (type at top level). Writes <input>.kept.json,
// <input>.cut.json, <input>.review.json next to the input.
// ------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";

const RURAL_ALLOW = [
  "farm", "orchard", "vineyard", "ranch", "station",
  "agricultural service", "agricultural", "agronomist", "aerial",
  "livestock", "sheep", "cattle", "wool", "shear", "dairy", "feedlot",
  "grain", "seed", "fodder", "hay", "produce wholesaler", "vegetable wholesaler",
  "fencing", "fence", "rural", "farm equipment", "machinery", "tractor",
  "irrigation", "bore", "pump", "windmill", "stock", "abattoir",
  "veterinar", "animal", "horse", "equestrian",
  "earthmoving", "excavat", "welding", "steel", "engineering",
  "transport", "freight", "trucking", "haulage", "carrier",
  "feed store", "feed supplier", "stock feed", "saddlery", "produce store",
];

const JUNK_BLOCK = [
  // accommodation & tourism
  "bed & breakfast", "bed and breakfast", "hotel", "motel", "resort", "lodge",
  "caravan", "camp", "holiday", "cottage", "farmstay", "farm stay", "guest house",
  "tourist", "attraction", "museum",
  // events
  "wedding", "event venue", "function", "banquet",
  // food service & consumer retail
  "market", "cafe", "coffee", "restaurant", "bakery", "pub", "bar",
  "winery", "cellar", "brewery", "distillery", "florist", "gift",
  "grocery store", "supermarket", "butcher",
  // community / non-commercial
  "school", "church", "cemetery", "park", "playground", "library",
  "association", "non-profit", "charity", "community",
];

function matches(haystack, needles) {
  const h = (haystack || "").toLowerCase();
  return needles.find((n) => h.includes(n)) ?? null;
}

function classify(record, allow, block) {
  const raw = record.raw_payload ?? record;
  const type = raw.type ?? raw.category ?? null;
  const subtypes = raw.subtypes ?? "";

  if (!type) return { verdict: "review", reason: "no type field" };

  const blocked = matches(type, block);
  if (blocked) return { verdict: "cut", reason: `type "${type}" matches "${blocked}"` };

  const allowedType = matches(type, allow);
  if (allowedType) return { verdict: "keep", reason: `type "${type}" matches "${allowedType}"` };

  const allowedSub = matches(subtypes, allow);
  if (allowedSub) return { verdict: "keep", reason: `subtype matches "${allowedSub}" (type "${type}")` };

  return { verdict: "review", reason: `unrecognised type "${type}"` };
}

// ---- CLI ----
const positional = [];
let summaryOnly = false;
const extraAllow = [];
const extraBlock = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--summary-only") summaryOnly = true;
  else if (a === "--allow") extraAllow.push(...process.argv[++i].split(",").map((s) => s.trim().toLowerCase()));
  else if (a === "--block") extraBlock.push(...process.argv[++i].split(",").map((s) => s.trim().toLowerCase()));
  else positional.push(a);
}

const inputPath = positional[0];
if (!inputPath) {
  console.error("Usage: node scripts/filter-scraped-types.mjs <scraped.json> [--summary-only] [--allow t1,t2] [--block t1,t2]");
  process.exit(1);
}

const records = JSON.parse(readFileSync(inputPath, "utf8"));
if (!Array.isArray(records)) {
  console.error("Input must be a JSON array of scraped records.");
  process.exit(1);
}

const allow = [...RURAL_ALLOW, ...extraAllow];
const block = [...JUNK_BLOCK, ...extraBlock];
const buckets = { keep: [], cut: [], review: [] };

for (const r of records) {
  const { verdict, reason } = classify(r, allow, block);
  buckets[verdict].push(r);
  const name = r.name ?? r.raw_payload?.name ?? "(unnamed)";
  console.log(`${verdict.toUpperCase().padEnd(7)} ${name} — ${reason}`);
}

const total = records.length;
const junkRate = total ? Math.round((buckets.cut.length / total) * 100) : 0;
console.log(
  `\n${total} records → keep ${buckets.keep.length} · cut ${buckets.cut.length} (${junkRate}%) · review ${buckets.review.length}`
);
if (buckets.review.length > 0) {
  console.log("Review bucket is NOT importable — eyeball it, then re-run with --allow/--block to zero it out.");
}

if (!summaryOnly) {
  const base = inputPath.replace(/\.json$/i, "");
  for (const [verdict, rows] of Object.entries(buckets)) {
    const out = `${base}.${verdict}.json`;
    writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log(`wrote ${out} (${rows.length})`);
  }
}
