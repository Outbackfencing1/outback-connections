// lib/digital-services/engine-bridge.ts
// The private engine's contract validators (creator, review, reply) applied
// to what the owner imports, without copying the engine into this public
// repository. The validators are passed in: on the owner's machine they are
// loaded from the private engine checkout (tests/engine-flow.local.test.ts
// shows how); the hosted app has no copy, so every check there reports
// "not_connected" and the draft stays held. Whatever the verdict, nothing is
// approved, sent or published here: a valid creator draft becomes a held
// draft revision, a review is advice for the owner, and a reply is a draft.
import { createHash } from "node:crypto";

export type EngineContracts = {
  validateCreator: (packet: unknown, output: unknown) => unknown[];
  validateReview: (packet: unknown, output: unknown) => unknown;
  validateReply: (packet: unknown, output: unknown) => unknown;
  hash: (value: unknown) => string;
};

export type CreatorDraft = { job_id: string; prospect_id: string; input_hash: string; status: string; subject: string; body: string };

export type EngineCheck<T> =
  | { state: "not_connected"; reason: string }
  | { state: "rejected"; error: string }
  | { state: "held_for_owner"; output_sha256: string; value: T };

const NOT_CONNECTED = "the private engine's validators aren't loaded here, so this output stays held unchecked";
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function run<T>(engine: EngineContracts | null, outputText: string, check: (output: unknown) => T): EngineCheck<T> {
  if (!engine) return { state: "not_connected", reason: NOT_CONNECTED };
  let output: unknown;
  try {
    output = JSON.parse(outputText);
  } catch {
    return { state: "rejected", error: "output is not JSON" };
  }
  try {
    return { state: "held_for_owner", output_sha256: sha(outputText), value: check(output) };
  } catch (e) {
    return { state: "rejected", error: (e as Error).message.slice(0, 300) };
  }
}

/** A creator output: every result checked against its job; drafts come back held, never approved. */
export function checkCreatorOutput(engine: EngineContracts | null, packet: unknown, outputText: string): EngineCheck<CreatorDraft[]> {
  return run(engine, outputText, (output) =>
    (engine!.validateCreator(packet, output) as Record<string, unknown>[]).map((r) => {
      const email = (r.email ?? {}) as { subject?: string; body?: string };
      return {
        job_id: String(r.job_id),
        prospect_id: String(r.prospect_id),
        input_hash: String(r.input_hash),
        status: String(r.status),
        subject: email.subject ?? "",
        body: email.body ?? "",
      };
    })
  );
}

/**
 * A review output, bound to the draft revision it was written about. A
 * review of an older revision is stale and is not shown as current advice.
 */
export function checkReviewOutput(
  engine: EngineContracts | null,
  packet: unknown,
  outputText: string,
  bound: { reviewed_draft_sha256: string; current_draft_sha256: string }
): EngineCheck<{ technical_verdict: string; required_actions: unknown[] }> | { state: "stale"; reason: string } {
  if (bound.reviewed_draft_sha256 !== bound.current_draft_sha256) return { state: "stale", reason: "the draft changed after this review was prepared; review the current revision" };
  return run(engine, outputText, (output) => {
    const r = engine!.validateReview(packet, output) as { technical_verdict: string; required_actions?: unknown[] };
    return { technical_verdict: r.technical_verdict, required_actions: r.required_actions ?? [] };
  });
}

/** A reply output: always a draft for the owner; an opt-out is surfaced, never answered. */
export function checkReplyOutput(
  engine: EngineContracts | null,
  packet: unknown,
  outputText: string
): EngineCheck<{ intent: string; suppress_contact: boolean; owner_action_required: boolean }> {
  return run(engine, outputText, (output) => {
    const r = engine!.validateReply(packet, output) as { intent: string; suppress_contact: boolean; owner_action_required: boolean };
    return { intent: r.intent, suppress_contact: r.suppress_contact, owner_action_required: r.owner_action_required };
  });
}
