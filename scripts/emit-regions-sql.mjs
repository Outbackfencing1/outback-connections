// scripts/emit-regions-sql.mjs
// Reads /tmp/regions.json and emits a single INSERT ... ON CONFLICT statement
// suitable for Supabase apply_migration / execute_sql.
import { readFileSync } from "node:fs";

const inputPath = process.argv[2] || "/tmp/regions.json";
const rows = JSON.parse(readFileSync(inputPath, "utf8"));

function lit(s) {
  if (s === null || s === undefined || s === "") return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

const values = rows.map(
  (r) =>
    `(${lit(r.postcode)},${lit(r.state)},${lit(r.lga)},${lit(r.region)})`
);

const sql = `
insert into public.regions (postcode, state, lga, region_name)
values
${values.join(",\n")}
on conflict (postcode) do update set
  state = excluded.state,
  lga = excluded.lga,
  region_name = excluded.region_name;
`;

process.stdout.write(sql);
console.error(`Emitted ${rows.length} VALUES rows.`);
