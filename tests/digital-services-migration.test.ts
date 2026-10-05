// Runs the draft migration on a real Postgres (PGlite, in-process) with the
// Supabase roles stubbed, then checks the constraints the app relies on.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { draftHash } from "@/lib/digital-services/dispatch-guard";
import { PGlite } from "@electric-sql/pglite";

const SQL = readFileSync("supabase/migrations/_drafts/digital_services_enquiries.sql", "utf8");

async function db() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role;`);
  await pg.exec(SQL);
  return pg;
}
const row = (key: string, over: Record<string, string> = {}) => ({
  idempotency_key: key,
  business_name: "Acme Cleaning",
  contact_name: "Pat",
  email: "pat@example.com",
  interest: "website",
  message: "We want a website please.",
  ...over,
});
async function insert(pg: PGlite, r: Record<string, string>) {
  const cols = Object.keys(r);
  return pg.query(
    `insert into digital_services_enquiries (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(r)
  );
}

describe("digital_services_enquiries migration", { timeout: 30_000 }, () => {
  it("applies cleanly and twice (idempotent DDL)", async () => {
    const pg = await db();
    await pg.exec(SQL);
    const t = await pg.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where relname = 'digital_services_enquiries'`
    );
    expect(t.rows[0].relrowsecurity).toBe(true);
  });

  it("one row per idempotency key", async () => {
    const pg = await db();
    const k = "0f8fad5b-d9cb-469f-a165-70867728950e";
    await insert(pg, row(k));
    await expect(insert(pg, row(k))).rejects.toThrow(/duplicate key|unique/i);
  });

  it("enforces interest, status and length checks", async () => {
    const pg = await db();
    await expect(insert(pg, row("1f8fad5b-d9cb-469f-a165-70867728950e", { interest: "seo" }))).rejects.toThrow(/check/i);
    await expect(insert(pg, row("2f8fad5b-d9cb-469f-a165-70867728950e", { message: "short" }))).rejects.toThrow(/check/i);
    await expect(insert(pg, row("3f8fad5b-d9cb-469f-a165-70867728950e", { email: "no-at-sign" }))).rejects.toThrow(/check/i);
    const ok = await insert(pg, row("4f8fad5b-d9cb-469f-a165-70867728950e", { business_name: "Đặng & O'Brien" }));
    expect(ok.rows).toHaveLength(1);
  });

  it("anon and authenticated have no table privileges; service_role has a policy", async () => {
    const pg = await db();
    const priv = await pg.query<{ grantee: string }>(
      `select grantee from information_schema.role_table_grants where table_name = 'digital_services_enquiries' and grantee in ('anon','authenticated')`
    );
    expect(priv.rows).toHaveLength(0);
    const pol = await pg.query<{ roles: string }>(
      `select roles::text from pg_policies where tablename = 'digital_services_enquiries'`
    );
    expect(pol.rows.map((r) => r.roles)).toEqual(["{service_role}"]);
  });

  it("the service role can actually use the table and the purge (explicit grants, not just a policy)", async () => {
    const pg = await db();
    await pg.exec(`set role service_role`);
    const ins = await insert(pg, row("7f8fad5b-d9cb-469f-a165-70867728950e"));
    const id = (ins.rows[0] as { id: string }).id;
    await pg.query(`update digital_services_enquiries set status = 'replied' where id = $1`, [id]);
    const sel = await pg.query<{ status: string }>(`select status from digital_services_enquiries where id = $1`, [id]);
    expect(sel.rows[0].status).toBe("replied");
    await pg.query(`select public.purge_old_digital_services_enquiries()`);
    await pg.query(`delete from digital_services_enquiries where id = $1`, [id]);
    await pg.exec(`reset role`);
  });

  it("anon and authenticated are refused outright", async () => {
    const pg = await db();
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await expect(pg.query(`select * from digital_services_enquiries`)).rejects.toThrow(/permission denied/i);
      await expect(pg.query(`select public.purge_old_digital_services_enquiries()`)).rejects.toThrow(/permission denied/i);
      await pg.exec(`reset role`);
    }
  });

  it("the trigger caps one IP at 5 an hour (OC429); other IPs, older rows and no-IP rows aren't counted", async () => {
    const pg = await db();
    await pg.exec(`set role service_role`);
    const key = (i: number) => `${i.toString(16).padStart(8, "0")}-d9cb-469f-a165-70867728950e`;
    for (let i = 1; i <= 5; i++) await insert(pg, row(key(i), { consent_ip: "203.0.113.7" }));
    await expect(insert(pg, row(key(6), { consent_ip: "203.0.113.7" }))).rejects.toMatchObject({ code: "OC429" });
    await insert(pg, row(key(7), { consent_ip: "198.51.100.9" }));
    await insert(pg, row(key(8)));
    await pg.exec(`reset role`);
    await pg.query(`update digital_services_enquiries set created_at = now() - interval '61 minutes' where idempotency_key = $1`, [key(1)]);
    await pg.exec(`set role service_role`);
    await insert(pg, row(key(9), { consent_ip: "203.0.113.7" }));
    await pg.exec(`reset role`);
  });

  it("a confirmed owner alert can't be overwritten by a later failure", async () => {
    const pg = await db();
    const ins = await insert(pg, row("8f8fad5b-d9cb-469f-a165-70867728950e"));
    const id = (ins.rows[0] as { id: string }).id;
    await pg.query(`update digital_services_enquiries set notified_at = now(), notify_error = null where id = $1`, [id]);
    await pg.query(`update digital_services_enquiries set notified_at = null, notify_error = 'slower send failed' where id = $1`, [id]);
    const r = await pg.query<{ notified: boolean; notify_error: string | null }>(
      `select notified_at is not null as notified, notify_error from digital_services_enquiries where id = $1`, [id]);
    expect(r.rows[0]).toEqual({ notified: true, notify_error: null });
    // Before any success, a failure is still recorded normally.
    const ins2 = await insert(pg, row("9f8fad5b-d9cb-469f-a165-70867728950e"));
    const id2 = (ins2.rows[0] as { id: string }).id;
    await pg.query(`update digital_services_enquiries set notify_error = 'down' where id = $1`, [id2]);
    const r2 = await pg.query<{ notify_error: string }>(`select notify_error from digital_services_enquiries where id = $1`, [id2]);
    expect(r2.rows[0].notify_error).toBe("down");
  });

  it("purge removes rows older than 12 months only", async () => {
    const pg = await db();
    await insert(pg, row("5f8fad5b-d9cb-469f-a165-70867728950e"));
    await pg.query(
      `insert into digital_services_enquiries (idempotency_key, business_name, contact_name, email, interest, message, created_at)
       values ('6f8fad5b-d9cb-469f-a165-70867728950e', 'Old Co', 'Old', 'old@example.com', 'care', 'An old enquiry here', now() - interval '13 months')`
    );
    const r = await pg.query<{ n: number }>(`select public.purge_old_digital_services_enquiries() as n`);
    expect(r.rows[0].n).toBe(1);
    const left = await pg.query<{ c: number }>(`select count(*)::int as c from digital_services_enquiries`);
    expect(left.rows[0].c).toBe(1);
  });
});

const PILOT_SQL = readFileSync("supabase/migrations/_drafts/digital_services_pilot.sql", "utf8");

describe("digital_services_pilot migration (owner-only prospect data)", { timeout: 30_000 }, () => {
  async function pilotDb() {
    const pg = new PGlite();
    await pg.exec(`create role anon; create role authenticated; create role service_role;`);
    await pg.query(`select set_config('app.ds_owner_user_id', $1, false)`, ["33333333-3333-4333-8333-333333333333"]);
    await pg.exec(PILOT_SQL);
    await pg.exec(PILOT_SQL); // idempotent DDL
    return pg;
  }

  it("is service-role only: RLS on, anon and authenticated refused", async () => {
    const pg = await pilotDb();
    const t = await pg.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname = 'digital_services_pilot'`);
    expect(t.rows[0].relrowsecurity).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await expect(pg.query(`select * from digital_services_pilot`)).rejects.toThrow(/permission denied/i);
      await pg.exec(`reset role`);
    }
    await pg.exec(`set role service_role`);
    await pg.query(
      `insert into digital_services_pilot (id, company, lane, preview_token, preview_check, reserved_for) values ('OC-999', 'Test Co', 'email', '0123456789abcdef0123', 'pass', 'cowork')`
    );
    const r = await pg.query<{ c: number }>(`select count(*)::int as c from digital_services_pilot`);
    expect(r.rows[0].c).toBe(1);
    await pg.exec(`reset role`);
  });

  it("can't be applied without the owner id, and seeds it when given", async () => {
    const pg = new PGlite();
    await pg.exec(`create role anon; create role authenticated; create role service_role;`);
    await expect(pg.exec(PILOT_SQL)).rejects.toThrow(/null value|not-null/i);
    await pg.query(`select set_config('app.ds_owner_user_id', $1, false)`, ["33333333-3333-4333-8333-333333333333"]);
    await pg.exec(PILOT_SQL);
    const r = await pg.query<{ owner_user_id: string }>(`select owner_user_id from digital_services_settings`);
    expect(r.rows).toEqual([{ owner_user_id: "33333333-3333-4333-8333-333333333333" }]);
  });

  it("rejects malformed ids, lanes and preview tokens", async () => {
    const pg = await pilotDb();
    await expect(pg.query(`insert into digital_services_pilot (id, company, lane) values ('X-1', 'Co', 'email')`)).rejects.toThrow(/check/i);
    await expect(pg.query(`insert into digital_services_pilot (id, company, lane) values ('OC-998', 'Co', 'sms')`)).rejects.toThrow(/check/i);
    await expect(
      pg.query(`insert into digital_services_pilot (id, company, lane, preview_token) values ('OC-997', 'Co', 'email', '../../etc')`)
    ).rejects.toThrow(/check/i);
  });
});

