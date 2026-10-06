# Preparation queue (owner-only, draft migration, no automatic worker)

The queue holds preparation work for pilot companies:
- research review;
- evidence refresh;
- preview build;
- copy draft;
- copy review.

It is durable and owner-only. **It is a queue and a record, not a worker.** Nothing in this repository processes jobs automatically, and the dashboard says so.

The private engine's source (`outback-digital-services/app/src/worker.ts`, `imports.ts`) is not in this repository. So the hand-off between the queue and the engine is a file exchange, run by a person.

## Pieces

| Piece | Where |
|---|---|
| Tables and functions | `supabase/migrations/_drafts/digital_services_prep_queue.sql` (draft, **not applied**; apply after `digital_services_pilot.sql`) |
| Packet/result contracts | `lib/digital-services/prep-queue.ts` (`oc-prep-packet/0.2` is built by the database; `oc-prep-result/0.1` is validated here) |
| Owner actions | `app/dashboard/owner/prep-actions.ts` (each re-checks `getOwnerAccess()`) |
| Dashboard section | `app/dashboard/owner/PrepSection.tsx` (`#prep` on `/dashboard/owner`) |
| Packet download | `GET /dashboard/owner/prep/<job id>/packet` (owner only; anyone else gets a 404) |

## Rules the database enforces

**Hashes and immutability**
- The packet and result are stored as the exact text exchanged. Their SHA-256 is computed by the database, never taken from the caller.
- A packet is immutable, and so is a recorded result.
- Packets are built only by `prep_enqueue`, inside the database, from one locked snapshot. The function locks the company row first; any evidence or uncertainties change updates that row, so it either waits for the enqueue or the enqueue reads what it committed. No packet mixes two evidence revisions.
- A packet carries everything the work needs:
  - company facts: id, name, lane, offer, evidence revision, open uncertainties;
  - every evidence item: source, type, check time (UTC), the recorded fact text and its limitations;
  - for review and preview jobs, the exact draft: subject, body, offer, revision, the evidence revision it was written from, and its SHA-256 (of subject, blank line, body).
- A missing fact refuses the packet; it is never invented. Refusals: no such company, no recorded evidence, no draft for a review or preview job, a draft from another company, a draft whose stored hash doesn't match its copy, a draft written against older evidence, a draft on a kind that doesn't take one, or a copy draft with no offer chosen.
- **A stale capture is refused, never relabelled.** A packet whose evidence revision isn't the company's current one can't be inserted (`OC409`), even if evidence changes mid-enqueue.

**Idempotent enqueue**
- The same packet for the same company and kind is one job. Re-queuing says "already queued".

**Leases**
- `prep_claim(worker, lease, job?)` takes a lease. Each claim gets a new `lease_generation` and a unique `lease_token`, returned with the claimed row.
- `prep_heartbeat(job, token, …)` extends it and records progress.
- `prep_heartbeat`, `prep_complete(job, token, result)` and `prep_fail(job, token, error)` need this claim's token and an unexpired lease. An earlier claim of the same job, by the same worker or another, can't act under a later one, and a late failure on an expired lease changes nothing (no attempt used, no backoff).

**Restart recovery**
- An expired lease can be reclaimed. The old claim's late heartbeat, failure or result is refused (`lost_lease`), whoever reclaimed it.
- Each claim counts as an attempt. A job that keeps losing its lease fails once its attempts run out; it never loops.

**Bounded retries**
- `prep_fail` re-queues the job with a backoff of 1, 2, 4… minutes, capped at 60, until `max_attempts` (default 3, at most 10). After that the job is failed.
- An owner retry gives a failed job fresh attempts.

**Pause and resume**
- The whole queue (`prep_set_paused`), or one queued job (`prep_control`), can be paused and resumed.
- A paused queue hands nothing off.

**Revision invalidation**
- A job is tied to the company's evidence revision when it is queued.
- If evidence or uncertainties change, the job goes stale. It can't be claimed or completed, and it can't be retried. Queue a new packet instead.

**Idempotent results**
- Completing again with the same result returns `already`.
- A different result for a finished job is refused (`conflict`).

**Locked down**
- All state changes go through security-definer functions that only the service role can execute.
- The service role can only read jobs. It can't insert, update or delete them directly: queueing goes through `prep_enqueue`.
- `anon` and `authenticated` get nothing.

**Scope**
- The queue never writes drafts, reviews, approvals or contact events.

## Running a job by hand (the file hand-off)

1. On `/dashboard/owner#prep`, use **Queue a preparation job**. Enter the pilot ID, the kind, and the draft ID for review and preview jobs.
2. Press **Hand off to me (24 h)**. This claims the job as `handoff:owner` with a 24-hour lease. The import form carries that hand-off's lease token, so a stale tab from an earlier hand-off can't record a result under a later one (reload the page after handing off again).
3. Press **Download packet** to get the exact stored text. The `X-Packet-SHA256` header carries the database's hash.
   - Give the packet to the private engine, or work it yourself.
   - The packet carries its task, the company facts, the full evidence text, the exact draft copy (for review and preview jobs) and the constraints: not sendable, no contact, no spending, no publishing.
4. Paste the result file (`oc-prep-result/0.1`) into **Import result**. It must name:
   - this job;
   - this exact packet hash;
   - this kind;
   - who produced it, and when.

   It is rejected if it has any of these:
   - approval or consent fields;
   - `sendable` set to anything but false;
   - unknown fields;
   - outputs without real SHA-256 hashes;
   - a completed copy review without a verdict and a named reviewer.

   A `blocked` result counts as a failed attempt and backs off.
5. An imported review verdict is the worker's report. **It is not an approval.** Approvals happen only on the review screen, `/dashboard/owner/review/<draft id>`, by Josh, and they still send nothing.

## What the engine would need to work the queue

- It would call `prep_claim` with the service role, its own worker name and the default 10-minute lease, then `prep_heartbeat` / `prep_complete` / `prep_fail` with the token that claim returned.
- This is not built or scheduled. Josh has to approve it, as it would be a background job.
- Whatever runs it, the database rules above still hold. It can't mark a job done without a lease, revive a stale job, or touch approvals or sending.

## Tests

- `tests/prep-queue-migration.test.ts` runs PGlite on the real draft SQL. It covers:
  - packets built in the database with the full evidence text, company facts and exact draft copy, independent of the session time zone;
  - a stale capture refused, including evidence changing mid-enqueue (simulated with a trigger that fires before the insert);
  - every missing-fact refusal;
  - idempotent enqueue;
  - per-claim lease tokens: forged, missing and old tokens refused;
  - expired-lease recovery under the same worker and another one, with late heartbeats, failures and results refused;
  - backoff and attempt limits;
  - pause/resume;
  - staleness on an evidence change;
  - permissions (direct inserts refused);
  - one held fixture draft end to end: packet retrieval, a review produced only from the packet by a stand-in reviewer (the private engine isn't connected to this repository), result validation and import, and no approval or contact event written.
- `tests/prep-queue.test.ts` covers:
  - every refusal the dashboard explains is one the migration raises;
  - result validation;
  - owner gating for every action and the packet route;
  - outcome reporting.
- On the local stack:
  - `flow.spec.ts` queues a job, hands it off, checks the downloaded packet's hash against the database, rejects a wrong-packet result and records the right one. Members get a 404 on the packet.
  - `lifecycle.sh` hands a job off before a server restart and records its result after it, once.
