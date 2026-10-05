import { describe, expect, it, vi } from "vitest";
import { decideOwnerAccess } from "@/lib/digital-services/owner-access";
import { alertDestination, alertReadiness, digitalServicesPublic } from "@/lib/digital-services/flags";
import {
  matchesSearch,
  processIntake,
  referenceFor,
  validateIntake,
  RATE_MAX,
  RATE_LIMITED_CODE,
  ALERT_GRACE_MS,
  type IntakeDeps,
  type IntakeInput,
  type IntakeStore,
} from "@/lib/digital-services/intake";
import { OFFERS } from "@/lib/digital-services/offer";
import { previewHref } from "@/lib/digital-services/pilot";
import { OPEN_STATUSES, pageFrom, statusesFor } from "@/lib/digital-services/queue";

const OWNER = "11111111-2222-4333-8444-555555555555";

describe("owner access (Josh only; marketplace admin is not enough)", () => {
  it("fails closed when the owner id is missing or malformed", () => {
    expect(decideOwnerAccess(OWNER, undefined)).toEqual({ ok: false, reason: "not_configured" });
    expect(decideOwnerAccess(OWNER, "")).toEqual({ ok: false, reason: "not_configured" });
    expect(decideOwnerAccess(OWNER, "josh@example.com")).toEqual({ ok: false, reason: "not_configured" });
  });
  it("sends a logged-out visitor to sign in, configured or not", () => {
    expect(decideOwnerAccess(null, OWNER)).toEqual({ ok: false, reason: "not_signed_in" });
    expect(decideOwnerAccess(null, undefined)).toEqual({ ok: false, reason: "not_signed_in" });
  });
  it("refuses an ordinary member and another admin alike (only the id matters)", () => {
    expect(decideOwnerAccess("99999999-2222-4333-8444-555555555555", OWNER)).toEqual({ ok: false, reason: "forbidden" });
    // An admin is just another user id here: admin flags are never consulted.
    expect(decideOwnerAccess("aaaaaaaa-2222-4333-8444-555555555555", OWNER)).toEqual({ ok: false, reason: "forbidden" });
  });
  it("lets the configured owner in, ignoring case and stray spaces in the env value", () => {
    expect(decideOwnerAccess(OWNER, ` ${OWNER.toUpperCase()} `)).toEqual({ ok: true, userId: OWNER });
  });
});

describe("public page flag", () => {
  it("is on only for exactly 'on'", () => {
    expect(digitalServicesPublic({ DIGITAL_SERVICES_PUBLIC: "on" })).toBe(true);
    for (const v of [undefined, "", "true", "ON", "1", "on "]) {
      expect(digitalServicesPublic({ DIGITAL_SERVICES_PUBLIC: v })).toBe(false);
    }
  });
});

describe("owner alert destination", () => {
  it("trims each address and falls through blank ones to help@", () => {
    expect(alertDestination({ DIGITAL_SERVICES_ALERT_TO: "  owner@example.com \n" })).toBe("owner@example.com");
    expect(alertDestination({ DIGITAL_SERVICES_ALERT_TO: "   ", NOTIFICATION_EMAIL: " ops@example.com " })).toBe("ops@example.com");
    expect(alertDestination({ DIGITAL_SERVICES_ALERT_TO: "   ", NOTIFICATION_EMAIL: "  " })).toBe("help@outbackconnections.com.au");
    expect(alertDestination({})).toBe("help@outbackconnections.com.au");
  });
});

describe("owner alert readiness", () => {
  it("is blocked without a mail transport, even with a destination", () => {
    expect(alertReadiness({ DIGITAL_SERVICES_ALERT_TO: "owner@example.com" }).ok).toBe(false);
    expect(alertReadiness({ DIGITAL_SERVICES_ALERT_TO: "owner@example.com", RESEND_API_KEY: "  " }).ok).toBe(false);
    expect(alertReadiness({}).ok).toBe(false);
  });
  it("waits on a dedicated address when only the transport is set", () => {
    expect(alertReadiness({ RESEND_API_KEY: "re_test" }).ok).toBeNull();
  });
  it("is ready only with both transport and destination", () => {
    expect(alertReadiness({ RESEND_API_KEY: "re_test", DIGITAL_SERVICES_ALERT_TO: "owner@example.com" }).ok).toBe(true);
  });
});

