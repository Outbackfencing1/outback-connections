// Owner sales controls: input validation, the database's answer classified
// honestly, owner-only actions, and no way to mark anything paid.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OFFER_PRICES,
  QUOTE_TRANSITIONS,
  centsFrom,
  parseConversation,
  parseDraftQuote,
  parsePayment,
  parseQuoteStatus,
  parseStage,
  runSalesWrite,
} from "@/lib/digital-services/sales";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("sales input", () => {
  it("a draft quote's price and deposit come from the offer, not the form", () => {
    const q = parseDraftQuote(
      fd({ customer_label: " Fixture Co ", offer: "website_1990", gst_treatment: "exclusive", terms_version: "v1", scope_summary: "Five pages", amount_cents: "1" })
    );
    expect(q).toMatchObject({ customer_label: "Fixture Co", amount_cents: 199000, deposit_cents: 99500, gst_treatment: "exclusive", pilot_company_id: null });
    expect(parseDraftQuote(fd({ customer_label: "X", offer: "quote_form_490", gst_treatment: "exclusive", terms_version: "v1", scope_summary: "s" }))).toMatchObject({
      amount_cents: 49000,
      deposit_cents: 0,
    });
    expect(OFFER_PRICES.website_1990.deposit * 2).toBe(OFFER_PRICES.website_1990.amount);
  });
  it("rejects unknown offers, GST treatments and malformed links", () => {
    const ok = { customer_label: "X", offer: "website_1990", gst_treatment: "exclusive", terms_version: "v1", scope_summary: "s" };
    expect(parseDraftQuote(fd({ ...ok, offer: "website_9999" }))).toBeNull();
    expect(parseDraftQuote(fd({ ...ok, gst_treatment: "paid" }))).toBeNull();
    expect(parseDraftQuote(fd({ ...ok, pilot_company_id: "Acme" }))).toBeNull();
    expect(parseDraftQuote(fd({ ...ok, enquiry_id: "DSE-0F8FAD5B" }))).toBeNull();
    expect(parseDraftQuote(fd({ ...ok, scope_summary: "   " }))).toBeNull();
    expect(parseDraftQuote(fd({ ...ok, pilot_company_id: "OC-002" }))).toMatchObject({ pilot_company_id: "OC-002" });
  });
  it("amounts are positive cents with at most two decimals", () => {
    expect(centsFrom("995")).toBe(99500);
    expect(centsFrom("1,094.50")).toBe(109450);
    expect(centsFrom("A$1094.5")).toBe(109450);
    expect(centsFrom("0")).toBeNull();
    expect(centsFrom("-5")).toBeNull();
    expect(centsFrom("1.234")).toBeNull();
    expect(centsFrom("abc")).toBeNull();
  });
  it("payment needs evidence, a real amount and a date that isn't in the future", () => {
    const ok = { quote_id: ID, evidence_source: "bank_statement", evidence_ref: "TXN 123", amount: "995", received_on: "2026-10-05" };
    expect(parsePayment(fd(ok), "2026-10-05")).toEqual({ quote_id: ID, amount_cents: 99500, received_on: "2026-10-05", evidence_source: "bank_statement", evidence_ref: "TXN 123" });
    expect(parsePayment(fd({ ...ok, received_on: "2026-10-06" }), "2026-10-05")).toBeNull();
    expect(parsePayment(fd({ ...ok, evidence_ref: "  " }), "2026-10-05")).toBeNull();
    expect(parsePayment(fd({ ...ok, evidence_source: "screenshot" }), "2026-10-05")).toBeNull();
    expect(parsePayment(fd({ ...ok, amount: "" }), "2026-10-05")).toBeNull();
    expect(parsePayment(fd({ ...ok, received_on: "2026-02-31" }), "2026-10-05")).toBeNull();
  });
  it("a conversation entry must be linked and of a known kind", () => {
    expect(parseConversation(fd({ kind: "call", summary: "Scope call", quote_id: ID }))).toMatchObject({ kind: "call", quote_id: ID, occurred_at: null });
    expect(parseConversation(fd({ kind: "call", summary: "Scope call" }))).toBeNull();
    expect(parseConversation(fd({ kind: "sms", summary: "x", pilot_company_id: "OC-003" }))).toBeNull();
    expect(parseConversation(fd({ kind: "note", summary: "x", pilot_company_id: "OC-003", occurred_on: "2026-10-05" }))?.occurred_at).toBe("2026-10-05T12:00:00+10:00");
  });
  it("there is no paid status or transition, and stages are a fixed list", () => {
    expect(parseQuoteStatus(fd({ quote_id: ID, to: "paid" }))).toBeNull();
    expect(parseQuoteStatus(fd({ quote_id: ID, to: "draft" }))).toBeNull();
    expect(Object.keys(QUOTE_TRANSITIONS)).not.toContain("paid");
    expect(parseStage(fd({ quote_id: ID, stage: "paid" }))).toBeNull();
    expect(parseStage(fd({ quote_id: ID, stage: "in_production" }))).toEqual({ id: ID, stage: "in_production" });
  });
});

