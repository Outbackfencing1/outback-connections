// Regression tests for the two emailed one-click routes: renew and
// unsubscribe. A GET never writes; only the confirm POST does; every
// outcome (including a failed save) is a visible page, never a silent
// redirect. Uses the real signed-token functions with a test secret and a
// stub database client.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.URL_SIGNING_SECRET = "test-secret";
});

type Call = { table: string; values: Record<string, unknown>; eq: [string, unknown] };
const db = vi.hoisted(() => ({
  available: true,
  listing: null as Record<string, unknown> | null,
  selectError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  updates: [] as Call[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    db.available
      ? {
          from: (table: string) => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: db.selectError ? null : db.listing, error: db.selectError }),
              }),
            }),
            update: (values: Record<string, unknown>) => ({
              eq: async (col: string, val: unknown) => {
                db.updates.push({ table, values, eq: [col, val] });
                return { error: db.updateError };
              },
            }),
          }),
        }
      : null,
}));

import { NextRequest } from "next/server";
import { signToken } from "@/lib/signed-tokens";
import { GET as renewGET, POST as renewPOST } from "@/app/listings/[id]/renew/route";
import { GET as unsubGET, POST as unsubPOST } from "@/app/unsubscribe/route";

const ORIGIN = "https://www.outbackconnections.com.au";
const OWNER = "user-1";
const LISTING = "listing-1";
const HOUR = 60 * 60 * 1000;

const renewToken = (over: Partial<{ p: string; u: string; l: string; ttlMs: number }> = {}) =>
  signToken({ p: "renew", u: OWNER, l: LISTING, ttlMs: HOUR, ...over });
const unsubToken = (over: Partial<{ p: string; u: string; ttlMs: number }> = {}) =>
  signToken({ p: "unsubscribe", u: OWNER, ttlMs: HOUR, ...over });