describe("offer", () => {
  it("lists exactly the three launch offers at the decided prices", () => {
    expect(OFFERS.map((o) => [o.key, o.price])).toEqual([
      ["website", "A$1,990"],
      ["quote_form", "A$490"],
      ["care", "A$149 a month"],
    ]);
  });
});

const KEY = "0f8fad5b-d9cb-469f-a165-70867728950e";
const good = (over: Partial<IntakeInput> = {}): IntakeInput => ({
  idempotency_key: KEY,
  business_name: "O'Brien & Đặng Cleaning",
  contact_name: "Siobhán O'Brien",
  email: "Siobhan@Example.com.au ",
  phone: "0400 000 000",
  website: "obrien-cleaning.com.au",
  interest: "website",
  message: "We clean offices in Orange and want online quote requests.",
  consent: true,
  honeypot: "",
  ...over,
});

describe("validateIntake", () => {
  it("keeps apostrophes, accents and ampersands; normalises email and website", () => {
    const v = validateIntake(good());
    expect(v.ok && !v.honeypot && v.value).toMatchObject({
      business_name: "O'Brien & Đặng Cleaning",
      contact_name: "Siobhán O'Brien",
      email: "siobhan@example.com.au",
      website: "https://obrien-cleaning.com.au",
    });
  });
  it("rejects bad input field by field", () => {
    const v = validateIntake(good({ email: "nope", interest: "seo", message: "hi", consent: false, idempotency_key: "x", website: "not a site" }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["_", "consent", "email", "interest", "message", "website"]);
  });
  it("treats a filled honeypot as a bot", () => {
    expect(validateIntake(good({ honeypot: "spam.example" }))).toEqual({ ok: true, honeypot: true });
  });
  it("strips control characters from names", () => {
    const v = validateIntake(good({ business_name: "Acme\u0000\u0007 Cleaning" }));
    expect(v.ok && !v.honeypot && v.value.business_name).toBe("Acme Cleaning");
  });
});

type Saved = Record<string, unknown> & { id: string };
function fakeStore(opts: { missingTable?: boolean; raceOnInsert?: boolean; recentCount?: number; markFailures?: number; dbRateLimited?: boolean; dbRateLimitedAfterTwin?: boolean; raceWinnerDied?: boolean } = {}) {
  let markFailuresLeft = opts.markFailures ?? 0;
  const rows: Saved[] = [];
  const marks: Array<{ id: string; notified_at: string | null; notify_error: string | null }> = [];
  let n = 0;
  const missing = { code: "PGRST205", message: "table not found" };
  const store: IntakeStore = {
    findByKey: async (key) =>
      opts.missingTable ? { data: null, error: missing } : { data: rows.find((r) => r.idempotency_key === key) ?? null, error: null },
    countRecentByIp: async () => ({ count: opts.recentCount ?? 0, error: null }),
    insert: async (row) => {
      if (opts.missingTable) return { data: null, error: missing };
      // The database trigger refused: a parallel burst got past the count.
      if (opts.dbRateLimited) return { data: null, error: { code: RATE_LIMITED_CODE, message: "rate limit reached" } };
      if (opts.dbRateLimitedAfterTwin) {
        // The same enquiry's twin submit took the IP's last slot first.
        rows.push({ ...row, id: "cccccccc-0000-4000-8000-000000000003", notified_at: "2026-10-05T01:00:00.000Z" });
        return { data: null, error: { code: RATE_LIMITED_CODE, message: "rate limit reached" } };
      }
      if (opts.raceOnInsert) {
        // Another request saved the same key between our check and insert.
        // By default the winner finished and alerted; raceWinnerDied: it saved, then died.
        rows.push({ ...row, id: "bbbbbbbb-0000-4000-8000-000000000002", notified_at: opts.raceWinnerDied ? null : "2026-10-05T01:00:00.000Z" });
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      const saved = { ...row, id: `aaaaaaaa-0000-4000-8000-00000000000${++n}` };
      rows.push(saved);
      return { data: { id: saved.id }, error: null };
    },
    markNotified: async (id, patch) => {
      marks.push({ id, ...patch });
      if (markFailuresLeft > 0) {
        markFailuresLeft--;
        return { error: { message: "update failed" } };
      }
      const saved = rows.find((r) => r.id === id);
      if (saved) Object.assign(saved, patch);
      return { error: null };
    },
  };
  return { store, rows, marks };
}
const deps = (store: IntakeStore | null, notifyOwner: IntakeDeps["notifyOwner"] = async () => ({ ok: true })): IntakeDeps => ({
  store,
  notifyOwner,
  now: () => new Date("2026-10-05T01:00:00Z"),
  meta: { ip: "203.0.113.7", ua: "test", host: "www.outbackconnections.com.au" },
  sleep: async () => {},
});

describe("processIntake", () => {
  it("saves one row, then alerts the owner with the reference only", async () => {
    const { store, rows, marks } = fakeStore();
    const notify = vi.fn(async () => ({ ok: true }));
    const res = await processIntake(good(), deps(store, notify));
    expect(res).toEqual({ ok: true, reference: referenceFor(rows[0].id), duplicate: false, notified: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ consent_ip: "203.0.113.7", origin_host: "www.outbackconnections.com.au" });
    expect(notify).toHaveBeenCalledWith(referenceFor(rows[0].id));
    expect(JSON.stringify(notify.mock.calls)).not.toMatch(/siobhan|0400|Orange/i);
    expect(marks[0]).toMatchObject({ notify_error: null, notified_at: "2026-10-05T01:00:00.000Z" });
  });

  it("a retried submit with the same key returns the first row and alerts nobody again", async () => {
    const { store, rows } = fakeStore();
    const notify = vi.fn(async () => ({ ok: true }));
    const first = await processIntake(good(), deps(store, notify));
    const again = await processIntake(good(), deps(store, notify));
    expect(rows).toHaveLength(1);
    expect(again).toEqual({ ok: true, reference: first.ok ? first.reference : "", duplicate: true, notified: false });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("a retry of a saved row whose alert never landed sends the alert now", async () => {
    const { store, rows, marks } = fakeStore();
    // The first request saved the row, then died before notifying.
    rows.push({ ...good(), idempotency_key: good().idempotency_key.toLowerCase(), id: "dddddddd-0000-4000-8000-000000000004", notified_at: null });
    const notify = vi.fn(async () => ({ ok: true }));
    const res = await processIntake(good(), deps(store, notify));
    expect(res).toEqual({ ok: true, reference: "DSE-DDDDDDDD", duplicate: true, notified: true });
    expect(rows).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith("DSE-DDDDDDDD");
    expect(marks[0]).toMatchObject({ id: "dddddddd-0000-4000-8000-000000000004", notify_error: null });
  });

  it("insert race where the winner saved then died: the loser waits, then sends the alert", async () => {
    const { store, marks } = fakeStore({ raceOnInsert: true, raceWinnerDied: true });
    const sleep = vi.fn(async () => {});
    const notify = vi.fn(async () => ({ ok: true }));
    const res = await processIntake(good(), { ...deps(store, notify), sleep });
    expect(res).toEqual({ ok: true, reference: "DSE-BBBBBBBB", duplicate: true, notified: true });
    expect(sleep).toHaveBeenCalledWith(ALERT_GRACE_MS);
    expect(notify).toHaveBeenCalledWith("DSE-BBBBBBBB");
    expect(marks[0]).toMatchObject({ id: "bbbbbbbb-0000-4000-8000-000000000002", notify_error: null });
  });

  it("a duplicate whose saving request alerts during the grace wait doesn't alert again", async () => {
    const { store, rows } = fakeStore();
    rows.push({ ...good(), idempotency_key: good().idempotency_key.toLowerCase(), id: "eeeeeeee-0000-4000-8000-000000000005", notified_at: null });
    const notify = vi.fn(async () => ({ ok: true }));
    // The in-flight request confirms its alert while we wait.
    const sleep = async () => { rows[0].notified_at = "2026-10-05T01:00:01.000Z"; };
    const res = await processIntake(good(), { ...deps(store, notify), sleep });
    expect(res).toEqual({ ok: true, reference: "DSE-EEEEEEEE", duplicate: true, notified: false });
    expect(notify).not.toHaveBeenCalled();
  });

  it("a retry after a failed alert tries again; once confirmed, further retries stay quiet", async () => {
    const { store } = fakeStore();
    const notify = vi.fn<IntakeDeps["notifyOwner"]>(async () => ({ ok: false, error: "down" }));
    await processIntake(good(), deps(store, notify));
    notify.mockImplementation(async () => ({ ok: true }));
    const second = await processIntake(good(), deps(store, notify));
    expect(second).toMatchObject({ duplicate: true, notified: true });
    const third = await processIntake(good(), deps(store, notify));
    expect(third).toMatchObject({ duplicate: true, notified: false });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("two simultaneous submits: the unique index loser returns the winner's row", async () => {
    const { store } = fakeStore({ raceOnInsert: true });
    const res = await processIntake(good(), deps(store));
    expect(res).toEqual({ ok: true, reference: "DSE-BBBBBBBB", duplicate: true, notified: false });
  });

  it("an alert failure keeps the lead and records why", async () => {
    const { store, rows, marks } = fakeStore();
    const res = await processIntake(good(), deps(store, async () => ({ ok: false, error: "500 resend down" })));
    expect(res).toMatchObject({ ok: true, notified: false });
    expect(rows).toHaveLength(1);
    expect(marks[0]).toMatchObject({ notified_at: null, notify_error: "500 resend down" });
  });

  it("an alert that throws also keeps the lead", async () => {
    const { store, rows, marks } = fakeStore();
    const res = await processIntake(good(), deps(store, async () => { throw new Error("network"); }));
    expect(res).toMatchObject({ ok: true, notified: false });
    expect(rows).toHaveLength(1);
    expect(marks[0].notify_error).toMatch(/network/);
  });

  it("a failed alert-state write is retried once", async () => {
    const { store, marks } = fakeStore({ markFailures: 1 });
    const log = vi.fn();
    const res = await processIntake(good(), { ...deps(store), log });
    expect(res).toMatchObject({ ok: true, notified: true });
    expect(marks).toHaveLength(2);
    expect(log).not.toHaveBeenCalled();
  });

  it("an alert-state write that keeps failing is logged with the reference; the lead is still saved", async () => {
    const { store, rows, marks } = fakeStore({ markFailures: 5 });
    const log = vi.fn();
    const res = await processIntake(good(), { ...deps(store, async () => ({ ok: false, error: "down" })), log });
    expect(res).toMatchObject({ ok: true, notified: false });
    expect(rows).toHaveLength(1);
    expect(marks).toHaveLength(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(referenceFor(rows[0].id)));
  });

  it("rate-limits a burst from one IP", async () => {
    const { store, rows } = fakeStore({ recentCount: RATE_MAX });
    const res = await processIntake(good(), deps(store));
    expect(res.ok).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it("a burst that passes the early count is still refused by the database trigger", async () => {
    const { store, rows } = fakeStore({ dbRateLimited: true });
    const notify = vi.fn(async () => ({ ok: true }));
    const res = await processIntake(good(), deps(store, notify));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors._).toMatch(/few enquiries/);
    expect(rows).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("a double submit at the IP cap returns the saved twin, not a rate-limit error", async () => {
    const { store } = fakeStore({ dbRateLimitedAfterTwin: true });
    const res = await processIntake(good(), deps(store));
    expect(res).toEqual({ ok: true, reference: "DSE-CCCCCCCC", duplicate: true, notified: false });
  });

  it("missing table or missing service key is a visible readiness error, not a silent drop", async () => {
    for (const store of [fakeStore({ missingTable: true }).store, null]) {
      const res = await processIntake(good(), deps(store));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors._).toMatch(/aren't open yet/);
    }
  });

  it("a bot gets a fake success and nothing is written or sent", async () => {
    const { store, rows } = fakeStore();
    const notify = vi.fn(async () => ({ ok: true }));
    const res = await processIntake(good({ honeypot: "x" }), deps(store, notify));
    expect(res.ok).toBe(true);
    expect(rows).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("owner search", () => {
  const row = {
    business_name: "O'Brien & Đặng Cleaning",
    contact_name: "Siobhán O'Brien",
    email: "siobhan@example.com.au",
    website: "https://obrien-cleaning.com.au",
    message: "Offices in Orange, NSW (two sites)",
  };
  it.each([
    ["spaces", "orange nsw"],
    ["@", "siobhan@example"],
    ["apostrophe", "o'brien"],
    ["Unicode with accents", "Siobhán"],
    ["Unicode folded", "dang cleaning"],
    ["commas and brackets", "(two"],
    ["empty", "   "],
  ])("matches %s", (_n, q) => expect(matchesSearch(row, q)).toBe(true));
  it("doesn't match an absent term", () => expect(matchesSearch(row, "brisbane")).toBe(false));
});

describe("owner queue paging and filters", () => {
  it("defaults to open leads so closed/spam can't bury them", () => {
    expect(statusesFor("")).toEqual(OPEN_STATUSES);
    expect(statusesFor("open")).toEqual(["new", "replied", "qualified"]);
    expect(statusesFor("garbage")).toEqual(OPEN_STATUSES);
  });
  it("'all' means no status filter; a single status filters to it", () => {
    expect(statusesFor("all")).toBeNull();
    expect(statusesFor("spam")).toEqual(["spam"]);
  });
  it("page numbers are sane", () => {
    expect(pageFrom(undefined)).toBe(1);
    expect(pageFrom("0")).toBe(1);
    expect(pageFrom("-3")).toBe(1);
    expect(pageFrom("abc")).toBe(1);
    expect(pageFrom("7")).toBe(7);
    expect(pageFrom("99999999")).toBe(10000);
  });
});

describe("pilot preview links", () => {
  it("links only well-formed preview tokens", () => {
    expect(previewHref("https://example.com", "0123456789abcdef0123")).toBe("https://example.com/preview/0123456789abcdef0123.html");
    expect(previewHref("https://example.com", null)).toBeNull();
    expect(previewHref("https://example.com", "../admin")).toBeNull();
  });
});

describe("outreach sender", () => {
  it("is named explicitly and verified only with a recorded test date", async () => {
    const { outreachSender } = await import("@/lib/digital-services/pilot");
    expect(outreachSender({})).toBeNull();
    expect(outreachSender({ DIGITAL_SERVICES_OUTREACH_SENDER: "josh@outbackconnections.com.au" })).toEqual({ address: "josh@outbackconnections.com.au", verified: false });
    expect(outreachSender({ DIGITAL_SERVICES_OUTREACH_SENDER: "josh@outbackconnections.com.au", DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON: "yes" })?.verified).toBe(false);
    expect(outreachSender({ DIGITAL_SERVICES_OUTREACH_SENDER: "josh@outbackconnections.com.au", DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON: "2026-10-07" })?.verified).toBe(true);
  });
});
