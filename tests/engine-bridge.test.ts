// The engine bridge with stand-in validators (the real ones are private; see
// tests/engine-flow.local.test.ts): not connected is said plainly, a validator's
// refusal is reported, a stale review is never current advice, and nothing
// the bridge returns is approved or sendable.
import { describe, expect, it } from "vitest";
import { checkCreatorOutput, checkReplyOutput, checkReviewOutput, type EngineContracts } from "@/lib/digital-services/engine-bridge";

const stub: EngineContracts = {
  validateCreator: (_p, o) => {
    const out = o as { results: unknown[] };
    if (!out.results.length) throw new Error("Creator result count must exactly match supplied jobs");
    return out.results;
  },
  validateReview: (_p, o) => o,
  validateReply: (_p, o) => o,
  hash: () => "x",
};
const creator = JSON.stringify({ results: [{ job_id: "j", prospect_id: "p", input_hash: "h", status: "draft", email: { subject: "S", body: "B" } }] });

describe("engine bridge", () => {
  it("without the private validators every output is held as not connected", () => {
    expect(checkCreatorOutput(null, {}, creator)).toMatchObject({ state: "not_connected" });
    expect(checkReplyOutput(null, {}, "{}")).toMatchObject({ state: "not_connected" });
    expect(checkReviewOutput(null, {}, "{}", { reviewed_draft_sha256: "a", current_draft_sha256: "a" })).toMatchObject({ state: "not_connected" });
  });
  it("valid creator output comes back as held drafts; a refusal or non-JSON is rejected with the reason", () => {
    const ok = checkCreatorOutput(stub, {}, creator);
    expect(ok).toMatchObject({ state: "held_for_owner", value: [{ job_id: "j", subject: "S", body: "B", status: "draft" }] });
    expect(ok.state === "held_for_owner" && ok.output_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(checkCreatorOutput(stub, {}, JSON.stringify({ results: [] }))).toEqual({ state: "rejected", error: "Creator result count must exactly match supplied jobs" });
    expect(checkCreatorOutput(stub, {}, "nope")).toEqual({ state: "rejected", error: "output is not JSON" });
  });
  it("a review of an older draft revision is stale before any validator runs", () => {
    const r = checkReviewOutput(stub, {}, JSON.stringify({ technical_verdict: "pass" }), { reviewed_draft_sha256: "a", current_draft_sha256: "b" });
    expect(r.state).toBe("stale");
    expect(checkReviewOutput(stub, {}, JSON.stringify({ technical_verdict: "hold", required_actions: ["x"] }), { reviewed_draft_sha256: "a", current_draft_sha256: "a" })).toMatchObject({
      state: "held_for_owner",
      value: { technical_verdict: "hold", required_actions: ["x"] },
    });
  });
});
