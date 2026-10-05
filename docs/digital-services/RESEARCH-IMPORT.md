# Model-produced prospect research: shape and dry-run review

Prepared by Claude Code, 5 October 2026. Research from a model (for example
GLM's "ten fresh cleaners" JSON) is **context, not permission**. Nothing in
this repository imports it, reserves a company, drafts an email or contacts
anyone. Prospect data is owner-only and this repository is public, so the
research file itself is never committed.

## Status

- Codex ran the real GLM return (23 rows: 6 proposed, 10 holds, 7 exclusions) through this checker. It didn't fit:
  - With its exclusions file, the checker crashed ("known.map is not a function"). That's fixed: identity lists can be an array or an object holding one. Anything else is reported as an adapter gap naming the keys it found.
  - Without the exclusions, all 23 rows failed the expected shape. That's now reported as an **adapter gap** (exit 3, no business judged), not as 23 rejections.
- **Still needed:** the actual return, its exclusions and its request/schema file, attached to this session. Then the GLM adapter can map its fields, validate the schema, request and hash, and run a real dry run. Those files aren't in this cloud session.
- Reconciliation uses a private export of the companies already held (`--known`). Without it, only within-batch duplicates are caught.
- After a person checks the evidence, any accepted candidate goes through the engine's own import (the existing application boundary), not through this script.

## Expected shape

An array, or `{ "candidates": [...] }`, of:

```json
{
  "business_name": "Example Cleaning Pty Ltd",
  "category": "cleaning",
  "website": "https://example.com.au",
  "locality": "Orange",
  "state": "NSW",
  "abn": "optional, must pass the ATO checksum",
  "phone": "optional, Australian",
  "public_email": "optional; only an address the business publishes itself",
  "disposition": "proposed | hold | excluded (optional, default proposed)",
  "holds": ["required for hold/excluded: the researcher's reasons, kept as given"],
  "evidence": [
    { "claim": "Office and strata cleaning", "url": "https://example.com.au/services", "observed_on": "2026-10-04" },
    { "claim": "Publishes info@example.com.au on its contact page", "url": "https://example.com.au/contact", "observed_on": "2026-10-04" }
  ]
}
```

Rules (`lib/digital-services/research.ts`):
- **Category:** `cleaning` or `detailing`. A batch is reviewed for one lane. The other lane's rows are reported as `wrong_lane`, never merged. Cleaners and detailers stay separate.
- **Evidence:** every candidate needs at least one dated, https source, including one on its own website if it has one.
  - A `public_email` must appear in an evidence claim that says where the business publishes it.
  - Observations can't be dated in the future.
- **Identity reconciliation:** in this order (canonical domain, ABN, phone, then normalised name + locality), against companies already held and within the batch.
  - Matches are reported as `matches_existing` or `duplicate_in_batch`. They aren't new prospects, and existing reservations, suppression and history win.
- **Holds and exclusions:** the researcher's own `hold`/`excluded` calls are kept as `research_hold`/`research_excluded`, with their reasons, and are never promoted to new.
- **Adapter gap:** if the file isn't a candidate list, or every row fails on shape, the result is an adapter gap that names the keys found. No business is judged. A different contract needs an adapter, not a rejection.

## Run it (dry run; reads files, writes nothing)

```sh
node --experimental-strip-types scripts/review-research.mjs research.json --lane cleaning \
  --known known.json --exclusions exclusions.json
```

- **Output:** a summary plus a verdict per row: `invalid`, `wrong_lane`, `excluded_by_list`, `matches_existing`, `duplicate_in_batch`, `research_hold`, `research_excluded` or `new_for_review`.
- **Exit codes:** 0 reviewed; 1 some rows invalid; 2 usage error; 3 adapter gap.
- **Imports:** the report always says `"imported": 0`.
