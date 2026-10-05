// The preparation queue draft migration on a real Postgres (PGlite): leases,
// restart recovery, bounded retries with backoff, pause/resume, evidence
// invalidation, idempotent enqueue and results, and database-computed hashes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const PILOT_SQL = readFileSync("supabase/migrations/_drafts/digital_services_pilot.sql", "utf8");
const QUEUE_SQL = readFileSync("supabase/migrations/_drafts/digital_services_prep_queue.sql", "utf8");
const OWNER = "33333333-3333-4333-8333-333333333333";
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

async function db() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role;`);
  await pg.query(`select set_config('app.ds_owner_user_id', $1, false)`, [OWNER]);
  await pg.exec(PILOT_SQL);
  await pg.exec(QUEUE_SQL);
  await pg.exec(QUEUE_SQL); // idempotent DDL
  await pg.exec(`insert into digital_services_pilot (id, company, lane) values ('OC-901', 'Fixture Cleaners', 'email'), ('OC-902', 'Other Fixture', 'email')`);
  const enqueue = async (packet = '{"contract_id":"oc-prep-packet/0.1","n":1}', kind = "copy_draft", company = "OC-901", max = 3) => {
    await pg.exec(`set role service_role`);
    try {
      return (
        await pg.query<{ id: string; packet_sha256: string; evidence_revision: number; status: string }>(
          `insert into digital_services_prep_jobs (company_id, kind, packet_text, packet_sha256, evidence_revision, created_by, max_attempts, status)
           values ($1, $2, $3, 'forged', 99, 'owner', $4, 'succeeded') returning id, packet_sha256, evidence_revision, status`,
          [company, kind, packet, max]
        )
      ).rows[0];
    } finally {
      await pg.exec(`reset role`);
    }
  };
  const call = async <T,>(sql: string, params: unknown[] = []) => {
    await pg.exec(`set role service_role`);
    try {
      return (await pg.query<T>(sql, params)).rows;
    } finally {
      await pg.exec(`reset role`);
    }
  };
  const claim = (worker = "engine-1", job: string | null = null, lease = 600) =>
    call<{ id: string; attempts: number; status: string; lease_owner: string }>(`select * from prep_claim($1, $2, $3)`, [worker, lease, job]).then((r) => r[0] ?? null);
  const complete = (job: string, worker: string, result: string) => call<{ r: string }>(`select prep_complete($1, $2, $3) as r`, [job, worker, result]).then((r) => r[0].r);
  const fail = (job: string, worker: string, err = "boom") => call<{ r: string }>(`select prep_fail($1, $2, $3) as r`, [job, worker, err]).then((r) => r[0].r);
  const control = (job: string, action: string) => call<{ r: string }>(`select prep_control($1, $2, 'owner') as r`, [job, action]).then((r) => r[0].r);
  const job = async (id: string) =>
    (await pg.query<Record<string, unknown>>(`select status, attempts, lease_owner, last_error, result_sha256, next_attempt_at > now() as backing_off, progress from digital_services_prep_jobs where id = $1`, [id])).rows[0];
  const expireLease = (id: string) => pg.query(`update digital_services_prep_jobs set lease_expires_at = now() - interval '1 second' where id = $1`, [id]);
  const due = (id: string) => pg.query(`update digital_services_prep_jobs set next_attempt_at = now() - interval '1 second' where id = $1`, [id]);
  return { pg, enqueue, call, claim, complete, fail, control, job, expireLease, due };
}

describe("preparation queue (draft migration)", { timeout: 60_000 }, () => {
  it("computes the packet hash and evidence revision itself, forces a fresh queued state, and enqueue is idempotent", async () => {
    const { pg, enqueue } = await db();
    const packet = '{"contract_id":"oc-prep-packet/0.1","n":1}';
    const j = await enqueue(packet);
    expect(j).toEqual({ id: expect.any(String), packet_sha256: sha(packet), evidence_revision: 0, status: "queued" });
    await expect(enqueue(packet)).rejects.toThrow(/duplicate|unique/i);
    await enqueue(packet, "copy_review"); // another kind is another job
    await expect(pg.query(`update digital_services_prep_jobs set packet_text = '{}' where id = $1`, [j.id])).rejects.toMatchObject({ code: "OC409" });
  });

  it("leases one job to one worker; only the holder heartbeats, completes or fails", async () => {
    const { enqueue, call, claim, complete, fail, job } = await db();
    const j = await enqueue();
    const c = await claim("engine-1");
    expect(c).toMatchObject({ id: j.id, attempts: 1, status: "leased", lease_owner: "engine-1" });
    expect(await claim("engine-2")).toBeNull(); // nothing else ready
    expect((await call<{ ok: boolean }>(`select prep_heartbeat($1, 'engine-2', '{"step":"x"}') as ok`, [j.id]))[0].ok).toBe(false);
    expect((await call<{ ok: boolean }>(`select prep_heartbeat($1, 'engine-1', '{"step":"copy","done":2,"total":5}') as ok`, [j.id]))[0].ok).toBe(true);
    expect((await job(j.id)).progress).toEqual({ step: "copy", done: 2, total: 5 });
    expect(await complete(j.id, "engine-2", "{}")).toBe("lost_lease");
    expect(await fail(j.id, "engine-2")).toBe("lost_lease");
    expect(await complete(j.id, "engine-1", '{"ok":true}')).toBe("succeeded");
    expect(await job(j.id)).toMatchObject({ status: "succeeded", result_sha256: sha('{"ok":true}'), lease_owner: null });
    // The same result again is idempotent; a different one is refused.
    expect(await complete(j.id, "engine-1", '{"ok":true}')).toBe("already");
    expect(await complete(j.id, "anyone", '{"ok":false}')).toBe("conflict");
  });

  it("restart recovery: an expired lease is reclaimed by another worker, and the old holder can't finish", async () => {
    const { enqueue, call, claim, complete, expireLease } = await db();
    const j = await enqueue();
    await claim("engine-1");
    await expireLease(j.id);
    expect((await call<{ ok: boolean }>(`select prep_heartbeat($1, 'engine-1') as ok`, [j.id]))[0].ok).toBe(false);
    expect(await claim("engine-2")).toMatchObject({ id: j.id, attempts: 2, lease_owner: "engine-2" });
    expect(await complete(j.id, "engine-1", "{}")).toBe("lost_lease");
    expect(await complete(j.id, "engine-2", "{}")).toBe("succeeded");
  });

  it("bounded retries with backoff; a job out of attempts fails, and a lease that keeps expiring can't loop forever", async () => {
    const { enqueue, claim, fail, job, due, expireLease, control } = await db();
    const j = await enqueue(undefined, undefined, undefined, 2);
    await claim();
    expect(await fail(j.id, "engine-1", "timeout talking to the engine")).toBe("retrying");
    expect(await job(j.id)).toMatchObject({ status: "queued", backing_off: true, last_error: "timeout talking to the engine" });
    expect(await claim()).toBeNull(); // still backing off
    await due(j.id);
    expect(await claim()).toMatchObject({ attempts: 2 });
    expect(await fail(j.id, "engine-1")).toBe("failed");
    expect((await job(j.id)).status).toBe("failed");
    // Owner retry gives a failed job a fresh set of attempts.
    expect(await control(j.id, "retry")).toBe("done");
    expect(await claim()).toMatchObject({ attempts: 1 });
    await expireLease(j.id);
    expect(await claim()).toMatchObject({ attempts: 2 });
    await expireLease(j.id);
    expect(await claim()).toBeNull(); // out of attempts: failed, not leased a third time
    expect((await job(j.id)).status).toBe("failed");
  });

  it("pause and resume: the whole queue and single jobs", async () => {
    const { enqueue, call, claim, control, job } = await db();
    const a = await enqueue('{"n":"a"}');
    const b = await enqueue('{"n":"b"}');
    await call(`select prep_set_paused(true, 'owner')`);
    expect(await claim()).toBeNull();
    await call(`select prep_set_paused(false, 'owner')`);
    expect(await control(a.id, "pause")).toBe("done");
    expect((await claim())?.id).toBe(b.id);
    expect(await claim()).toBeNull(); // a is paused
    expect(await control(a.id, "resume")).toBe("done");
    expect((await claim())?.id).toBe(a.id);
    expect(await control(a.id, "pause")).toBe("not_allowed"); // leased: let it finish or cancel it
    expect(await control(a.id, "cancel")).toBe("done");
    expect((await job(a.id)).status).toBe("cancelled");
  });

  it("changed evidence makes a job stale: it isn't claimed, and a running one can't complete", async () => {
    const { pg, enqueue, claim, complete, job, control } = await db();
    const a = await enqueue('{"n":"a"}');
    const b = await enqueue('{"n":"b"}');
    await claim("engine-1", b.id);
    await pg.exec(`insert into digital_services_pilot_evidence (company_id, source_url, source_type, checked_at, fact_text, recorded_by) values ('OC-901', 'https://fixture.example/', 'primary_business_website', now(), 'Fixture', 'test')`);
    expect(await claim()).toBeNull();
    expect((await job(a.id)).status).toBe("stale");
    expect(await complete(b.id, "engine-1", "{}")).toBe("stale");
    expect((await job(b.id)).status).toBe("stale");
    expect(await control(a.id, "retry")).toBe("not_allowed");
  });

  it("the service role can only enqueue and read; anon and authenticated get nothing", async () => {
    const { pg, enqueue } = await db();
    const j = await enqueue();
    await pg.exec(`set role service_role`);
    await expect(pg.query(`update digital_services_prep_jobs set status = 'succeeded' where id = $1`, [j.id])).rejects.toThrow(/permission denied/i);
    await expect(pg.query(`update digital_services_prep_settings set paused = true`)).rejects.toThrow(/permission denied/i);
    await expect(pg.query(`delete from digital_services_prep_jobs`)).rejects.toThrow(/permission denied/i);
    await pg.exec(`reset role`);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await expect(pg.query(`select * from digital_services_prep_jobs`)).rejects.toThrow(/permission denied/i);
      await expect(pg.query(`select prep_claim('x')`)).rejects.toThrow(/permission denied/i);
      await pg.exec(`reset role`);
    }
  });

  it("a draft from another company can't be attached", async () => {
    const { pg, enqueue } = await db();
    const d = (await pg.query<{ id: string }>(`insert into digital_services_pilot_drafts (company_id, revision, subject, body, sha256, author) values ('OC-902', 1, 'S', 'B', 'x', 't') returning id`)).rows[0];
    await pg.exec(`set role service_role`);
    await expect(
      pg.query(`insert into digital_services_prep_jobs (company_id, kind, draft_id, packet_text, packet_sha256, evidence_revision, created_by) values ('OC-901', 'copy_review', $1, '{}', 'x', 0, 'owner')`, [d.id])
    ).rejects.toThrow(/another company/);
    await pg.exec(`reset role`);
    await enqueue('{"other":true}', "copy_review", "OC-902");
  });
});
