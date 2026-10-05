# Engine source handoff: what's missing and what happens when it arrives

As of 5 October 2026 the cloud Claude Code session can reach only this
marketplace repository. The digital-services engine and its records exist only
on Josh's PC (`Outback Connections 2/outback-digital-services/`). Codex's
upload of `codex/digital-services-engine-source` stopped because real tokens
were found in the tree. Nothing below has started; it is blocked on this
handoff, not on a decision.

## What to push (one private branch or repo, then tell Claude Code)

Keep together, because the 146 engine tests depend on them:
- the engine source, `starter/`, `examples/`, `schemas/`, root `*-PROMPT.md`
  files, `BUILD-STATUS.md` and `verification/` result files;
- `claude-review-results/SUMMARY.md` and the ten `OC-*-review.json`
  (OC-002, 003, 005, 006, 008, 010, 013, 015, 016, 017);
- the GLM creator outputs and inputs, with their history (fixtures stay
  fixtures);
- Cowork's `claude-cowork/website-factory/data/drafts-2026-10-05.json` and
  `site-previews/CLAUDE-CODE-MORNING.md`.

Leave out: `.env*`, tokens, keys, cookies, local databases holding personal
records, `node_modules`, caches, `_to_delete/`. Add them to `.gitignore`,
rerun the secret scan, and **rotate any token that ever left the PC**. Private
operational data (the local database) is shared through approved storage, not
git.

## What Claude Code does on arrival (in order)

1. Run the engine's own tests on Node 22 (the runtime Vercel reports) and
   record which pass, as reproduced evidence.
2. Import the ten reviews through the existing review contract, matching
   job IDs, input hashes, contract version and reviewed revisions. Recompute
   `evidence_hash`/`proposal_hash` from the stored packets; where Cowork's
   copied values don't match, record the mismatch rather than rewriting
   history. All ten stay **held**.
3. Company-level first-contact holds for OC-002, OC-003, OC-010 and OC-017
   (reserved for the Cowork pilot, not contacted), keyed on a canonical
   company ID with source IDs/aliases. The check goes in the server-side
   dispatch guard (reservation, contact history, suppression, current approval,
   replies, caps), with tests for a second address at the same company and two
   concurrent dispatches.
4. Bounded repairs as new revisions (originals preserved): shorter
   evidence-backed service labels that wrap at 390px; no internal notes ("your
   inspected contact page") in customer copy; no unsupported promises ("ready to
   price"); office/commercial/domestic flows only where evidence supports them;
   neutral wording in place of "This sample uses the selected commercial job
   questions."; refresh primary evidence for OC-002/005/006/015/016; OC-013
   stays on identity hold. Never derive "Home cleaning" from "homepage".
5. Rebuild, 390px and 1440px browser QA with real screenshots, and export
   fresh packets for Cowork's re-review.
6. Existing-stack adapter: inventory the local database, then additive
   Supabase operational tables for the records the code actually uses, readable
   SQL with rollback notes, tested locally (PGlite, as for
   `digital_services_enquiries`) and on a no-cost environment if one exists.
   Count/ID/hash reconciliation and interrupted-rerun tests. **Not applied to
   production** without Josh.
7. Runtime: no test-only database code on live import paths; Node 22, not
   Node 24.

## Mailbox and replies (separate from the engine import)

Blocked on a verified Outback Connections sender (not help@, which is the
support/transactional identity). Once one exists, prepare: provider events with
periodic catch-up, stored provider/thread IDs and sync cursor, pause
follow-ups on any reply before AI classification, company-wide opt-out
suppression, bounce and auto-reply handling, dispatch paused when sync is
stale, attempt intent persisted before dispatch, and unknown outcomes
reconciled against provider history before any retry. Drafting stays
draft-only; the model never sends, prices or publishes. Prove it with owned
test inboxes only.
