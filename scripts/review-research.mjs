// Dry-run review of a model-produced prospect research file (for example
// GLM's ten-cleaner JSON). Reads local files only, prints a report, writes
// nothing and imports nothing. Run with Node 22+:
//   node --experimental-strip-types scripts/review-research.mjs <research.json> --lane cleaning [--known known.json]
// known.json: [{ "id", "business_name", "website", "abn", "phone", "locality" }]
// exported privately from the companies we already hold. Never commit either
// file: prospect data is owner-only and this repository is public.
import { readFileSync } from "node:fs";
import { reviewResearchBatch } from "../lib/digital-services/research.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--lane" && args[args.indexOf(a) - 1] !== "--known");
const lane = args[args.indexOf("--lane") + 1];
const knownPath = args.includes("--known") ? args[args.indexOf("--known") + 1] : null;
if (!file || !["cleaning", "detailing"].includes(lane)) {
  console.error("usage: node --experimental-strip-types scripts/review-research.mjs <research.json> --lane cleaning|detailing [--known known.json]");
  process.exit(2);
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
const known = knownPath ? JSON.parse(readFileSync(knownPath, "utf8")) : [];
const { verdicts, summary } = reviewResearchBatch(JSON.parse(readFileSync(file, "utf8")), lane, known, today);
console.log(JSON.stringify({ lane, known: known.length, summary, verdicts, imported: 0 }, null, 2));
process.exit(summary.invalid > 0 ? 1 : 0);
