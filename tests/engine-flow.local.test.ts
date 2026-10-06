// One synthetic customer, end to end, on a real Postgres (PGlite, persisted to
// a temporary directory so a restart can be shown), with the private engine's
// own contract validators and synthetic examples. Runs only on a machine that
// has the private engine checkout: OC_ENGINE_DIR=<checkout> (and NODE_PATH
// pointing at this repo's node_modules so the engine's validators find ajv).
// Nothing from the engine is copied into this repository; CI skips this file.
// Nothing is sent, published or charged: the notification failure, the
// payment and the delivery are database records of synthetic events.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { checkCreatorOutput, checkReplyOutput, checkReviewOutput, type EngineContracts } from "@/lib/digital-services/engine-bridge";

const ENGINE = process.env.OC_ENGINE_DIR;
const SQL = ["digital_services_enquiries", "digital_services_pilot", "digital_services_sales"].map((f) => readFileSync(`supabase/migrations/_drafts/${f}.sql`, "utf8"));
const OWNER = "33333333-3333-4333-8333-333333333333";
const KEY = "0f8fad5b-d9cb-469f-a165-70867728950e";

async function open(dir: string, first: boolean) {
  const pg = new PGlite(dir);
  if (first) {
    await pg.exec(`create role anon; create role authenticated; create role service_role;`);
    await pg.query(`select set_config('app.ds_owner_user_id', $1, false)`, [OWNER]);
    for (const s of SQL) await pg.exec(s);
  }
  const svc = async <T,>(sql: string, params: unknown[] = []) => {
    await pg.exec(`set role service_role`);
    try {
      return (await pg.query<T>(sql, params)).rows;
    } finally {
      await pg.exec(`reset role`);
    }
  };
  return { pg, svc };
}

