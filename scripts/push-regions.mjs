// scripts/push-regions.mjs
// Reads /tmp/regions.json and pushes rows to Supabase via the REST API
// using the service role key. Uses upsert with on_conflict=postcode.
// Usage: node scripts/push-regions.mjs <regions.json> <supabase_url> <service_role_key>
import { readFileSync } from "node:fs";

const inputPath = process.argv[2];
const url = process.argv[3];
const key = process.argv[4];
if (!inputPath || !url || !key) {
  console.error("Usage: node push-regions.mjs <json> <url> <service_role_key>");
  process.exit(1);
}

const rows = JSON.parse(readFileSync(inputPath, "utf8"));
const BATCH = 500;
let total = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH).map((r) => ({
    postcode: r.postcode,
    state: r.state,
    lga: r.lga,
    region_name: r.region,
  }));

  const res = await fetch(`${url}/rest/v1/regions?on_conflict=postcode`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error(`Batch ${i}-${i + batch.length} FAILED: ${res.status} ${txt.slice(0, 500)}`);
    process.exit(1);
  }
  total += batch.length;
  console.log(`Pushed ${total}/${rows.length}`);
}

console.log(`Done. Total ${total} rows.`);
