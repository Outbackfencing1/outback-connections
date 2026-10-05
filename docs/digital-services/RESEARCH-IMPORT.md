# Model-produced prospect research: shape and dry-run review

Prepared by Claude Code, 5 October 2026. Research from a model (for example
GLM's "ten fresh cleaners" JSON) is **context, not permission**. Nothing in
this repository imports it, reserves a company, drafts an email or contacts
anyone. Prospect data is owner-only and this repository is public, so the
research file itself is never committed.

## Status

- The GLM file is on Josh's laptop. The cloud session can't read laptop paths, so it hasn't been validated yet.
- To review it:
  - Josh attaches the file to the session, or Codex runs the command below locally.
  - A private export of the companies already held is used for reconciliation. Without it, only within-batch duplicates are caught.
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

## Run it (dry run; reads files, writes nothing)

```sh
node --experimental-strip-types scripts/review-research.mjs research.json --lane cleaning --known known.json
```

The output is a summary plus a verdict per row: `invalid`, `wrong_lane`,
`matches_existing`, `duplicate_in_batch` or `new_for_review`. The exit code is
1 if any row is invalid. The report always says `"imported": 0`.
