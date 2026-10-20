import { describe, expect, it, vi } from "vitest";
import {
  PENDING_LISTING_STATUSES,
  executePendingListingApproval,
  isValidListingId,
} from "@/lib/pending-approval";

function createMockAdmin(result: {
  data: { id: string; status: string } | null;
  error: { message: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const inFn = vi.fn().mockReturnValue({ select });
  const eq = vi.fn().mockReturnValue({ in: inFn });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });

  return {
    client: { from },
    spies: { from, update, eq, inFn, select, maybeSingle },
  };
}

describe("isValidListingId", () => {
  it("accepts valid UUIDs and rejects non-UUID strings or non-strings", () => {
    expect(isValidListingId("34b05ffe-c3b6-4fa9-8b97-dd4e8a06af93")).toBe(true);
    expect(isValidListingId("")).toBe(false);
    expect(isValidListingId("not-a-uuid")).toBe(false);
    expect(isValidListingId(null)).toBe(false);
  });
});

describe("executePendingListingApproval", () => {
  const validId = "34b05ffe-c3b6-4fa9-8b97-dd4e8a06af93";

  it("rejects crafted non-UUID listing IDs before querying the database", async () => {
    const { client, spies } = createMockAdmin({ data: null, error: null });
    const res = await executePendingListingApproval(client, "12345; DROP TABLE listings");
    expect(res).toEqual({
      ok: false,
      reason: "invalid_id",
      flash: "Invalid listing ID.",
    });
    expect(spies.from).not.toHaveBeenCalled();
  });

  it("requires status to be in ('pending_review', 'pending_verification') and rejects closed/deleted/already-active rows", async () => {
    const { client, spies } = createMockAdmin({ data: null, error: null });
    const res = await executePendingListingApproval(client, validId);

    expect(spies.from).toHaveBeenCalledWith("listings");
    expect(spies.update).toHaveBeenCalledWith({ status: "active" });
    expect(spies.eq).toHaveBeenCalledWith("id", validId);
    expect(spies.inFn).toHaveBeenCalledWith("status", PENDING_LISTING_STATUSES);
    expect(spies.select).toHaveBeenCalledWith("id, status");
    expect(res).toEqual({
      ok: false,
      reason: "not_pending",
      flash:
        "Listing is no longer pending verification (already approved or status changed).",
    });
  });

  it("approves a genuinely pending listing and returns ok: true", async () => {
    const { client, spies } = createMockAdmin({
      data: { id: validId, status: "active" },
      error: null,
    });
    const res = await executePendingListingApproval(client, validId);

    expect(spies.inFn).toHaveBeenCalledWith("status", [
      "pending_review",
      "pending_verification",
    ]);
    expect(res).toEqual({
      ok: true,
      id: validId,
      flash: "Listing approved and published live.",
    });
  });

  it("surfaces database errors distinctly from stale state", async () => {
    const { client } = createMockAdmin({
      data: null,
      error: { message: "connection timeout" },
    });
    const res = await executePendingListingApproval(client, validId);
    expect(res).toEqual({
      ok: false,
      reason: "db_error",
      flash: "Couldn't approve listing.",
      errorMessage: "connection timeout",
    });
  });
});