describe.skipIf(!ENGINE)("synthetic customer through the engine contracts (local only)", { timeout: 120_000 }, () => {
  it("enquiry → owner queue → failed alert receipt → held draft and review → quote, payment, delivery", async () => {
    const engine = (await import(/* @vite-ignore */ join(ENGINE!, "app/src/contracts.ts"))) as EngineContracts;
    const ex = (name: string) => readFileSync(join(ENGINE!, "examples", `${name}.json`), "utf8");
    const log: Record<string, unknown> = {};
    const dir = mkdtempSync(join(tmpdir(), "oc-engine-flow-"));

    // 1. The public form saves the enquiry; a retried submit is the same row.
    let { pg, svc } = await open(dir, true);
    const insert = () =>
      svc<{ id: string }>(
        `insert into digital_services_enquiries (idempotency_key, business_name, contact_name, email, interest, message, is_test)
         values ($1, 'Synthetic Sparkle Cleaning', 'Sam Fixture', 'sam@synthetic.example', 'website', 'Synthetic enquiry: a five page site please.', true)
         on conflict (idempotency_key) do nothing returning id`,
        [KEY]
      );
    const [enquiry] = await insert();
    expect(await insert()).toEqual([]);
    // 2. The owner alert failed: the receipt is kept and the lead is not lost.
    await svc(`update digital_services_enquiries set notify_error = 'synthetic: mail provider unreachable' where id = $1`, [enquiry.id]);
    await svc(`update digital_services_enquiries set status = 'qualified' where id = $1`, [enquiry.id]);
    log.enquiry = { id: enquiry.id, idempotency_key: KEY, repeated_submit: "same row" };

    // 3. Restart: everything above is still there.
    await pg.close();
    ({ pg, svc } = await open(dir, false));
    const [kept] = await svc<{ status: string; notified_at: string | null; notify_error: string }>(`select status, notified_at, notify_error from digital_services_enquiries where idempotency_key = $1`, [KEY]);
    expect(kept).toEqual({ status: "qualified", notified_at: null, notify_error: "synthetic: mail provider unreachable" });
    log.after_restart = kept;

    // 4. Creator output, checked by the engine's own validator, becomes a held draft revision.
    await pg.exec(`insert into digital_services_pilot (id, company, lane) values ('OC-950', 'Synthetic Sparkle Cleaning', 'email')`);
    const created = checkCreatorOutput(engine, JSON.parse(ex("creator-job")), ex("creator-output"));
    expect(created.state).toBe("held_for_owner");
    if (created.state !== "held_for_owner") return;
    const importDraft = async (subject: string, body: string, revision: number) => {
      const existing = await pg.query<{ id: string }>(`select id from digital_services_pilot_drafts where company_id = 'OC-950' and subject = $1 and body = $2`, [subject, body]);
      if (existing.rows.length) return { id: existing.rows[0].id, outcome: "already_imported" };
      const r = await pg.query<{ id: string; sha256: string }>(
        `insert into digital_services_pilot_drafts (company_id, revision, subject, body, offer, author, change_reason) values ('OC-950', $1, $2, $3, 'website_1990', 'engine:creator', 'synthetic') returning id, sha256`,
        [revision, subject, body]
      );
      return { id: r.rows[0].id, sha256: r.rows[0].sha256, outcome: "imported" };
    };
    const d = created.value[0];
    const rev1 = await importDraft(d.subject, d.body, 1);
    expect(rev1.outcome).toBe("imported");
    expect((await importDraft(d.subject, d.body, 2)).outcome).toBe("already_imported"); // a repeated import adds nothing
    const approvals = await pg.query(`select 1 from digital_services_pilot_approvals`);
    expect(approvals.rows).toHaveLength(0); // held: nothing approved
    log.creator = { output_sha256: created.output_sha256, draft_id: rev1.id, draft_sha256: (rev1 as { sha256?: string }).sha256, approvals: 0 };

    // 5. The engine's review is advice on that revision; it holds (no real browser run happened).
    const rev1Sha = (await pg.query<{ sha256: string }>(`select sha256 from digital_services_pilot_drafts where id = $1`, [rev1.id])).rows[0].sha256;
    const review = checkReviewOutput(engine, JSON.parse(ex("review-job")), ex("review-output"), { reviewed_draft_sha256: rev1Sha, current_draft_sha256: rev1Sha });
    expect(review).toMatchObject({ state: "held_for_owner", value: { technical_verdict: "hold" } });
    // A tampered review fails the engine's binding checks.
    const tampered = JSON.parse(ex("review-output"));
    tampered.input_hash = "0".repeat(64);
    expect(checkReviewOutput(engine, JSON.parse(ex("review-job")), JSON.stringify(tampered), { reviewed_draft_sha256: rev1Sha, current_draft_sha256: rev1Sha }).state).toBe("rejected");
    // The owner edits the draft: the old review is stale.
    const rev2 = await importDraft(d.subject, `${d.body}\n\n(Revised.)`, 2);
    const rev2Sha = (await pg.query<{ sha256: string }>(`select sha256 from digital_services_pilot_drafts where id = $1`, [rev2.id])).rows[0].sha256;
    expect(checkReviewOutput(engine, JSON.parse(ex("review-job")), ex("review-output"), { reviewed_draft_sha256: rev1Sha, current_draft_sha256: rev2Sha }).state).toBe("stale");
    log.review = { verdict: review.state === "held_for_owner" ? review.value.technical_verdict : review.state, stale_after_revision_2: true, tampered: "rejected" };

    // 6. The engine's reply example is an opt-out: surfaced to the owner as suppression, never answered.
    const reply = checkReplyOutput(engine, JSON.parse(ex("reply-job")), ex("reply-output"));
    expect(reply).toMatchObject({ state: "held_for_owner", value: { intent: "unsubscribe", suppress_contact: true } });
    expect(checkReplyOutput(null, {}, ex("reply-output")).state).toBe("not_connected");
    log.reply = reply.state === "held_for_owner" ? reply.value : reply;

    // 7. Fake quote, payment evidence and delivery, gated by the database.
    const [quote] = await svc<{ id: string }>(
      `insert into digital_services_quotes (customer_label, enquiry_id, pilot_company_id, offer, amount_cents, deposit_cents, gst_treatment, terms_version, scope_summary)
       values ('Synthetic Sparkle Cleaning', $1, 'OC-950', 'website_1990', 199000, 99500, 'exclusive', 'draft-2026-10-04', 'Synthetic: up to five template pages') returning id`,
      [enquiry.id]
    );
    await svc(`update digital_services_quotes set status = 'sent', sent_at = now() where id = $1`, [quote.id]);
    await svc(`update digital_services_quotes set status = 'accepted', accepted_at = now() where id = $1`, [quote.id]);
    await expect(svc(`update digital_services_quotes set delivery_stage = 'in_production' where id = $1`, [quote.id])).rejects.toMatchObject({ code: "OC402" });
    await svc(`insert into digital_services_payments (quote_id, amount_cents, received_on, evidence_source, evidence_ref, recorded_by) values ($1, 109450, '2026-10-06', 'provider_record', 'SYNTH-0001', 'owner')`, [quote.id]);
    await expect(svc(`insert into digital_services_payments (quote_id, amount_cents, received_on, evidence_source, evidence_ref, recorded_by) values ($1, 109450, '2026-10-06', 'provider_record', ' synth-0001 ', 'owner')`, [quote.id])).rejects.toThrow(/duplicate/);
    await svc(`update digital_services_quotes set delivery_stage = 'in_production' where id = $1`, [quote.id]);
    await expect(svc(`update digital_services_quotes set delivery_stage = 'launched' where id = $1`, [quote.id])).rejects.toMatchObject({ code: "OC402" });
    const [balance] = await svc<Record<string, unknown>>(`select total_due_cents, paid_cents, outstanding_cents, deposit_received from digital_services_quote_balance where quote_id = $1`, [quote.id]);
    expect(balance).toEqual({ total_due_cents: 218900, paid_cents: 109450, outstanding_cents: 109450, deposit_received: true });
    log.sales = { quote_id: quote.id, status: "accepted", delivery_stage: "in_production", launch: "refused until balance evidenced", balance };

    await pg.close();
    console.log(`ENGINE_FLOW ${JSON.stringify(log)}`);
  });
});
