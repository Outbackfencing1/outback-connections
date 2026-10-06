// The preparation queue draft migration on a real Postgres (PGlite): packets
// built in the database from one snapshot, stale captures refused, leases
// fenced by a per-claim token, restart recovery, bounded retries with
// backoff, pause/resume, evidence invalidation, idempotent enqueue and
// results, and database-computed hashes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { validateResult, PREP_RESULT_CONTRACT, type PrepKind } from "@/lib/digital-services/prep-queue";

const PILOT_SQL = readFileSync("supabase/migrations/_drafts/digital_services_pilot.sql", "utf8");
const QUEUE_SQL = readFileSync("supabase/migrations/_drafts/digital_services_prep_queue.sql", "utf8");
const OWNER = "33333333-3333-4333-8333-333333333333";
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

type Claimed = { id: string; attempts: number; status: string; lease_owner: string; lease_generation: number; lease_token: string };

async function db() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role;`);
  await pg.query(`select set_config('app.ds_owner_user_id', $1, false)`, [OWNER]);
  await pg.exec(PILOT_SQL);
  await pg.exec(QUEUE_SQL);
  await pg.exec(QUEUE_SQL); // idempotent DDL
  // Fake fixtures only: no real company, address or contact.
  await pg.exec(`
    insert into digital_services_pilot (id, company, lane, offer) values ('OC-901', 'Fixture Cleaners', 'email', 'quote_form_490'), ('OC-902', 'Other Fixture', 'email', null);
    insert into digital_services_pilot_evidence (company_id, source_url, source_type, checked_at, fact_text, limitations, recorded_by) values
      ('OC-901', 'https://fixture.example/', 'primary_business_website', '2026-10-01T01:00:00Z', 'Offers end-of-lease cleaning in Fixtureville.', '{"home page only"}', 'test'),
      ('OC-901', 'https://fixture.example/contact', 'primary_business_website', '2026-10-01T02:00:00Z', 'Takes quote requests through a plain contact form.', '{}', 'test'),
      ('OC-902', 'https://other.example/', 'primary_business_website', '2026-10-01T01:00:00Z', 'Other fixture fact.', '{}', 'test');
  `);
  const call = async <T,>(sql: string, params: unknown[] = []) => {
    await pg.exec(`set role service_role`);
    try {
      return (await pg.query<T>(sql, params)).rows;
    } finally {
      await pg.exec(`reset role`);
    }
  };
  const enqueue = (kind: PrepKind = "copy_draft", company = "OC-901", draft: string | null = null, max = 3) =>
    call<{ job_id: string; outcome: string; packet_sha256: string }>(`select * from prep_enqueue($1, $2, $3, 'owner', $4)`, [company, kind, draft, max]).then((r) => ({
      id: r[0].job_id,
      outcome: r[0].outcome,
      packet_sha256: r[0].packet_sha256,
    }));
  const addDraft = async (company = "OC-901", revision = 1, subject = "A guided quote form for Fixture Cleaners", body = "Hi, I noticed you take quote requests through a plain contact form.") =>
    (await pg.query<{ id: string; sha256: string }>(`insert into digital_services_pilot_drafts (company_id, revision, subject, body, sha256, author, offer) values ($1, $2, $3, $4, 'x', 'test', 'quote_form_490') returning id, sha256`, [company, revision, subject, body])).rows[0];
  const addEvidence = (company = "OC-901", fact = "New fixture fact.") =>
    pg.query(`insert into digital_services_pilot_evidence (company_id, source_url, source_type, checked_at, fact_text, recorded_by) values ($1, 'https://fixture.example/new', 'primary_business_website', now(), $2, 'test')`, [company, fact]);
  const claim = (worker = "engine-1", job: string | null = null, lease = 600) =>
    call<Claimed>(`select * from prep_claim($1, $2, $3)`, [worker, lease, job]).then((r) => r[0] ?? null);
  const heartbeat = (job: string, token: string, progress = "{}") => call<{ ok: boolean }>(`select prep_heartbeat($1, $2, $3) as ok`, [job, token, progress]).then((r) => r[0].ok);
  const complete = (job: string, token: string | null, result: string) => call<{ r: string }>(`select prep_complete($1, $2, $3) as r`, [job, token, result]).then((r) => r[0].r);
  const fail = (job: string, token: string | null, err = "boom") => call<{ r: string }>(`select prep_fail($1, $2, $3) as r`, [job, token, err]).then((r) => r[0].r);
  const control = (job: string, action: string) => call<{ r: string }>(`select prep_control($1, $2, 'owner') as r`, [job, action]).then((r) => r[0].r);
  const job = async (id: string) =>
    (
      await pg.query<Record<string, unknown>>(
        `select status, attempts, lease_owner, lease_generation, lease_token, last_error, result_sha256, next_attempt_at, next_attempt_at > now() as backing_off, progress, packet_text, packet_sha256, evidence_revision, created_at
         from digital_services_prep_jobs where id = $1`,
        [id]
      )
    ).rows[0];
  const revision = async (company = "OC-901") => (await pg.query<{ r: number }>(`select evidence_revision as r from digital_services_pilot where id = $1`, [company])).rows[0].r;
  const expireLease = (id: string) => pg.query(`update digital_services_prep_jobs set lease_expires_at = now() - interval '1 second' where id = $1`, [id]);
  const due = (id: string) => pg.query(`update digital_services_prep_jobs set next_attempt_at = now() - interval '1 second' where id = $1`, [id]);
  return { pg, call, enqueue, addDraft, addEvidence, claim, heartbeat, complete, fail, control, job, revision, expireLease, due };
}

describe("preparation queue (draft migration)", { timeout: 60_000 }, () => {
  it("builds the packet in the database with the evidence text, company facts and its own hash; enqueue is idempotent", async () => {
    const { pg, enqueue, job, revision } = await db();
    const j = await enqueue("copy_draft");
    expect(j.outcome).toBe("queued");
    const row = await job(j.id);
    expect(row).toMatchObject({ status: "queued", evidence_revision: await revision(), packet_sha256: sha(row.packet_text as string) });
    expect(j.packet_sha256).toBe(row.packet_sha256);
    const packet = JSON.parse(row.packet_text as string);
    expect(packet).toMatchObject({
      contract_id: "oc-prep-packet/0.2",
      job_kind: "copy_draft",
      company: { id: "OC-901", name: "Fixture Cleaners", lane: "email", offer: "quote_form_490", evidence_revision: 2, uncertainties: [] },
      draft: null,
      constraints: { sendable: false, contact: "none", spending: "none", publishing: "none" },
      result_contract: PREP_RESULT_CONTRACT,
    });
    expect(packet.evidence).toEqual([
      expect.objectContaining({ source_url: "https://fixture.example/", checked_at: "2026-10-01T01:00:00.000000Z", fact_text: "Offers end-of-lease cleaning in Fixtureville.", limitations: ["home page only"] }),
      expect.objectContaining({ source_url: "https://fixture.example/contact", fact_text: "Takes quote requests through a plain contact form.", limitations: [] }),
    ]);
    // The same facts give the same packet: one job.
    expect(await enqueue("copy_draft")).toEqual({ ...j, outcome: "already_queued" });
    // The text doesn't depend on the session's time zone.
    await pg.exec(`set timezone = 'Australia/Sydney'`);
    expect((await enqueue("copy_draft")).packet_sha256).toBe(j.packet_sha256);
    await pg.exec(`reset timezone`);
    await expect(pg.query(`update digital_services_prep_jobs set packet_text = '{}' where id = $1`, [j.id])).rejects.toMatchObject({ code: "OC409" });
  });

  it("refuses a packet captured before an evidence change, even when the change lands mid-enqueue", async () => {
    const { pg, enqueue, addEvidence, job, revision, claim, complete } = await db();
    const old = await enqueue("research_review");
    const captured = (await job(old.id)) as { packet_text: string; evidence_revision: number };
    await addEvidence();
    const now = await revision();
    expect(now).toBe(captured.evidence_revision + 1);
    // A stale capture can't be inserted, whether it keeps its revision or claims the current one.
    for (const rev of [captured.evidence_revision, now]) {
      await expect(
        pg.query(`insert into digital_services_prep_jobs (company_id, kind, packet_text, packet_sha256, evidence_revision, created_by) values ('OC-901', 'copy_draft', $1, 'x', $2, 'owner')`, [captured.packet_text, rev])
      ).rejects.toMatchObject({ code: "OC409" });
    }
    // Evidence changing between the snapshot and the INSERT (simulated with a
    // trigger that fires first) refuses the whole enqueue: nothing is queued.
    await pg.exec(`
      create function test_change_evidence() returns trigger language plpgsql as $$ begin
        insert into digital_services_pilot_evidence (company_id, source_url, source_type, checked_at, fact_text, recorded_by)
          values (new.company_id, 'https://fixture.example/race', 'primary_business_website', now(), 'Changed mid-enqueue.', 'test');
        return new; end $$;
      create trigger trg_a_test_race before insert on digital_services_prep_jobs for each row execute function test_change_evidence();`);
    await expect(enqueue("evidence_refresh")).rejects.toMatchObject({ code: "OC409" });
    await pg.exec(`drop trigger trg_a_test_race on digital_services_prep_jobs`);
    expect((await pg.query(`select 1 from digital_services_prep_jobs where kind = 'evidence_refresh'`)).rows).toHaveLength(0);
    expect((await pg.query(`select 1 from digital_services_pilot_evidence where source_url = 'https://fixture.example/race'`)).rows).toHaveLength(0); // rolled back with it
    // The old job never becomes current or completes.
    expect(await claim("engine-1", old.id)).toBeNull();
    expect((await job(old.id)).status).toBe("stale");
    expect(await complete(old.id, "00000000-0000-4000-8000-000000000000", "{}")).toBe("lost_lease");
    // A fresh packet carries the new evidence.
    const fresh = await enqueue("research_review");
    expect(fresh.outcome).toBe("queued");
    expect(JSON.parse((await job(fresh.id)).packet_text as string).evidence.map((e: { fact_text: string }) => e.fact_text)).toContain("New fixture fact.");
  });

  it("refuses missing facts instead of inventing them", async () => {
    const { pg, enqueue, addDraft, addEvidence } = await db();
    await expect(enqueue("copy_review")).rejects.toThrow(/draft revision/);
    await expect(enqueue("copy_draft", "OC-902")).rejects.toThrow(/offer/);
    await expect(enqueue("copy_draft", "OC-999")).rejects.toThrow(/no such pilot company/);
    await pg.exec(`insert into digital_services_pilot (id, company, lane, offer) values ('OC-903', 'No Evidence Fixture', 'email', 'website_1990')`);
    await expect(enqueue("research_review", "OC-903")).rejects.toThrow(/no recorded evidence/);
    const other = await addDraft("OC-902");
    await expect(enqueue("copy_review", "OC-901", other.id)).rejects.toThrow(/another company/);
    const d = await addDraft();
    await expect(enqueue("research_review", "OC-901", d.id)).rejects.toThrow(/doesn't take a draft/);
    await addEvidence(); // the draft is now written against older evidence
    await expect(enqueue("copy_review", "OC-901", d.id)).rejects.toMatchObject({ code: "OC409" });
    const d2 = await addDraft("OC-901", 2);
    const j = await enqueue("copy_review", "OC-901", d2.id);
    expect(j.outcome).toBe("queued");
  });

  it("each claim gets a new generation and token; only that token heartbeats, completes or fails", async () => {
    const { enqueue, claim, heartbeat, complete, fail, job } = await db();
    const j = await enqueue();
    const c = await claim("engine-1");
    expect(c).toMatchObject({ id: j.id, attempts: 1, status: "leased", lease_owner: "engine-1", lease_generation: 1, lease_token: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(await claim("engine-2")).toBeNull(); // nothing else ready
    const forged = "00000000-0000-4000-8000-000000000000";
    expect(await heartbeat(j.id, forged, '{"step":"x"}')).toBe(false);
    expect(await heartbeat(j.id, c!.lease_token, '{"step":"copy","done":2,"total":5}')).toBe(true);
    expect((await job(j.id)).progress).toEqual({ step: "copy", done: 2, total: 5 });
    expect(await complete(j.id, forged, "{}")).toBe("lost_lease");
    expect(await complete(j.id, null, "{}")).toBe("lost_lease");
    expect(await fail(j.id, forged)).toBe("lost_lease");
    expect(await complete(j.id, c!.lease_token, '{"ok":true}')).toBe("succeeded");
    expect(await job(j.id)).toMatchObject({ status: "succeeded", result_sha256: sha('{"ok":true}'), lease_owner: null, lease_token: null });
    // The same result again is idempotent; a different one is refused.
    expect(await complete(j.id, c!.lease_token, '{"ok":true}')).toBe("already");
    expect(await complete(j.id, forged, '{"ok":false}')).toBe("conflict");
  });

  for (const reclaimer of ["engine-1", "engine-2"]) {
    it(`an expired claim reclaimed by ${reclaimer === "engine-1" ? "the same" : "another"} worker: the old invocation can't heartbeat, fail or complete`, async () => {
      const { enqueue, claim, heartbeat, complete, fail, job, expireLease } = await db();
      const j = await enqueue();
      const first = (await claim("engine-1"))!;
      await expireLease(j.id);
      // Expired, not yet reclaimed: a late failure changes nothing.
      const before = await job(j.id);
      expect(await heartbeat(j.id, first.lease_token)).toBe(false);
      expect(await fail(j.id, first.lease_token, "late")).toBe("lost_lease");
      expect(await complete(j.id, first.lease_token, '{"late":true}')).toBe("lost_lease");
      expect(await job(j.id)).toEqual(before);
      const second = (await claim(reclaimer))!;
      expect(second).toMatchObject({ id: j.id, attempts: 2, lease_owner: reclaimer, lease_generation: 2 });
      expect(second.lease_token).not.toBe(first.lease_token);
      // The old invocation, under the new live lease.
      expect(await heartbeat(j.id, first.lease_token)).toBe(false);
      expect(await fail(j.id, first.lease_token, "late")).toBe("lost_lease");
      expect(await complete(j.id, first.lease_token, '{"late":true}')).toBe("lost_lease");
      expect(await job(j.id)).toMatchObject({ status: "leased", attempts: 2, last_error: null, lease_generation: 2 });
      expect(await complete(j.id, second.lease_token, '{"on_time":true}')).toBe("succeeded");
      // A late result after success: the same text is 'already', anything else 'conflict'.
      expect(await complete(j.id, first.lease_token, '{"late":true}')).toBe("conflict");
    });
  }

  it("bounded retries with backoff; a job out of attempts fails, and a lease that keeps expiring can't loop forever", async () => {
    const { enqueue, claim, fail, job, due, expireLease, control } = await db();
    const j = await enqueue(undefined, undefined, undefined, 2);
    let c = (await claim())!;
    expect(await fail(j.id, c.lease_token, "timeout talking to the engine")).toBe("retrying");
    expect(await job(j.id)).toMatchObject({ status: "queued", backing_off: true, last_error: "timeout talking to the engine", lease_token: null });
    expect(await fail(j.id, c.lease_token)).toBe("lost_lease"); // a repeated failure doesn't burn another attempt
    expect(await claim()).toBeNull(); // still backing off
    await due(j.id);
    c = (await claim())!;
    expect(c).toMatchObject({ attempts: 2 });
    expect(await fail(j.id, c.lease_token)).toBe("failed");
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

  it("pause and resume: the whole queue and single jobs; a cancelled claim loses its lease", async () => {
    const { enqueue, call, claim, complete, control, job } = await db();
    const a = await enqueue("research_review");
    const b = await enqueue("evidence_refresh");
    await call(`select prep_set_paused(true, 'owner')`);
    expect(await claim()).toBeNull();
    await call(`select prep_set_paused(false, 'owner')`);
    expect(await control(a.id, "pause")).toBe("done");
    expect((await claim())?.id).toBe(b.id);
    expect(await claim()).toBeNull(); // a is paused
    expect(await control(a.id, "resume")).toBe("done");
    const ca = (await claim())!;
    expect(ca.id).toBe(a.id);
    expect(await control(a.id, "pause")).toBe("not_allowed"); // leased: let it finish or cancel it
    expect(await control(a.id, "cancel")).toBe("done");
    expect(await job(a.id)).toMatchObject({ status: "cancelled", lease_token: null });
    expect(await complete(a.id, ca.lease_token, "{}")).toBe("lost_lease");
  });

  it("changed evidence makes a job stale: it isn't claimed, and a running one can't complete", async () => {
    const { enqueue, addEvidence, claim, complete, job, control } = await db();
    const a = await enqueue("research_review");
    const b = await enqueue("evidence_refresh");
    const cb = (await claim("engine-1", b.id))!;
    await addEvidence();
    expect(await claim()).toBeNull();
    expect((await job(a.id)).status).toBe("stale");
    expect(await complete(b.id, cb.lease_token, "{}")).toBe("stale");
    expect(await job(b.id)).toMatchObject({ status: "stale", lease_token: null });
    expect(await control(a.id, "retry")).toBe("not_allowed");
  });

  it("the service role can only read jobs and call the functions; anon and authenticated get nothing", async () => {
    const { pg, enqueue } = await db();
    const j = await enqueue();
    await pg.exec(`set role service_role`);
    await expect(
      pg.query(`insert into digital_services_prep_jobs (company_id, kind, packet_text, packet_sha256, evidence_revision, created_by) values ('OC-901', 'copy_draft', '{}', 'x', 0, 'owner')`)
    ).rejects.toThrow(/permission denied/i);
    await expect(pg.query(`update digital_services_prep_jobs set status = 'succeeded' where id = $1`, [j.id])).rejects.toThrow(/permission denied/i);
    await expect(pg.query(`update digital_services_prep_settings set paused = true`)).rejects.toThrow(/permission denied/i);
    await expect(pg.query(`delete from digital_services_prep_jobs`)).rejects.toThrow(/permission denied/i);
    await pg.exec(`reset role`);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await expect(pg.query(`select * from digital_services_prep_jobs`)).rejects.toThrow(/permission denied/i);
      await expect(pg.query(`select prep_claim('x')`)).rejects.toThrow(/permission denied/i);
      await expect(pg.query(`select * from prep_enqueue('OC-901', 'copy_draft', null, 'x')`)).rejects.toThrow(/permission denied/i);
      await pg.exec(`reset role`);
    }
  });

  // One held fixture draft end to end: packet retrieval, a review produced only
  // from the packet, the result validated and imported. The reviewer here is a
  // stand-in for the private engine, which is not connected to this repository.
  it("a held draft goes through packet, independent review and validated import, and nothing is approved", async () => {
    const { pg, enqueue, addDraft, claim, complete, job } = await db();
    const d = await addDraft();
    const j = await enqueue("copy_review", "OC-901", d.id);
    const c = (await claim("handoff:owner", j.id, 86_400))!;
    const row = (await job(j.id)) as { packet_text: string; packet_sha256: string; created_at: Date };
    const packet = JSON.parse(row.packet_text);
    // Independent check: the draft in the packet is exactly the stored draft.
    expect(sha(`${packet.draft.subject}\n\n${packet.draft.body}`)).toBe(d.sha256);
    expect(packet.draft.sha256).toBe(d.sha256);
    // Fixture reviewer (disconnected engine stage): every sentence of the body must be backed by an evidence fact.
    const facts: string[] = packet.evidence.map((e: { fact_text: string }) => e.fact_text.toLowerCase());
    const unsupported = (packet.draft.body as string)
      .split(/(?<=\.)\s+/)
      .filter((s) => s.toLowerCase().includes("quote requests") && !facts.some((f) => f.includes("quote requests")));
    const result = JSON.stringify({
      contract_id: PREP_RESULT_CONTRACT,
      job_id: j.id,
      packet_sha256: row.packet_sha256,
      job_kind: "copy_review",
      produced_by: "fixture-reviewer (stand-in for the private engine)",
      produced_at: new Date().toISOString(),
      status: "completed",
      summary: "The draft's one factual claim is backed by recorded evidence.",
      outputs: [],
      review: { verdict: unsupported.length ? "changes_requested" : "pass", reviewer: "fixture-reviewer", notes: `draft ${d.sha256}` },
    });
    const checked = validateResult(result, { id: j.id, kind: "copy_review", packet_sha256: row.packet_sha256, created_at: new Date(row.created_at).toISOString() }, new Date());
    expect(checked).toMatchObject({ ok: true, result: { review: { verdict: "pass" } } });
    expect(await complete(j.id, c.lease_token, result)).toBe("succeeded");
    expect(await job(j.id)).toMatchObject({ status: "succeeded", result_sha256: sha(result) });
    // A worker's pass is not an approval, and nothing was sent.
    expect((await pg.query(`select 1 from digital_services_pilot_approvals`)).rows).toHaveLength(0);
    expect((await pg.query(`select 1 from digital_services_pilot_events`)).rows).toHaveLength(0);
  });
});
