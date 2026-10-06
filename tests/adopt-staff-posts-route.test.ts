// /api/cron/adopt-staff-posts route wiring: cron auth, dry run is zero-write
// and zero-send, a real run emails the team an aggregate receipt, and a slow
// email can't hold the reply. The store and email are mocked; the store's
// own behaviour is in staff-post-cleanup.test.ts and the local-stack run.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CleanupStore } from "@/lib/staff-post-cleanup";

const STAFF = "44444444-4444-4444-8444-444444444444";
const writes: string[] = [];
const sendEmail = vi.fn();
const createAdminClient = vi.fn(() => ({}));

function fakeStore(): CleanupStore {
  const ok = (name: string) => async () => {
    writes.push(name);
    return { ok: true as const, changed: true };
  };
  const closed = { id: "c1", title: "Legacy Closed Fixture", postcode: "2800", state: "NSW", contact_phone: "0400 000 041", contact_email: "fixture41@example.test", source_url: null, user_id: STAFF };
  let done = false;
  return {
    staffIds: async () => [STAFF],
    closedWithContact: async () => (done ? [] : [closed]),
    adoptedOriginals: async () => [],
    enquiryCounts: async () => new Map(),
    activeCandidates: async () => [],
    archiveContact: ok("archiveContact"),
    clearClosedContact: async () => {
      writes.push("clearClosedContact");
      done = true;
      return { ok: true, changed: true };
    },
    findExisting: async () => null,
    ingest: async () => {
      writes.push("ingest");
      return { ok: false, error: "unexpected" };
    },
    labelCopy: ok("labelCopy"),
    businessOf: async () => null,
    moveEnquiries: async () => {
      writes.push("moveEnquiries");
      return { ok: true, moved: 0 };
    },
    closeAdopted: ok("closeAdopted"),
    closeHeld: ok("closeHeld"),
    remaining: async () => ({ active: 0, closedWithContact: done ? 0 : 1, enquiriesOnClosed: 0 }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createAdminClient() }));
vi.mock("@/lib/staff-post-cleanup-store", () => ({ supabaseCleanupStore: () => fakeStore() }));
vi.mock("@/lib/email", () => ({
  DEFAULT_FROM: "from@example.test",
  NOTIFICATION_TO: "team@example.test",
  escapeHtml: (s: string) => s,
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

const SECRET = "local-test-secret-not-real";
const req = (opts: { auth?: string; dry?: boolean } = {}) =>
  new NextRequest(`http://localhost/api/cron/adopt-staff-posts${opts.dry ? "?dry=1" : ""}`, { headers: opts.auth ? { authorization: opts.auth } : {} });

describe("/api/cron/adopt-staff-posts", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    writes.length = 0;
    sendEmail.mockReset();
    createAdminClient.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("rejects a call without the cron secret, or with a wrong one, before touching anything", async () => {
    const { GET } = await import("@/app/api/cron/adopt-staff-posts/route");
    for (const auth of [undefined, "Bearer wrong", `Basic ${SECRET}`, SECRET]) {
      const res = await GET(req({ auth }));
      expect(res.status).toBe(401);
    }
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("is closed in production when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("@/app/api/cron/adopt-staff-posts/route");
    expect((await GET(req())).status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("dry run: plans, writes nothing and sends nothing", async () => {
    const { GET } = await import("@/app/api/cron/adopt-staff-posts/route");
    const res = await GET(req({ auth: `Bearer ${SECRET}`, dry: true }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.dry).toBe(true);
    expect(body.plan.closed_rows_to_clear_contact).toBe(1);
    expect(body.notified).toBe("skipped");
    expect(writes).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/0400 000|example\.test/);
  });

  it("real run: archives before clearing, emails an aggregate receipt with no contact values", async () => {
    sendEmail.mockResolvedValue({ ok: true });
    const { GET } = await import("@/app/api/cron/adopt-staff-posts/route");
    const res = await GET(req({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(writes).toEqual(["archiveContact", "clearClosedContact"]);
    expect(body.swept.cleared).toBe(1);
    expect(body.more_work).toBe(false);
    expect(body.notified).toBe("sent");
    const mail = sendEmail.mock.calls[0][0] as { text: string; to: string };
    expect(mail.to).toBe("team@example.test");
    expect(mail.text).toContain("1 closed posts cleared of phone/email");
    expect(mail.text + JSON.stringify(body)).not.toMatch(/0400 000|fixture41@/);
  });

  it("a hung email can't hold the reply past its timeout", async () => {
    vi.useFakeTimers();
    sendEmail.mockReturnValue(new Promise(() => {}));
    const { GET } = await import("@/app/api/cron/adopt-staff-posts/route");
    const pending = GET(req({ auth: `Bearer ${SECRET}` }));
    await vi.advanceTimersByTimeAsync(8_100);
    const body = await (await pending).json();
    expect(body.notified).toBe("timed_out");
    expect(body.swept.cleared).toBe(1);
  });
});