describe("runSalesWrite", () => {
  const ok = { data: [{ id: ID }], error: null };
  it("is saved only with rows back; zero rows is stale", async () => {
    expect(await runSalesWrite(async () => ok, { retry: false })).toBe("saved");
    expect(await runSalesWrite(async () => ({ data: [], error: null }), { retry: false })).toBe("stale");
  });
  it("maps the database's refusals", async () => {
    const err = (code: string) => async () => ({ data: null, error: { code, message: "x" } });
    expect(await runSalesWrite(err("OC402"), { retry: true })).toBe("gated");
    expect(await runSalesWrite(err("OC409"), { retry: true })).toBe("fixed");
    expect(await runSalesWrite(err("23505"), { retry: true })).toBe("duplicate");
    expect(await runSalesWrite(err("23514"), { retry: true })).toBe("refused");
  });
  it("a transport failure is retried only when allowed, and never reported as saved", async () => {
    const lost = vi.fn(async () => ({ data: null, error: { message: "fetch failed" } }));
    expect(await runSalesWrite(lost, { retry: false })).toBe("unconfirmed");
    expect(lost).toHaveBeenCalledTimes(1);
    const flaky = vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce(ok);
    expect(await runSalesWrite(flaky, { retry: true })).toBe("saved");
  });
  it("a retried payment that comes back duplicate may be its own first attempt: unconfirmed, not 'duplicate'", async () => {
    const w = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } })
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate key" } });
    expect(await runSalesWrite(w, { retry: true })).toBe("unconfirmed");
  });
  it("no database is reported as unavailable", async () => {
    expect(await runSalesWrite(null, { retry: true })).toBe("unavailable");
  });
});

const access = vi.hoisted(() => ({ ok: true }));
const db = vi.hoisted(() => ({
  result: { data: [{ id: "x" }] as unknown[] | null, error: null as { message: string; code?: string } | null },
  writes: [] as { table: string; op: string; row: unknown; filters: unknown[] }[],
}));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/digital-services/owner", () => ({
  getOwnerAccess: async () => (access.ok ? { ok: true, userId: "owner-uuid" } : { ok: false, reason: "forbidden" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = (op: string, row: unknown) => {
        const w = { table, op, row, filters: [] as unknown[] };
        const c = {
          eq: (...a: unknown[]) => (w.filters.push(["eq", ...a]), c),
          in: (...a: unknown[]) => (w.filters.push(["in", ...a]), c),
          select: async () => {
            db.writes.push(w);
            return db.result;
          },
        };
        return c;
      };
      return { insert: (row: unknown) => chain("insert", row), update: (row: unknown) => chain("update", row) };
    },
  }),
}));