const OWNER = "33333333-3333-4333-8333-333333333333";

describe("pilot drafts, approvals and first-contact enforcement", { timeout: 30_000 }, () => {
  async function seeded() {
    const pg = new PGlite();
    await pg.exec(`create role anon; create role authenticated; create role service_role;`);
    await pg.query(`select set_config('app.ds_owner_user_id', $1, false)`, [OWNER]);
    await pg.exec(PILOT_SQL);
    await pg.exec(`insert into digital_services_pilot (id, company, lane, reserved_for, contact_address, contact_basis, contact_basis_confirmed_at, contact_basis_confirmed_by, contact_basis_confirmed_for)
                   values ('OC-901', 'Fixture Cleaners', 'email', 'cowork', 'info@example.test', 'published on the business contact page', now(), 'Joshua', 'info@example.test')`);
    const ins = async (rev: number, subject: string, body: string) =>
      (await pg.query<{ id: string; sha256: string }>(
        `insert into digital_services_pilot_drafts (company_id, revision, subject, body, sha256, author) values ('OC-901', $1, $2, $3, 'ignored', 'claude-code') returning id, sha256`,
        [rev, subject, body]
      )).rows[0];
    const reviews = async (d: { id: string; sha256: string }) => {
      await pg.exec(`set role service_role`);
      for (const kind of ["evidence_refresh", "preview_review", "copy_review"])
        await pg.query(`insert into digital_services_pilot_approvals (draft_id, draft_sha256, kind, actor) values ($1, $2, $3, 'reviewer')`, [d.id, d.sha256, kind]);
      await pg.exec(`reset role`);
    };
    // Josh's approval: his own session (authenticated + JWT subject) via the function.
    const ownerApproves = async (d: { id: string; sha256: string }, sub = OWNER) => {
      await pg.exec(`set role authenticated`);
      await pg.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub, role: "authenticated" })]);
      try {
        return await pg.query(`select public.approve_pilot_message($1, $2)`, [d.id, d.sha256]);
      } finally {
        await pg.exec(`reset role`);
      }
    };
    const approveAll = async (d: { id: string; sha256: string }) => {
      await reviews(d);
      await ownerApproves(d);
    };
    const contact = (draftId: string, over: { lane?: string; sender?: string } = {}) =>
      pg.query(`insert into digital_services_pilot_events (company_id, kind, lane, draft_id, sender, recorded_by) values ('OC-901', 'contacted', $1, $2, $3, 'test')`, [
        over.lane ?? "cowork",
        draftId,
        over.sender ?? "josh@outbackconnections.com.au",
      ]);
    return { pg, ins, reviews, ownerApproves, approveAll, contact };
  }

  it("hashes drafts in the database exactly as the server guard does, and refuses edits", async () => {
    const { pg, ins } = await seeded();
    const d = await ins(1, "Subject", "Body line one.\nBody line two.");
    expect(d.sha256).toBe(draftHash("Subject", "Body line one.\nBody line two."));
    await expect(pg.query(`update digital_services_pilot_drafts set body = 'changed' where id = $1`, [d.id])).rejects.toMatchObject({ code: "OC409" });
  });

  it("refuses first contact until the latest revision has all four approvals", async () => {
    const { ins, approveAll, contact } = await seeded();
    const d1 = await ins(1, "Old", "Old body");
    await approveAll(d1);
    const d2 = await ins(2, "New", "New body");
    await expect(contact(d1.id)).rejects.toMatchObject({ code: "OC403" }); // approved, but not the latest revision
    await expect(contact(d2.id)).rejects.toThrow(/lacks 4 approval/); // approvals don't carry over
  });

  it("refuses the other lane, help@ and a second first contact; allows exactly one", async () => {
    const { pg, ins, approveAll, contact } = await seeded();
    const d = await ins(1, "Subject", "Body");
    await approveAll(d);
    await expect(contact(d.id, { lane: "engine" })).rejects.toThrow(/not reserved for this lane/);
    await expect(contact(d.id, { sender: "help@outbackconnections.com.au" })).rejects.toThrow(/never help@/);
    await contact(d.id);
    await expect(contact(d.id)).rejects.toThrow(/duplicate key|unique|already contacted/i);
    const n = await pg.query<{ c: number }>(`select count(*)::int as c from digital_services_pilot_events where kind = 'contacted'`);
    expect(n.rows[0].c).toBe(1);
  });

  it("a send records its intent first; its outcome must match it; an unresolved attempt blocks another", async () => {
    const { pg, ins, approveAll } = await seeded();
    const d1 = await ins(1, "Subject", "Body");
    const ev = (kind: string, draftId: string | null, msgId: string | null, extra: { provider?: string } = {}) =>
      pg.query(
        `insert into digital_services_pilot_events (company_id, kind, lane, draft_id, sender, rfc822_message_id, provider_message_id, recorded_by)
         values ('OC-901', $1, 'cowork', $2, 'josh@outbackconnections.com.au', $3, $4, 'test')`,
        [kind, draftId, msgId, extra.provider ?? null]
      );
    await expect(ev("send_attempt", d1.id, "<a1@outbackconnections.com.au>")).rejects.toThrow(/lacks 4 approval/); // same gate as contact
    await approveAll(d1);
    await expect(ev("send_attempt", d1.id, null)).rejects.toThrow(/own Message-ID/);
    await ev("send_attempt", d1.id, "<a1@outbackconnections.com.au>");
    await expect(ev("send_attempt", d1.id, "<a2@outbackconnections.com.au>")).rejects.toThrow(/unresolved|unique|duplicate/i);
    await expect(ev("contacted", d1.id, "<other@outbackconnections.com.au>")).rejects.toThrow(/no matching send attempt/);
    // A definite provider refusal resolves it; a new revision can then be attempted.
    await ev("send_failed", d1.id, "<a1@outbackconnections.com.au>");
    await expect(ev("send_attempt", d1.id, "<a3@outbackconnections.com.au>")).rejects.toThrow(/unique|duplicate/i); // same revision: no blind retry
    const d2 = await ins(2, "Subject 2", "Body 2");
    await approveAll(d2);
    await ev("send_attempt", d2.id, "<a4@outbackconnections.com.au>");
    // A reply arriving before the outcome is recorded doesn't stop recording what was sent.
    await pg.query(`insert into digital_services_pilot_events (company_id, kind, provider_message_id, recorded_by) values ('OC-901', 'replied', 'gm-reply-1', 'sync')`);
    await ev("contacted", d2.id, "<a4@outbackconnections.com.au>", { provider: "gm-sent-1" });
    await expect(ev("contacted", d2.id, "<a4@outbackconnections.com.au>", { provider: "gm-sent-2" })).rejects.toThrow(/unique|duplicate/i);
    await expect(
      pg.query(`insert into digital_services_pilot_events (company_id, kind, provider_message_id, recorded_by) values ('OC-901', 'replied', 'gm-reply-1', 'sync')`)
    ).rejects.toThrow(/unique|duplicate/i); // reply sync is idempotent
  });

  it("suppression and an unconfirmed contact basis block first contact", async () => {
    const { pg, ins, approveAll, contact } = await seeded();
    const d = await ins(1, "Subject", "Body");
    await approveAll(d);
    await pg.query(`update digital_services_pilot set contact_basis_confirmed_at = null where id = 'OC-901'`);
    await expect(contact(d.id)).rejects.toThrow(/contact basis not confirmed/);
    await pg.query(`update digital_services_pilot set contact_basis_confirmed_at = now() where id = 'OC-901'`);
    await pg.query(`insert into digital_services_pilot_events (company_id, kind, recorded_by) values ('OC-901', 'opted_out', 'test')`);
    await expect(contact(d.id)).rejects.toThrow(/suppressed/);
  });
  it("Josh's message approval: only his own session, only after the reviews; never a direct insert", async () => {
    const { pg, ins, reviews, ownerApproves, contact } = await seeded();
    const d = await ins(1, "Subject", "Body");
    await expect(ownerApproves(d)).rejects.toThrow(/reviews come first/);
    await reviews(d);
    await expect(ownerApproves(d, "44444444-4444-4444-8444-444444444444")).rejects.toThrow(/only the owner/);
    await pg.exec(`set role service_role`);
    await expect(
      pg.query(`insert into digital_services_pilot_approvals (draft_id, draft_sha256, kind, actor, approver_user_id) values ($1, $2, 'message_approval', 'Joshua', '${OWNER}')`, [d.id, d.sha256])
    ).rejects.toMatchObject({ code: "OC403" });
    await expect(pg.query(`select public.approve_pilot_message($1, $2)`, [d.id, d.sha256])).rejects.toThrow(/permission denied/i);
    await pg.exec(`reset role`);
    await expect(contact(d.id)).rejects.toThrow(/lacks 1 approval/);
    const first = (await ownerApproves(d)).rows[0] as { approve_pilot_message: string };
    // A double click / retry returns the same approval instead of failing.
    const again = (await ownerApproves(d)).rows[0] as { approve_pilot_message: string };
    expect(again.approve_pilot_message).toBe(first.approve_pilot_message);
    const n = await pg.query<{ c: number }>(`select count(*)::int as c from digital_services_pilot_approvals where kind = 'message_approval'`);
    expect(n.rows[0].c).toBe(1);
    await contact(d.id);
  });

  it("after an owner change, the old owner's approval neither counts nor lets the new owner's call look successful", async () => {
    const { pg, ins, approveAll, ownerApproves, contact } = await seeded();
    const d = await ins(1, "Subject", "Body");
    await approveAll(d);
    const NEW_OWNER = "55555555-5555-4555-8555-555555555555";
    await pg.query(`update digital_services_settings set owner_user_id = $1`, [NEW_OWNER]);
    await expect(ownerApproves(d, NEW_OWNER)).rejects.toMatchObject({ code: "OC409" });
    await expect(contact(d.id)).rejects.toThrow(/lacks 1 approval/);
  });

  it("an unreserved company can't be contacted by either lane; a changed address needs re-confirming", async () => {
    const { pg, ins, approveAll, contact } = await seeded();
    const d = await ins(1, "Subject", "Body");
    await approveAll(d);
    await pg.query(`update digital_services_pilot set reserved_for = null where id = 'OC-901'`);
    await expect(contact(d.id)).rejects.toThrow(/not reserved for this lane/);
    await expect(contact(d.id, { lane: "engine" })).rejects.toThrow(/not reserved for this lane/);
    await pg.query(`update digital_services_pilot set reserved_for = 'cowork', contact_address = 'other@example.test' where id = 'OC-901'`);
    await expect(contact(d.id)).rejects.toThrow(/current address/);
    await pg.query(`update digital_services_pilot set contact_basis_confirmed_for = 'OTHER@example.test' where id = 'OC-901'`);
    await contact(d.id);
  });
});