const tamper = (t: string) => {
  const [body, sig] = t.split(".");
  return `${body}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
};

const params = (id = LISTING) => ({ params: Promise.resolve({ id }) });
const getRenew = (token: string | null, id = LISTING) =>
  renewGET(new NextRequest(`${ORIGIN}/listings/${id}/renew${token === null ? "" : `?t=${encodeURIComponent(token)}`}`), params(id));
const postRenew = (token: string | null, id = LISTING) =>
  renewPOST(
    new NextRequest(`${ORIGIN}/listings/${id}/renew`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: token === null ? "" : new URLSearchParams({ t: token }).toString(),
    }),
    params(id)
  );
const unsubUrl = (token: string | null) => `${ORIGIN}/unsubscribe${token === null ? "" : `?t=${encodeURIComponent(token)}`}`;

beforeEach(() => {
  db.available = true;
  db.listing = { id: LISTING, user_id: OWNER, status: "expired", title: "Kings Fencing" };
  db.selectError = null;
  db.updateError = null;
  db.updates = [];
});

describe("renew link", () => {
  it("GET (the emailed link) shows a confirm page and writes nothing", async () => {
    const res = await getRenew(renewToken());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("One more click to renew");
    expect(html).toContain('action="/listings/listing-1/renew"');
    expect(html).toContain("Kings Fencing");
    expect(db.updates).toHaveLength(0);
  });

  it("POST from the confirm page renews, reactivates an expired listing, and says so", async () => {
    const res = await postRenew(renewToken());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Renewed");
    expect(db.updates).toHaveLength(1);
    const { table, values, eq } = db.updates[0];
    expect(table).toBe("listings");
    expect(eq).toEqual(["id", LISTING]);
    expect(values.status).toBe("active");
    const days = (Date.parse(String(values.expires_at)) - Date.now()) / (24 * HOUR);
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it("keeps an active listing active", async () => {
    db.listing = { ...db.listing, status: "active" };
    await postRenew(renewToken());
    expect(db.updates[0].values.status).toBe("active");
  });

  it("a failed save is a visible error page with a retry button, not a silent redirect", async () => {
    db.updateError = { message: "boom" };
    const res = await postRenew(renewToken());
    expect(res.status).toBe(500);
    expect(res.headers.get("location")).toBeNull();
    const html = await res.text();
    expect(html).toContain("We couldn&#39;t renew it");
    expect(html).toContain("Try again");
    expect(html).toContain('action="/listings/listing-1/renew"');
  });

  it("a failed lookup or a missing database client is a visible 500", async () => {
    db.selectError = { message: "down" };
    expect((await postRenew(renewToken())).status).toBe(500);
    db.selectError = null;
    db.available = false;
    const res = await getRenew(renewToken());
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("We couldn&#39;t renew it");
  });

  it.each([
    ["missing", null],
    ["malformed", "not-a-token"],
    ["tampered", "TAMPER"],
    ["wrong purpose", "PURPOSE"],
    ["other listing", "OTHER"],
  ])("refuses a %s token on GET and POST without writing", async (_name, kind) => {
    const token =
      kind === "TAMPER"
        ? tamper(renewToken())
        : kind === "PURPOSE"
          ? renewToken({ p: "unsubscribe" })
          : kind === "OTHER"
            ? renewToken({ l: "listing-2" })
            : kind;
    for (const res of [await getRenew(token), await postRenew(token)]) {
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("isn&#39;t valid");
    }
    expect(db.updates).toHaveLength(0);
  });

  it("refuses an expired token with its own message and a recovery that exists", async () => {
    const res = await postRenew(renewToken({ ttlMs: -1000 }));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("expired");
    // The dashboard can't renew a listing, so the page mustn't promise it can.
    expect(html).not.toMatch(/renew the listing from your dashboard/i);
    expect(html).toContain("help@outbackconnections.com.au");
    expect(db.updates).toHaveLength(0);
  });

  it("refuses a listing owned by someone else", async () => {
    db.listing = { ...db.listing, user_id: "user-2" };
    const res = await postRenew(renewToken());
    expect(res.status).toBe(403);
    expect(db.updates).toHaveLength(0);
  });

  it.each([
    ["closed", 409, "is closed"],
    ["hidden_flagged", 409, "can&#39;t be renewed from this link"],
    ["draft", 409, "can&#39;t be renewed from this link"],
  ])("refuses a %s listing on GET and POST instead of claiming it stays up", async (status, code, text) => {
    db.listing = { ...db.listing, status };
    for (const res of [await getRenew(renewToken()), await postRenew(renewToken())]) {
      expect(res.status).toBe(code);
      const html = await res.text();
      expect(html).toContain(text);
      expect(html).not.toContain("stays up");
    }
    expect(db.updates).toHaveLength(0);
  });

  it("refuses a deleted listing", async () => {
    db.listing = { ...db.listing, status: "deleted_by_user" };
    const res = await postRenew(renewToken());
    expect(res.status).toBe(410);
    expect(db.updates).toHaveLength(0);
  });
});

describe("unsubscribe link", () => {
  it("GET shows a confirm page and writes nothing", async () => {
    const token = unsubToken();
    const res = await unsubGET(new NextRequest(unsubUrl(token)));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Stop marketing emails");
    expect(html).toContain(`action="/unsubscribe?t=${encodeURIComponent(token)}"`);
    expect(db.updates).toHaveLength(0);
  });

  it.each([
    [
      "RFC 8058 one-click (url-encoded)",
      { "content-type": "application/x-www-form-urlencoded" },
      "List-Unsubscribe=One-Click",
    ],
    ["multipart form", undefined, (() => {
      const f = new FormData();
      f.set("List-Unsubscribe", "One-Click");
      return f;
    })()],
  ])("POST %s unsubscribes with no session or cookies", async (_name, headers, body) => {
    const res = await unsubPOST(new NextRequest(unsubUrl(unsubToken()), { method: "POST", headers, body }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.text()).toContain("unsubscribed");
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].table).toBe("user_profiles");
    expect(db.updates[0].eq).toEqual(["user_id", OWNER]);
    expect(db.updates[0].values.marketing_consent_revoked_at).toEqual(expect.any(String));
  });

  it("a failed save is a visible 500 with a retry button", async () => {
    db.updateError = { message: "boom" };
    const res = await unsubPOST(new NextRequest(unsubUrl(unsubToken()), { method: "POST" }));
    expect(res.status).toBe(500);
    const html = await res.text();
    expect(html).toContain("We couldn&#39;t unsubscribe you");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/dashboard/privacy"');
  });

  it.each([
    ["missing", null],
    ["malformed", "x.y"],
    ["tampered", "TAMPER"],
    ["wrong purpose", "PURPOSE"],
    ["expired", "EXPIRED"],
  ])("refuses a %s token on GET and POST without writing", async (_name, kind) => {
    const token =
      kind === "TAMPER"
        ? tamper(unsubToken())
        : kind === "PURPOSE"
          ? renewToken()
          : kind === "EXPIRED"
            ? unsubToken({ ttlMs: -1000 })
            : kind;
    for (const res of [
      await unsubGET(new NextRequest(unsubUrl(token))),
      await unsubPOST(new NextRequest(unsubUrl(token), { method: "POST" })),
    ]) {
      expect(res.status).toBe(400);
      // The fallback must lead to the page that actually revokes marketing
      // consent (RevokeMarketingForm on /dashboard/privacy).
      const html = await res.text();
      expect(html).toContain('href="/dashboard/privacy"');
      expect(html).not.toContain("/dashboard/settings");
    }
    expect(db.updates).toHaveLength(0);
  });
});