async function call(name: string, fields: Record<string, string>): Promise<string> {
  const actions = (await import("@/app/dashboard/owner/sales-actions")) as unknown as Record<string, (f: FormData) => Promise<void>>;
  try {
    await actions[name](fd(fields));
  } catch (e) {
    return (e as { url: string }).url;
  }
  throw new Error("expected a redirect");
}

describe("sales actions", () => {
  beforeEach(() => {
    access.ok = true;
    db.writes = [];
    db.result = { data: [{ id: "x" }], error: null };
    revalidate.mockClear();
  });

  it("anyone but the owner is sent back to the gated page and nothing is written", async () => {
    access.ok = false;
    for (const name of ["createDraftQuote", "setQuoteStatus", "setDeliveryStage", "recordPaymentEvidence", "addConversation"]) {
      expect(await call(name, { quote_id: ID, to: "sent" })).toBe("/dashboard/owner");
    }
    expect(db.writes).toHaveLength(0);
  });

  it("a draft quote is inserted as a draft with the offer's price", async () => {
    const url = await call("createDraftQuote", {
      customer_label: "Fixture",
      offer: "quote_form_490",
      gst_treatment: "exclusive",
      terms_version: "v1",
      scope_summary: "One flow",
      view: "status=all",
    });
    expect(url).toBe("/dashboard/owner?status=all&sales=saved#sales");
    expect(db.writes[0]).toMatchObject({ table: "digital_services_quotes", op: "insert", row: { status: "draft", amount_cents: 49000, deposit_cents: 0 } });
    expect(revalidate).toHaveBeenCalled();
  });

  it("a status change is only from the statuses that lead to it, and stamps the time", async () => {
    await call("setQuoteStatus", { quote_id: ID, to: "accepted" });
    const w = db.writes[0];
    expect(w.row).toMatchObject({ status: "accepted" });
    expect((w.row as Record<string, string>).accepted_at).toBeTruthy();
    expect(w.filters).toContainEqual(["in", "status", ["sent"]]);
    db.result = { data: [], error: null };
    expect(await call("setQuoteStatus", { quote_id: ID, to: "accepted" })).toBe("/dashboard/owner?sales=stale#sales");
    expect(await call("setQuoteStatus", { quote_id: ID, to: "paid" })).toBe("/dashboard/owner?sales=invalid#sales");
  });

  it("a gated delivery stage is shown as gated, not saved", async () => {
    db.result = { data: null, error: { code: "OC402", message: "production needs the payment due before production evidenced" } };
    expect(await call("setDeliveryStage", { quote_id: ID, stage: "in_production" })).toBe("/dashboard/owner?sales=gated#sales");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("payment evidence records who recorded it; a duplicate is refused visibly", async () => {
    await call("recordPaymentEvidence", { quote_id: ID, evidence_source: "bank_statement", evidence_ref: "TXN-1", amount: "1,094.50", received_on: "2026-10-01" });
    expect(db.writes[0]).toMatchObject({ table: "digital_services_payments", row: { amount_cents: 109450, recorded_by: "owner:owner-uuid" } });
    db.result = { data: null, error: { code: "23505", message: "duplicate key" } };
    expect(await call("recordPaymentEvidence", { quote_id: ID, evidence_source: "bank_statement", evidence_ref: "TXN-1", amount: "995", received_on: "2026-10-01" })).toBe(
      "/dashboard/owner?sales=duplicate#sales"
    );
  });

  it("a conversation note is linked and attributed; an unlinked one never reaches the database", async () => {
    await call("addConversation", { kind: "call", summary: "Scope call", enquiry_id: ID });
    expect(db.writes[0]).toMatchObject({ table: "digital_services_conversations", row: { kind: "call", enquiry_id: ID, recorded_by: "owner:owner-uuid" } });
    expect(await call("addConversation", { kind: "call", summary: "Scope call" })).toBe("/dashboard/owner?sales=invalid#sales");
    expect(db.writes).toHaveLength(1);
  });
});
