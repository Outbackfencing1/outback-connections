// Emits separate INSERT statements in chunks of 500 rows.
// Writes each chunk to /tmp/regions-chunk-NN.sql for sequential MCP application.
import { readFileSync, writeFileSync } from "node:fs";

const inputPath = process.argv[2];
const outDir = process.argv[3] || "/tmp";
const CHUNK = parseInt(process.argv[4] || "500", 10);

const rows = JSON.parse(readFileSync(inputPath, "utf8"));

function lit(s) {
  if (s === null || s === undefined || s === "") return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

let chunkNum = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  chunkNum++;
  const slice = rows.slice(i, i + CHUNK);
  const values = slice.map(
    (r) => `(${lit(r.postcode)},${lit(r.state)},${lit(r.lga)},${lit(r.region)})`
  );
  const sql = `insert into public.regions (postcode, state, lga, region_name)
values
${values.join(",\n")}
on conflict (postcode) do update set
  state = excluded.state,
  lga = excluded.lga,
  region_name = excluded.region_name;
`;
  const path = `${outDir}/regions-chunk-${String(chunkNum).padStart(2, "0")}.sql`;
  writeFileSync(path, sql);
}
console.error(`Wrote ${chunkNum} chunk file(s).`);
