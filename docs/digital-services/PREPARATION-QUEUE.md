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
| Packet/result contracts | `lib/digital-services/prep-queue.ts` (`oc-prep-packet/0.1`, `oc-prep-result/0.1`) |
| Owner actions | `app/dashboard/owner/prep-actions.ts` (each re-checks `getOwnerAccess()`) |
| Dashboard section | `app/dashboard/owner/PrepSection.tsx` (`#prep` on `/dashboard/owner`) |
| Packet download | `GET /dashboard/owner/prep/<job id>/packet` (owner only; anyone else gets a 404) |

## Rules the database enforces

**Hashes and immutability**
- The packet and result are stored as the exact text exchanged. Their SHA-256 is computed by the database, never taken from the caller.
- A packet is immutable, and so is a recorded result.
- Packets are built only from facts the database holds:
  - company;
  - evidence revision and sources;
  - uncertainties;
  - the draft's revision and hash.

  A missing fact refuses the packet; it is never invented.

**Idempotent enqueue**
- The same packet for the same company and kind is one job. Re-queuing says "already queued".

**Leases**
- `prep_claim(worker, lease, job?)` takes a lease.
- `prep_heartbeat` extends it and records progress.
- Only the current holder can heartbeat, complete or fail a job.

**Restart recovery**
- An expired lease can be reclaimed. The old holder's late result is refused (`lost_lease`).
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
- The service role can insert and read jobs, but can't update or delete them directly.
- `anon` and `authenticated` get nothing.

**Scope**
- The queue never writes drafts, reviews, approvals or contact events.

## Running a job by hand (the file hand-off)

1. On `/dashboard/owner#prep`, use **Queue a preparation job**. Enter the pilot ID, the kind, and the draft ID for review and preview jobs.
2. Press **Hand off to me (24 h)**. This claims the job as `handoff:owner` with a 24-hour lease.
3. Press **Download packet** to get the exact stored text. The `X-Packet-SHA256` header carries the database's hash.
   - Give the packet to the private engine, or work it yourself.
   - The packet carries its task, the evidence references and the constraints: not sendable, no contact, no spending, no publishing.
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

- It would call `prep_claim` / `prep_heartbeat` / `prep_complete` / `prep_fail` with the service role and its own worker name, and the default 10-minute lease.
- This is not built or scheduled. Josh has to approve it, as it would be a background job.
- Whatever runs it, the database rules above still hold. It can't mark a job done without a lease, revive a stale job, or touch approvals or sending.

## Tests

- `tests/prep-queue-migration.test.ts` runs PGlite on the real draft SQL. It covers:
  - database-computed hashes;
  - idempotent enqueue;
  - leases and the holder-only rule;
  - expired-lease recovery;
  - backoff and attempt limits;
  - pause/resume;
  - staleness on an evidence change;
  - permissions.
- `tests/prep-queue.test.ts` covers:
  - deterministic packets that won't invent facts;
  - result validation;
  - owner gating for every action and the packet route;
  - outcome reporting.
- On the local stack:
  - `flow.spec.ts` queues a job, hands it off, checks the downloaded packet's hash against the database, rejects a wrong-packet result and records the right one. Members get a 404 on the packet.
  - `lifecycle.sh` hands a job off before a server restart and records its result after it, once.
