// Runs the draft migration on a real Postgres (PGlite, in-process) with the
// Supabase roles stubbed, then checks the constraints the app relies on.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
