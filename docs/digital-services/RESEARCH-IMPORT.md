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
- Each known or excluded entry must give a usable match key: a website/domain, an ABN, a phone, or a name with its locality. A name on its own is refused as an adapter gap rather than silently never matching.
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
- **Exit codes:** 0 reviewed; 1 some rows invalid; 2 usage error or an unreadable file; 3 adapter gap.
- **Imports:** the report always says `"imported": 0`.

## The explicit handoff contract: `oc-research-handoff/0.1-proposed`

The GLM first-customer research came back under its own contract, not the
generic candidate list above. It has its own adapter
(`lib/digital-services/research-handoff.ts`) and CLI. It reads the private
request packet, the JSON Schema shipped with it and the raw exclusions
snapshot. Keep all three, and the research return, outside this repository.

```sh
node --experimental-strip-types scripts/review-research-handoff.mjs research.json \
  --request research-input.json --schema research-output.proposed.schema.json \
  --exclusions research-exclusions.json --now 2026-10-05T23:00:00+11:00 [--summary]
```

**Contract-level checks.** If any of these fails, no business is judged:
- The return, request and schema all name the same contract, request ID and exclusions SHA-256.
- The exclusions file is hashed as raw bytes and must match the pin.
- The request keeps sending, spending, publishing, form submissions, production changes and database writes off.
- The schema uses only keywords the adapter implements.
- No approval-like fields appear at the top level.

**Row-level adapter errors** reject only that row (`rejected`), and are counted apart from eligibility:
- A schema violation.
- A duplicate `candidate_key`.
- A malformed, non-https or credential-bearing URL. The credential is redacted in the report.
- Any `approv*`/`consent`/`cleared`/`permission`-style field.
- `sendable` not false, or a contact basis other than `not_established`.

**Eligibility.** An outcome only ever gets stricter than the researcher's call:
`proposed_for_owner_review`, `held`, `excluded`. These checks can tighten it:
- **Lane:** detailing, and mixed cleaning/detailing, are excluded segments for a cleaning request.
- **Ownership:**
  - A shared hosting platform or a town subdomain of a shared parent domain means ownership isn't established.
  - So does a primary URL off the owned domain.
- **Cross-business evidence:** evidence labelled primary but from another site, or dated after the run finished.
- **Existing identities:**
  - A domain match against the exclusions snapshot is excluded.
  - A name-only match is held for reconciliation.
  - `duplicate_of` IDs resolve through aliases.
- **In-batch duplicates:** the same site twice, or the same name on different sites.

**Value notes** don't move the outcome. They cover:
- no clear offer fit;
- low or unknown fit or identity confidence;
- a locality outside the request's start towns.

**Preserved:**
- Every hold, uncertainty and contact restriction.
- Evidence time, method (`source_type`), age and limitations.
- `sendable: false` and `contact_basis_status: "not_established"`.

The report assigns no application IDs and adds no emails. It never clears a hold or changes a segment.

**Refreshes:** these are evidence only. A row is rejected if:
- it wasn't requested;
- it isn't in the snapshot;
- its URL is on another domain;
- or it is missing.

**Receipt:** the counts must agree with the rows, and sends, form submissions, purchases and paid API activations must be 0.

**Output:** the report is deterministic for a given `--now`, so a `digest` shows the result is stable on repeat. It always says `"imported": 0, "writes": 0`.

**Exit codes:**
- 0 reviewed.
- 1 some rows have adapter errors.
- 2 usage error or unreadable file.
- 3 contract-level adapter error.

**Privacy:** use `--summary` for anything that might end up in a log. It prints counts only. Checked-in tests use synthetic identities and a copy of the schema whose constants are placeholders (`tests/fixtures/research-handoff/`).

**Real dry runs** (5 Oct 2026, private files hash-verified, results stored privately in `oc_planning.agent_updates`):

| Return | Rows | Proposed for owner review | Held | Excluded | Row errors | Receipt findings | Repeat |
|---|---|---|---|---|---|---|---|
| v1 | 23 | 6 | 10 | 7 | 0 | 0 | stable |
| v2 | 33 | 8 | 18 | 7 | 0 | 0 | stable |

Records imported: 0. Proposed rows are not accepted outreach: contact basis and value are still unresolved for every row.
