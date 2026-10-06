// Dry-run review of a private research return under the explicit contract
// "oc-research-handoff/0.1-proposed" (for example GLM's first-customer
// research). Reads local files only, prints a report, writes nothing and
// imports nothing. Run with Node 22+:
//   node --experimental-strip-types scripts/review-research-handoff.mjs <output.json> \
//     --request research-input.json --schema research-output.proposed.schema.json \
//     --exclusions research-exclusions.json [--now 2026-10-05T23:00:00+11:00] [--summary]
// The exclusions file is hashed as raw bytes and must match the request's
// exclusions_sha256. Never commit these files or paste the full report into
// CI logs: prospect research is owner-only and this repository is public.
// --summary prints counts only (no business names).
// Exit codes: 0 reviewed, 1 some rows have adapter errors, 2 usage or
// unreadable input, 3 contract-level adapter error (no business was judged).
import { readFileSync } from "node:fs";
import { loadExclusionSnapshot, loadHandoffRequest, reportDigest, reviewHandoff } from "../lib/digital-services/research-handoff.ts";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const valued = new Set(["--request", "--schema", "--exclusions", "--now"]);
const file = args.find((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
if (!file || !opt("--request") || !opt("--schema") || !opt("--exclusions")) {
  console.error(
    "usage: node --experimental-strip-types scripts/review-research-handoff.mjs <output.json> --request req.json --schema schema.json --exclusions exclusions.json [--now ISO] [--summary]"
  );
  process.exit(2);
}
const out = (body, code) => {
  console.log(JSON.stringify({ ...body, imported: 0, writes: 0 }, null, 2));
  process.exit(code);
};
const readRaw = (path, label) => {
  try {
    return readFileSync(path);
  } catch (e) {
    out({ error: `${label} file unreadable: ${e.message}` }, 2);
  }
};
const readJson = (path, label) => {
  const raw = readRaw(path, label);
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch (e) {
    out({ error: `${label} file unreadable: ${e.message}` }, 2);
  }
};
const now = opt("--now") ?? new Date().toISOString();
if (Number.isNaN(Date.parse(now))) out({ error: "--now must be an ISO date-time" }, 2);
const requestRaw = readJson(opt("--request"), "request");
const schema = readJson(opt("--schema"), "schema");
const exclusionsRaw = readRaw(opt("--exclusions"), "exclusions");
const output = readJson(file, "research");
let request;
let exclusions;
try {
  request = loadHandoffRequest(requestRaw);
  exclusions = loadExclusionSnapshot(exclusionsRaw, request.exclusions_sha256);
} catch (e) {
  out({ adapter_errors: [e.message] }, 3);
}
const report = reviewHandoff(output, { request, schema, exclusions, now });
const digest = reportDigest(report);
const code = report.adapter_errors.length ? 3 : report.summary.row_errors > 0 ? 1 : 0;
if (args.includes("--summary")) {
  out(
    {
      contract_id: report.contract_id,
      request_id: report.request_id,
      adapter_errors: report.adapter_errors,
      summary: report.summary,
      receipt_findings: report.receipt?.findings ?? [],
      refreshes: report.refreshes.map((r) => ({ prospect_id: r.prospect_id, outcome: r.outcome })),
      digest,
    },
    code
  );
}
out({ ...report, digest }, code);
