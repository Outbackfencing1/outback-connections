// The owner's status change: only a confirmed database save is reported as
// saved; failures and missing rows are visible and nothing is revalidated.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyStatusChange, queueViewParams } from "@/lib/digital-services/queue";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("applyStatusChange", () => {
  it("is saved only when the updated row comes back with the new status", async () => {
    const update = vi.fn(async () => ({ data: [{ id: ID, status: "replied" }], error: null }));
    expect(await applyStatusChange({ id: ID, status: "replied" }, update)).toBe("saved");
    expect(update).toHaveBeenCalledWith(ID, "replied");
  });
  it("a database error is a visible failure, not a success", async () => {
    expect(await applyStatusChange({ id: ID, status: "replied" }, async () => ({ data: null, error: { message: "permission denied" } }))).toBe("failed");
  });
  it("a thrown client error is a failure", async () => {
    expect(await applyStatusChange({ id: ID, status: "replied" }, async () => { throw new Error("network"); })).toBe("failed");
  });
  it("zero updated rows means the enquiry no longer exists", async () => {
    expect(await applyStatusChange({ id: ID, status: "closed" }, async () => ({ data: [], error: null }))).toBe("not_found");
  });
  it("rejects malformed ids and unknown statuses without touching the database", async () => {
    const update = vi.fn();
    expect(await applyStatusChange({ id: "1; drop table", status: "closed" }, update)).toBe("invalid");
    expect(await applyStatusChange({ id: ID, status: "deleted" }, update)).toBe("invalid");
    expect(await applyStatusChange({ id: null, status: null }, update)).toBe("invalid");
    expect(update).not.toHaveBeenCalled();
  });
  it("no database client is reported, not hidden", async () => {
    expect(await applyStatusChange({ id: ID, status: "closed" }, null)).toBe("unavailable");
  });
});

describe("queueViewParams", () => {
  it("keeps only q, status and page from the posted view", () => {
    expect(queueViewParams("status=all&q=pat&page=2&notice=saved&next=https://evil.example").toString()).toBe("q=pat&status=all&page=2");
    expect(queueViewParams(undefined).toString()).toBe("");
  });
});

// The server action itself, with the owner gate and Next's redirect mocked.
const access = vi.hoisted(() => ({ ok: true as boolean }));
const db = vi.hoisted(() => ({ result: { data: [] as unknown[] | null, error: null as { message: string } | null }, calls: 0 }));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/digital-services/owner", () => ({
  getOwnerAccess: async () => (access.ok ? { ok: true, userId: "owner" } : { ok: false, reason: "forbidden" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: () => ({ eq: () => ({ select: async () => { db.calls++; return db.result; } }) }),
    }),
  }),
}));

async function post(fields: Record<string, string>): Promise<string> {
  const { setEnquiryStatus } = await import("@/app/dashboard/owner/actions");
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    await setEnquiryStatus(fd);
  } catch (e) {
    return (e as { url: string }).url;
  }
  throw new Error("expected a redirect");
}

describe("setEnquiryStatus action", () => {
  beforeEach(() => {
    access.ok = true;
    db.calls = 0;
    revalidate.mockClear();
  });

  it("anyone but the owner is sent back to the gated page and nothing is written", async () => {
    access.ok = false;
    expect(await post({ id: ID, status: "closed" })).toBe("/dashboard/owner");
    expect(db.calls).toBe(0);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("a confirmed save revalidates and says saved, keeping the owner's view", async () => {
    db.result = { data: [{ id: ID, status: "closed" }], error: null };
    const url = await post({ id: ID, status: "closed", view: "status=all&page=2" });
    expect(url).toBe("/dashboard/owner?status=all&page=2&notice=saved&ref=DSE-0F8FAD5B");
    expect(revalidate).toHaveBeenCalledWith("/dashboard/owner");
  });

  it("a refused write says failed and does not revalidate as if it worked", async () => {
    db.result = { data: null, error: { message: "permission denied" } };
    expect(await post({ id: ID, status: "closed" })).toBe("/dashboard/owner?notice=failed&ref=DSE-0F8FAD5B");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("a missing row says not found", async () => {
    db.result = { data: [], error: null };
    expect(await post({ id: ID, status: "closed" })).toBe("/dashboard/owner?notice=not_found&ref=DSE-0F8FAD5B");
    expect(revalidate).not.toHaveBeenCalled();
  });
});
