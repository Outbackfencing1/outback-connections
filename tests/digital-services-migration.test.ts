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

  it("rejects malformed ids, lanes and preview tokens", async () => {
    const pg = await pilotDb();
    await expect(pg.query(`insert into digital_services_pilot (id, company, lane) values ('X-1', 'Co', 'email')`)).rejects.toThrow(/check/i);
    await expect(pg.query(`insert into digital_services_pilot (id, company, lane) values ('OC-998', 'Co', 'sms')`)).rejects.toThrow(/check/i);
    await expect(
      pg.query(`insert into digital_services_pilot (id, company, lane, preview_token) values ('OC-997', 'Co', 'email', '../../etc')`)
    ).rejects.toThrow(/check/i);
  });
});

describe("pilot drafts, approvals and first-contact enforcement", { timeout: 30_000 }, () => {
  async function seeded() {
    const pg = new PGlite();
    await pg.exec(`create role anon; create role authenticated; create role service_role;`);
    await pg.exec(PILOT_SQL);
    await pg.exec(`insert into digital_services_pilot (id, company, lane, reserved_for, contact_address, contact_basis, contact_basis_confirmed_at, contact_basis_confirmed_by)
                   values ('OC-901', 'Fixture Cleaners', 'email', 'cowork', 'info@example.test', 'published on the business contact page', now(), 'Joshua')`);
    const ins = async (rev: number, subject: string, body: string) =>
      (await pg.query<{ id: string; sha256: string }>(
        `insert into digital_services_pilot_drafts (company_id, revision, subject, body, sha256, author) values ('OC-901', $1, $2, $3, 'ignored', 'claude-code') returning id, sha256`,
        [rev, subject, body]
      )).rows[0];
    const approveAll = async (d: { id: string; sha256: string }) => {
      for (const kind of ["evidence_refresh", "preview_review", "copy_review", "message_approval"])
        await pg.query(`insert into digital_services_pilot_approvals (draft_id, draft_sha256, kind, actor) values ($1, $2, $3, 'Joshua')`, [d.id, d.sha256, kind]);
    };
    const contact = (draftId: string, over: { lane?: string; sender?: string } = {}) =>
      pg.query(`insert into digital_services_pilot_events (company_id, kind, lane, draft_id, sender, recorded_by) values ('OC-901', 'contacted', $1, $2, $3, 'test')`, [
        over.lane ?? "cowork",
        draftId,
        over.sender ?? "josh@outbackconnections.com.au",
      ]);
    return { pg, ins, approveAll, contact };
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
    await expect(contact(d.id, { lane: "engine" })).rejects.toThrow(/reserved for another lane/);
    await expect(contact(d.id, { sender: "help@outbackconnections.com.au" })).rejects.toThrow(/never help@/);
    await contact(d.id);
    await expect(contact(d.id)).rejects.toThrow(/duplicate key|unique/i);
    const n = await pg.query<{ c: number }>(`select count(*)::int as c from digital_services_pilot_events where kind = 'contacted'`);
    expect(n.rows[0].c).toBe(1);
  });

  it("suppression and an unconfirmed contact basis block first contact", async () => {
    const { pg, ins, approveAll, contact } = await seeded();
    const d = await ins(1, "Subject", "Body");
    await approveAll(d);
    await pg.query(`update digital_services_pilot set contact_basis_confirmed_at = null where id = 'OC-901'`);
    await expect(contact(d.id)).rejects.toThrow(/contact basis/);
    await pg.query(`update digital_services_pilot set contact_basis_confirmed_at = now() where id = 'OC-901'`);
    await pg.query(`insert into digital_services_pilot_events (company_id, kind, recorded_by) values ('OC-901', 'opted_out', 'test')`);
    await expect(contact(d.id)).rejects.toThrow(/suppressed/);
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
    expect(await balance()).toMatchObject({ paid_cents: 99500, deposit_received: true });
    await expect(
      pg.query(`insert into digital_services_payments (quote_id, amount_cents, received_on, evidence_source, evidence_ref, recorded_by) values ($1, 100, '2026-10-10', 'bank_statement', '  ', 'Joshua')`, [q.id])
    ).rejects.toThrow(/check/i);
  });

  it("is invisible to anon and authenticated", async () => {
    const pg = await salesDb();
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await expect(pg.query(`select * from digital_services_quotes`)).rejects.toThrow(/permission denied/i);
      await expect(pg.query(`select * from digital_services_quote_balance`)).rejects.toThrow(/permission denied/i);
      await pg.exec(`reset role`);
    }
  });
});
