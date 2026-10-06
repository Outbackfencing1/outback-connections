// The cron route's own rules: bearer-header auth only, and a dry run that
// sends nothing. The run itself is covered in staff-post-cleanup.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Receipt } from "@/lib/staff-post-cleanup";

const sendEmail = vi.fn(async () => ({ ok: true }));
const runCleanup = vi.fn();

vi.mock("@/lib/email", () => ({
  DEFAULT_FROM: "from@example.test",
  NOTIFICATION_TO: "team@example.test",
  escapeHtml: (s: string) => s,
  sendEmail: (...a: unknown[]) => sendEmail(...(a as [])),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/staff-post-cleanup", async (orig) => ({
  ...(await orig<typeof import("@/lib/staff-post-cleanup")>()),
  runCleanup: (...a: unknown[]) => runCleanup(...a),
}));

const busyReceipt = (dry: boolean): Receipt => ({
  ok: true,
  dry,
  sweep: { seen: 3, cleared: dry ? 0 : 3, skipped: 0 },
  recover: { seen: 0, originals_fixed: 0, enquiries_moved: 0 },
  adopt: { seen: 2, adopted: dry ? 0 : 2, held: 0, skipped: 0 },
  errors: [],
  stopped_early: false,
  more_work: true,
  remaining: { closed_with_contact: 0, active_candidates: 4, stranded_originals: 0 },
  elapsed_ms: 10,
  adopted_titles: dry ? [] : ["A Fencing", "B Fencing"],
  held: [],
});

const req = (path: string, auth?: string) =>
  new NextRequest(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/adopt-staff-posts", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret-for-tests");
    sendEmail.mockClear();
    runCleanup.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects no header, a wrong header and the secret in the URL", async () => {
    const { GET } = await import("@/app/api/cron/adopt-staff-posts/route");
    for (const r of [
      req("/api/cron/adopt-staff-posts"),
      req("/api/cron/adopt-staff-posts", "Bearer nope"),
      req("/api/cron/adopt-staff-posts?k=s3cret-for-tests"),
      req("/api/cron/adopt-staff-posts?dry=1&k=s3cret-for-tests"),
    ]) {
      const res = await GET(r);
      expect(res.status).toBe(401);
    }
    expect(runCleanup).not.toHaveBeenCalled();
  });

  it("dry run passes dry through and sends no email", async () => {
    runCleanup.mockResolvedValue(busyReceipt(true));
    const { GET } = await import("@/app/api/cron/adopt-staff-posts/route");
    const res = await GET(req("/api/cron/adopt-staff-posts?dry=1", "Bearer s3cret-for-tests"));
    expect(res.status).toBe(200);
    expect(runCleanup).toHaveBeenCalledWith(expect.anything(), { dry: true });
    expect(sendEmail).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toMatchObject({ dry: true, more_work: true });
    expect(body).not.toHaveProperty("adopted_titles");
  });

  it("a real run reports counts and emails the team once", async () => {
    runCleanup.mockResolvedValue(busyReceipt(false));
    const { GET } = await import("@/app/api/cron/adopt-staff-posts/route");
    const res = await GET(req("/api/cron/adopt-staff-posts", "Bearer s3cret-for-tests"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sweep: { cleared: 3 }, adopt: { adopted: 2 }, more_work: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = (sendEmail.mock.calls[0] as unknown as [{ subject: string; text: string }])[0];
    expect(mail.subject).toBe("Directory clean-up: 2 published, 0 held, more to do");
    expect(mail.text).toContain("Cleared phone/email from 3 closed posts");
  });

  it("a failed team email is reported, not hidden", async () => {
    runCleanup.mockResolvedValue(busyReceipt(false));
    sendEmail.mockRejectedValueOnce(new Error("smtp down for team@example.test"));
    const { GET } = await import("@/app/api/cron/adopt-staff-posts/route");
    const body = await (await GET(req("/api/cron/adopt-staff-posts", "Bearer s3cret-for-tests"))).json();
    expect(body.ok).toBe(false);
    expect(body.errors[0].message).toBe("team email not sent: Error: smtp down for [email]");
  });

  it("a team email that never answers is aborted at its reserved window and reported", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      runCleanup.mockResolvedValue(busyReceipt(false));
      let signal: AbortSignal | undefined;
      sendEmail.mockImplementationOnce(((opts: { signal?: AbortSignal }) => {
        signal = opts.signal;
        return new Promise(() => {});
      }) as never);
      const { GET, maxDuration } = await import("@/app/api/cron/adopt-staff-posts/route");
      const { NOTIFY_BUDGET_MS } = await import("@/lib/staff-post-cleanup");
      const t0 = Date.now();
      const pending = GET(req("/api/cron/adopt-staff-posts", "Bearer s3cret-for-tests"));
      await vi.advanceTimersByTimeAsync(NOTIFY_BUDGET_MS);
      const body = await (await pending).json();
      expect(Date.now() - t0).toBe(NOTIFY_BUDGET_MS);
      expect(NOTIFY_BUDGET_MS).toBeLessThan(maxDuration * 1000);
      expect(signal?.aborted).toBe(true);
      expect(body.ok).toBe(false);
      expect(body.errors[0].message).toBe("team email not sent: Error: no answer within 8s");
    } finally {
      vi.useRealTimers();
    }
  });
});