const SALES_SQL = readFileSync("supabase/migrations/_drafts/digital_services_sales.sql", "utf8");

describe("quotes and payment evidence (no manual 'paid')", { timeout: 30_000 }, () => {
  async function salesDb() {
    const pg = new PGlite();
    await pg.exec(`create role anon; create role authenticated; create role service_role;`);
    await pg.exec(SALES_SQL);
    await pg.exec(SALES_SQL);
    return pg;
  }
  const quote = (pg: PGlite, over = "") =>
    pg.query<{ id: string }>(
      `insert into digital_services_quotes (customer_label, offer, amount_cents, deposit_cents, terms_version, scope_summary${over ? ", " + over.split("=")[0] : ""})
       values ('Fixture customer', 'website_1990', 199000, 99500, 'proposed-2026-10-04', 'Up to five template pages, guided form, two revision rounds'${over ? ", " + over.split("=")[1] : ""}) returning id`
    );

  it("has no paid status, and a quote can't be sent while GST treatment is pending", async () => {
    const pg = await salesDb();
    const q = (await quote(pg)).rows[0];
    await expect(pg.query(`update digital_services_quotes set status = 'paid' where id = $1`, [q.id])).rejects.toThrow(/check/i);
    await expect(pg.query(`update digital_services_quotes set status = 'sent', sent_at = now() where id = $1`, [q.id])).rejects.toThrow(/check/i);
  });

  it("deposit received is derived only from evidenced payments, and evidence can't be counted twice", async () => {
    const pg = await salesDb();
    const q = (await quote(pg)).rows[0];
    const balance = async () =>
      (await pg.query<{ paid_cents: number; deposit_received: boolean }>(`select paid_cents, deposit_received from digital_services_quote_balance where quote_id = $1`, [q.id])).rows[0];
    expect(await balance()).toMatchObject({ paid_cents: 0, deposit_received: false });
    const pay = () =>
      pg.query(
        `insert into digital_services_payments (quote_id, amount_cents, received_on, evidence_source, evidence_ref, recorded_by) values ($1, 99500, '2026-10-10', 'bank_statement', 'TXN-FIXTURE-1', 'Joshua')`,
        [q.id]
      );
    await pay();
    await expect(pay()).rejects.toThrow(/duplicate key|unique/i);
    expect(await balance()).toMatchObject({ paid_cents: 99500, deposit_received: false }); // GST still pending: no total due yet
    await pg.query(`update digital_services_quotes set gst_treatment = 'not_registered' where id = $1`, [q.id]);
    expect(await balance()).toMatchObject({ paid_cents: 99500, deposit_received: true });
    await expect(
      pg.query(`insert into digital_services_payments (quote_id, amount_cents, received_on, evidence_source, evidence_ref, recorded_by) values ($1, 100, '2026-10-10', 'bank_statement', '  ', 'Joshua')`, [q.id])
    ).rejects.toThrow(/check/i);
  });

  it("exclusive GST is added to the total and deposit due; inclusive isn't", async () => {
    const pg = await salesDb();
    const q = (await quote(pg)).rows[0];
    const bal = async () =>
      (await pg.query<{ total_due_cents: number | null; deposit_due_cents: number | null; outstanding_cents: number | null }>(
        `select total_due_cents, deposit_due_cents, outstanding_cents from digital_services_quote_balance where quote_id = $1`, [q.id])).rows[0];
    expect(await bal()).toEqual({ total_due_cents: null, deposit_due_cents: null, outstanding_cents: null });
    await pg.query(`update digital_services_quotes set gst_treatment = 'exclusive' where id = $1`, [q.id]);
    await pg.query(`insert into digital_services_payments (quote_id, amount_cents, received_on, evidence_source, evidence_ref, recorded_by) values ($1, 199000, '2026-10-10', 'bank_statement', 'TXN-GST-1', 'Joshua')`, [q.id]);
    expect(await bal()).toEqual({ total_due_cents: 218900, deposit_due_cents: 109450, outstanding_cents: 19900 });
    await pg.query(`update digital_services_quotes set gst_treatment = 'inclusive' where id = $1`, [q.id]);
    expect(await bal()).toEqual({ total_due_cents: 199000, deposit_due_cents: 99500, outstanding_cents: 0 });
  });

  it("the same evidence with different spacing or case is still a duplicate", async () => {
    const pg = await salesDb();
    const q = (await quote(pg)).rows[0];
    const pay = (ref: string) =>
      pg.query(`insert into digital_services_payments (quote_id, amount_cents, received_on, evidence_source, evidence_ref, recorded_by) values ($1, 100, '2026-10-10', 'bank_statement', $2, 'Joshua')`, [q.id, ref]);
    await pay("TXN-123");
    await expect(pay(" TXN-123 ")).rejects.toThrow(/duplicate key|unique/i);
    await expect(pay("txn - 123")).rejects.toThrow(/duplicate key|unique/i);
  });

  const payFixture = (pg: PGlite, id: string, cents: number, ref: string) =>
    pg.query(
      `insert into digital_services_payments (quote_id, amount_cents, received_on, evidence_source, evidence_ref, recorded_by) values ($1, $2, '2026-10-10', 'bank_statement', $3, 'Joshua')`,
      [id, cents, ref]
    );
  const stage = (pg: PGlite, id: string, s: string) => pg.query(`update digital_services_quotes set delivery_stage = $2 where id = $1`, [id, s]);

  it("a website reaches production only once accepted with its deposit evidenced, and launches only when paid in full", async () => {
    const pg = await salesDb();
    const q = (await quote(pg)).rows[0];
    await stage(pg, q.id, "intake_requested"); // intake can start any time
    await expect(stage(pg, q.id, "in_production")).rejects.toThrow(/accepted quote/);
    await pg.query(`update digital_services_quotes set gst_treatment = 'exclusive', status = 'sent', sent_at = now() where id = $1`, [q.id]);
    await pg.query(`update digital_services_quotes set status = 'accepted', accepted_at = now() where id = $1`, [q.id]);
    await expect(stage(pg, q.id, "in_production")).rejects.toThrow(/evidenced/);
    await payFixture(pg, q.id, 99500, "TXN-DEP-SHORT"); // the deposit before GST isn't enough
    await expect(stage(pg, q.id, "in_production")).rejects.toThrow(/evidenced/);
    await payFixture(pg, q.id, 9950, "TXN-DEP-GST");
    await stage(pg, q.id, "in_production");
    await stage(pg, q.id, "client_review");
    await stage(pg, q.id, "approved");
    await expect(stage(pg, q.id, "launched")).rejects.toThrow(/balance evidenced/);
    await payFixture(pg, q.id, 109450, "TXN-BAL");
    await stage(pg, q.id, "launched");
    await stage(pg, q.id, "handed_over");
  });

  it("a guided form is paid in full before production, and a quote can't be inserted mid-delivery", async () => {
    const pg = await salesDb();
    const q = (
      await pg.query<{ id: string }>(
        `insert into digital_services_quotes (customer_label, offer, amount_cents, deposit_cents, gst_treatment, terms_version, scope_summary, status, sent_at, accepted_at)
         values ('Fixture form', 'quote_form_490', 49000, 0, 'exclusive', 'proposed-2026-10-04', 'One guided flow', 'accepted', now(), now()) returning id`
      )
    ).rows[0];
    await expect(stage(pg, q.id, "in_production")).rejects.toThrow(/evidenced/);
    await payFixture(pg, q.id, 53900, "TXN-FORM");
    await stage(pg, q.id, "in_production");
    await expect(
      pg.query(
        `insert into digital_services_quotes (customer_label, offer, amount_cents, gst_treatment, terms_version, scope_summary, status, accepted_at, delivery_stage)
         values ('Fixture', 'quote_form_490', 49000, 'exclusive', 't', 's', 'accepted', now(), 'launched')`
      )
    ).rejects.toThrow(/evidenced/);
  });

  it("a sent quote's price, GST, terms and scope are fixed", async () => {
    const pg = await salesDb();
    const q = (await quote(pg)).rows[0];
    await pg.query(`update digital_services_quotes set amount_cents = 149000, deposit_cents = 74500 where id = $1`, [q.id]); // drafts can change
    await pg.query(`update digital_services_quotes set gst_treatment = 'exclusive', status = 'sent', sent_at = now() where id = $1`, [q.id]);
    await expect(pg.query(`update digital_services_quotes set amount_cents = 199000 where id = $1`, [q.id])).rejects.toThrow(/fixed/);
    await expect(pg.query(`update digital_services_quotes set gst_treatment = 'inclusive' where id = $1`, [q.id])).rejects.toThrow(/fixed/);
    await pg.query(`update digital_services_quotes set status = 'withdrawn' where id = $1`, [q.id]); // status can still move
  });

  it("conversations are an append-only owner log linked to something", async () => {
    const pg = await salesDb();
    const q = (await quote(pg)).rows[0];
    await pg.query(`insert into digital_services_conversations (kind, summary, quote_id, recorded_by) values ('call', 'Talked through scope', $1, 'Joshua')`, [q.id]);
    await expect(pg.query(`insert into digital_services_conversations (kind, summary, recorded_by) values ('note', 'Unlinked', 'Joshua')`)).rejects.toThrow(/check/i);
    await expect(pg.query(`insert into digital_services_conversations (kind, summary, pilot_company_id, recorded_by) values ('sms', 'x', 'OC-901', 'Joshua')`)).rejects.toThrow(/check/i);
    await pg.exec(`set role service_role`);
    await expect(pg.query(`update digital_services_conversations set summary = 'edited'`)).rejects.toThrow(/permission denied/i);
    await expect(pg.query(`delete from digital_services_payments`)).rejects.toThrow(/permission denied/i);
    await pg.exec(`reset role`);
  });

  it("is invisible to anon and authenticated", async () => {
    const pg = await salesDb();
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await expect(pg.query(`select * from digital_services_conversations`)).rejects.toThrow(/permission denied/i);
      await expect(pg.query(`select * from digital_services_quotes`)).rejects.toThrow(/permission denied/i);
      await expect(pg.query(`select * from digital_services_quote_balance`)).rejects.toThrow(/permission denied/i);
      await pg.exec(`reset role`);
    }
  });
});
