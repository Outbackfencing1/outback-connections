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
const rpc = vi.hoisted(() => ({ result: { data: "appr-1" as string | null, error: null as { code?: string; message: string } | null }, calls: [] as unknown[] }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    rpc: async (name: string, args: unknown) => {
      rpc.calls.push([name, args]);
      return rpc.result;
    },
  }),
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

const SHA = "a".repeat(64);
async function approve(fields: Record<string, string>): Promise<string> {
  const { approvePilotMessage } = await import("@/app/dashboard/owner/actions");
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    await approvePilotMessage(fd);
  } catch (e) {
    return (e as { url: string }).url;
  }
  throw new Error("expected a redirect");
}

describe("approvePilotMessage action", () => {
  beforeEach(() => {
    access.ok = true;
    rpc.calls = [];
    rpc.result = { data: "appr-1", error: null };
    revalidate.mockClear();
  });

  it("anyone but the owner is sent back to the gated page and nothing is called", async () => {
    access.ok = false;
    expect(await approve({ draft_id: ID, draft_sha256: SHA })).toBe("/dashboard/owner");
    expect(rpc.calls).toHaveLength(0);
  });

  it("calls the database function with the owner's own session for that exact revision", async () => {
    expect(await approve({ draft_id: ID, draft_sha256: SHA, view: "status=all" })).toBe("/dashboard/owner?status=all&pilot=approved");
    expect(rpc.calls).toEqual([["approve_pilot_message", { p_draft_id: ID, p_draft_sha256: SHA }]]);
    expect(revalidate).toHaveBeenCalled();
  });

  it("a database refusal is shown as refused, not approved", async () => {
    rpc.result = { data: null, error: { code: "OC403", message: "reviews come first" } };
    expect(await approve({ draft_id: ID, draft_sha256: SHA })).toBe("/dashboard/owner?pilot=refused");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("no approval id back is a failure, never 'approved'", async () => {
    rpc.result = { data: null, error: null };
    expect(await approve({ draft_id: ID, draft_sha256: SHA })).toBe("/dashboard/owner?pilot=failed");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("an approval conflict by a different owner is refused", async () => {
    rpc.result = { data: null, error: { code: "OC409", message: "different owner" } };
    expect(await approve({ draft_id: ID, draft_sha256: SHA })).toBe("/dashboard/owner?pilot=refused");
  });

  it("malformed input never reaches the database", async () => {
    expect(await approve({ draft_id: "x", draft_sha256: SHA })).toBe("/dashboard/owner?pilot=invalid");
    expect(await approve({ draft_id: ID, draft_sha256: "short" })).toBe("/dashboard/owner?pilot=invalid");
    expect(rpc.calls).toHaveLength(0);
  });
});
