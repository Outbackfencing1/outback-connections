// Dry-run review of a model-produced prospect research file (for example
// GLM's ten-cleaner JSON). Reads local files only, prints a report, writes
// nothing and imports nothing. Run with Node 22+:
//   node --experimental-strip-types scripts/review-research.mjs <research.json> --lane cleaning \
//     [--known known.json] [--exclusions exclusions.json]
// known/exclusions: an array of companies (or an object holding one under
// companies/known/existing/exclusions/rows/items/entries), each with a name,
// website/domain, abn or phone. Never commit these files: prospect data is
// owner-only and this repository is public.
// Exit codes: 0 reviewed, 1 some rows invalid, 2 usage or unreadable input,
// 3 adapter gap (the file is a different contract; no business was judged).
import { readFileSync } from "node:fs";
import { loadIdentityList, reviewResearchBatch } from "../lib/digital-services/research.ts";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const valued = new Set(["--lane", "--known", "--exclusions"]);
const file = args.find((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
const lane = opt("--lane");
if (!file || !["cleaning", "detailing"].includes(lane)) {
  console.error("usage: node --experimental-strip-types scripts/review-research.mjs <research.json> --lane cleaning|detailing [--known known.json] [--exclusions exclusions.json]");
  process.exit(2);
}
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
let known = [];
let exclusions = [];
const readList = (name, label) => {
  try {
    return read(opt(name));
  } catch (e) {
    console.log(JSON.stringify({ lane, error: `${label} file unreadable: ${e.message}`, imported: 0 }, null, 2));
    process.exit(2);
  }
};
try {
  if (opt("--known")) known = loadIdentityList(readList("--known", "known"), "known");
  if (opt("--exclusions")) exclusions = loadIdentityList(readList("--exclusions", "exclusions"), "exclusions");
} catch (e) {
  console.log(JSON.stringify({ lane, adapter_gap: { reason: e.message }, imported: 0 }, null, 2));
  process.exit(3);
}
let research;
try {
  research = read(file);
} catch (e) {
  console.log(JSON.stringify({ lane, error: `research file unreadable: ${e.message}`, imported: 0 }, null, 2));
  process.exit(2);
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
const { adapter_gap, verdicts, summary } = reviewResearchBatch(research, lane, known, today, exclusions);
console.log(JSON.stringify({ lane, known: known.length, exclusions: exclusions.length, adapter_gap, summary, verdicts, imported: 0 }, null, 2));
process.exit(adapter_gap ? 3 : summary.invalid > 0 ? 1 : 0);
