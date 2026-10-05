// LOCAL STACK ONLY: loads a pilot pack (JSON, kept outside the repo because
// prospect data is owner-only) into the local draft tables via the service
// role, and checks the database's draft hashes match the pack's.
// Usage: node scripts/local-stack/seed-pilot.mjs /path/to/pilot-pack.json
import { readFileSync } from "node:fs";
const GATEWAY = "http://localhost:54321/rest/v1";
const H = { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
const post = async (table, rows) => {
  const r = await fetch(`${GATEWAY}/${table}`, { method: "POST", headers: H, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
  return r.json();
};
const pack = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const p of pack) {
  await post("digital_services_pilot", [p.company]);
  for (const d of p.drafts) {
    const [row] = await post("digital_services_pilot_drafts", [{ company_id: p.company.id, revision: d.revision, subject: d.subject, body: d.body, sha256: "computed-by-db", preview_token: p.company.preview_token, offer: d.revision > 1 ? p.company.offer : null, author: d.author, change_reason: d.change_reason }]);
    console.log(`${p.company.id} r${d.revision}: db sha ${row.sha256.slice(0, 12)} ${row.sha256 === d.sha256 ? "== pack" : "!= pack (MISMATCH)"}`);
  }
}
