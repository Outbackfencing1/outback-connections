// scripts/seed-regions.mjs
// One-off seed: parse australianpostcodes CSV, dedupe by postcode (one row
// per postcode), filter to type="Delivery Area", emit JSON for batch upsert.
//
// Run via: node scripts/seed-regions.mjs /tmp/aupc.csv > /tmp/regions.json
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/seed-regions.mjs <csv-path>");
  process.exit(1);
}

const raw = readFileSync(path, "utf8");
const lines = raw.split(/\r?\n/);
const header = parseLine(lines[0]);
const idx = (name) => header.indexOf(name);

const POSTCODE = idx("postcode");
const LOCALITY = idx("locality");
const STATE = idx("state");
const TYPE = idx("type");
const LGA_NAME = idx("lgaregion");
const SA3_NAME = idx("sa3name");

if ([POSTCODE, LOCALITY, STATE, TYPE].some((i) => i < 0)) {
  console.error("Missing required columns in CSV", { POSTCODE, LOCALITY, STATE, TYPE });
  process.exit(1);
}

const byPostcode = new Map();
let total = 0;
let skipped = 0;

for (let i = 1; i < lines.length; i++) {
  const ln = lines[i];
  if (!ln.trim()) continue;
  total++;
  const cols = parseLine(ln);
  const type = cols[TYPE];
  if (type !== "Delivery Area") {
    skipped++;
    continue;
  }
  const postcode = cols[POSTCODE];
  const state = cols[STATE];
  const locality = cols[LOCALITY];
  if (!postcode || !state || !/^\d{3,4}$/.test(postcode)) {
    skipped++;
    continue;
  }
  // Pad 3-digit postcodes to 4 (e.g. "200" → "0200")
  const pc = postcode.padStart(4, "0");
  const lga = cols[LGA_NAME] || null;
  const region = cols[SA3_NAME] || null;

  const existing = byPostcode.get(pc);
  // Heuristic for which locality to keep when many share a postcode:
  //   1) prefer the locality whose name matches the SA3 region (this is
  //      almost always the canonical "main town" — e.g. 2800 → Orange,
  //      not Ammerdown)
  //   2) otherwise prefer the alphabetically-first locality (deterministic)
  if (!existing) {
    byPostcode.set(pc, { postcode: pc, state, locality, lga, region });
    continue;
  }
  const norm = (s) => (s || "").toUpperCase().trim();
  const localityMatchesRegion = norm(locality) === norm(region);
  const existingMatchesRegion = norm(existing.locality) === norm(existing.region);
  if (localityMatchesRegion && !existingMatchesRegion) {
    byPostcode.set(pc, { postcode: pc, state, locality, lga, region });
  } else if (!localityMatchesRegion && existingMatchesRegion) {
    // existing wins
  } else if (locality < existing.locality) {
    byPostcode.set(pc, { postcode: pc, state, locality, lga, region });
  }
}

const rows = Array.from(byPostcode.values()).sort((a, b) =>
  a.postcode.localeCompare(b.postcode)
);

console.error(`Parsed ${total} rows. Skipped ${skipped} (non-delivery / bad postcode).`);
console.error(`Unique delivery postcodes: ${rows.length}`);
console.error(`States: ${[...new Set(rows.map((r) => r.state))].sort().join(", ")}`);
const sample = rows.find((r) => r.postcode === "2800");
console.error(`2800 sample: ${JSON.stringify(sample)}`);

// Output JSON array (one row per postcode)
process.stdout.write(JSON.stringify(rows));

// ----------------------------------------------------------------
// Tiny CSV-line parser handling quoted fields with embedded commas.
// ----------------------------------------------------------------
function parseLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') {
        inQ = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}
