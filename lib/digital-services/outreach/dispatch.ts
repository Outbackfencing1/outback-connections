// lib/digital-services/outreach/dispatch.ts
// First-contact dispatch, reconciliation and reply sync for the pilot. NOT
// wired to any route, button or schedule: nothing in the app calls it. Using
// it needs, all at once: DIGITAL_SERVICES_OUTREACH_SENDING=on, a connected
// Gmail mailbox (gmail.ts), a verified sender alias that isn't help@, and a
// company passing every first-contact rule (dispatch-guard.ts, re-checked
// by the database on the intent record).
//
// Order of operations, so a send is never duplicated or lost:
//   1. guard → 2. record a 'send_attempt' with our own Message-ID (the
//   database refuses it unless every rule holds and no earlier attempt is
//   unresolved) → 3. record a 'send_handoff' marker (from here on Gmail may
//   have the message) → 4. send → 5. record 'contacted' with Gmail's ids, or
//   'send_failed' on a definite refusal. An unknown outcome leaves the attempt
//   unresolved; reconcileAttempt() looks for it in the mailbox. A handed-off
//   attempt is never closed as "not sent" on an empty search (Gmail's search
//   can lag), only on a definite refusal, and it is never resent blindly.
import { firstContactHolds, type Hold, type Lane, type PilotApproval, type PilotCompany, type PilotDraft, type PilotEvent } from "../dispatch-guard";
import { outreachSender } from "../pilot";
import { isTransportCode } from "../queue";
import { GmailError, accessToken, buildRaw, confirmSendAs, findSent, gmailConfig, messageMeta, newMessageId, searchMessages, sendRaw, threadMessages, type Fetch } from "./gmail";

export type StoredEvent = PilotEvent & {
  occurred_at: string;
  lane?: Lane | null;
  draft_id?: string | null;
  provider_thread_id?: string | null;
  sender?: string | null;
  /** The address the attempt was sent to, frozen on the attempt (the company's address may change later). */
  recipient?: string | null;
};
export type CompanyState = {
  company: PilotCompany;
  drafts: PilotDraft[];
  approvals: PilotApproval[];
  events: StoredEvent[];
  ownerUserId: string | null;
};
export type NewEvent = {
  company_id: string;
  kind: "send_attempt" | "send_handoff" | "send_failed" | "contacted" | "replied" | "opted_out" | "bounced";
  lane?: Lane;
  draft_id?: string | null;
  sender?: string;
  recipient?: string | null;
  rfc822_message_id?: string | null;
  provider_message_id?: string | null;
  provider_thread_id?: string | null;
  recorded_by: string;
  note?: string;
};
export type InsertResult = { error: { code?: string; message: string } | null };
export type SyncRun = { status: "ok" | "incomplete" | "failed"; finished_at: string };
export type NewSyncRun = SyncRun & { started_at: string; checked: number; recorded: number; problems: number; note: string | null };
export interface OutreachStore {
  load(companyId: string): Promise<CompanyState | null>;
  insertEvent(e: NewEvent): Promise<InsertResult>;
  /** Every company with a recorded first contact, for reply sync. */
  contacted(): Promise<{ company_id: string; events: StoredEvent[] }[]>;
  /** The latest recorded reply-sync run (null if none, or unreadable). */
  lastSync(): Promise<SyncRun | null>;
  recordSync(run: NewSyncRun): Promise<InsertResult>;
}

/** A dispatch needs a complete reply sync this recent, so a missed opt-out or bounce can't be sent past. */
export const SYNC_MAX_AGE_HOURS = 6;
export function replySyncHealthy(last: SyncRun | null, now: Date): boolean {
  if (!last || last.status !== "ok") return false;
  const t = Date.parse(last.finished_at);
  return !Number.isNaN(t) && t <= now.getTime() + 60_000 && now.getTime() - t <= SYNC_MAX_AGE_HOURS * 3_600_000;
}

type Env = Record<string, string | undefined>;
type Deps = { store: OutreachStore; env?: Env; fetch?: Fetch; now?: () => Date; messageId?: () => string };

export type DispatchResult =
  | { status: "disabled" | "not_connected" | "sender_not_send_as" | "unknown_company" }
  | { status: "held"; holds: (Hold | "reply_sync_unhealthy")[] }
  | { status: "refused"; reason: string } // the database refused the intent record: nothing sent
  | { status: "not_sent"; reason: string } // intent couldn't be confirmed, so nothing was sent
  | { status: "not_sent_unrecorded"; messageId: string; reason: string; proof: NotSentProof } // nothing sent, but closing the attempt failed: closeAttemptNotSent() with this proof
  | { status: "sent"; messageId: string; providerId: string; threadId: string }
  | { status: "sent_unrecorded"; messageId: string } // sent, but recording it failed: reconcile
  | { status: "failed"; reason: string } // Gmail refused it: nothing sent
  | { status: "failed_unrecorded"; messageId: string; reason: string; refusal: NotSentProof } // refused, but the record failed: closeAttemptNotSent() with this refusal
  | { status: "unconfirmed"; messageId: string }; // may have been sent: reconcile, never resend

const RECORDER = "outreach-dispatch";

type Insert = "ok" | "duplicate" | "refused" | "unknown";

/**
 * ok: saved. duplicate: the same event was already recorded (first try) —
 * not a failure for idempotent events. refused: the database said no.
 * unknown: transport failure after a retry.
 */
async function insert(store: OutreachStore, e: NewEvent): Promise<Insert> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await store.insertEvent(e);
      if (!error) return "ok";
      // A duplicate on the retry is our own first try having committed, except
      // for a send attempt or handoff, where it could be another dispatcher's row.
      if (error.code === "23505") return attempt > 0 ? (e.kind === "send_attempt" || e.kind === "send_handoff" ? "unknown" : "ok") : "duplicate";
      if (error.code && !isTransportCode(error.code)) return "refused";
    } catch {
      // transport failure: retry once (inserts here are unique, so a repeat can't double-record)
    }
  }
  return "unknown";
}

const latestDraft = (state: CompanyState) =>
  state.drafts.filter((d) => d.company_id === state.company.id).sort((a, b) => b.revision - a.revision)[0] ?? null;

export async function dispatchFirstContact(companyId: string, lane: Lane, deps: Deps): Promise<DispatchResult> {
  const env = deps.env ?? process.env;
  const f = deps.fetch ?? fetch;
  if (env.DIGITAL_SERVICES_OUTREACH_SENDING?.trim() !== "on") return { status: "disabled" };
  const cfg = gmailConfig(env);
  const sender = outreachSender(env);
  if (!cfg) return { status: "not_connected" };

  const state = await deps.store.load(companyId);
  if (!state) return { status: "unknown_company" };
  const draft = latestDraft(state);
  const holds = firstContactHolds({
    lane,
    company: state.company,
    drafts: state.drafts,
    draftId: draft?.id ?? null,
    approvals: state.approvals,
    events: state.events,
    sender,
    ownerUserId: state.ownerUserId,
  });
  // A reply sync that failed, was incomplete or is stale may have missed an
  // opt-out or bounce: nothing is dispatched until a complete one is recorded.
  let lastSync: SyncRun | null = null;
  try {
    lastSync = await deps.store.lastSync();
  } catch {
    lastSync = null;
  }
  const allHolds: (Hold | "reply_sync_unhealthy")[] = [...holds];
  if (!replySyncHealthy(lastSync, (deps.now ?? (() => new Date()))())) allHolds.push("reply_sync_unhealthy");
  if (allHolds.length || !draft || !sender || !state.company.contact_address) return { status: "held", holds: allHolds };

  const token = await accessToken(cfg, f);
  if (!(await confirmSendAs(token, sender.address, f))) return { status: "sender_not_send_as" };

  const messageId = (deps.messageId ?? newMessageId)();
  // The recipient is frozen on every record of this attempt: reconciliation
  // searches for what was actually sent, even if the company's address changes.
  const recipient = state.company.contact_address;
  const base = { company_id: companyId, lane, draft_id: draft.id, sender: sender.address, recipient, rfc822_message_id: messageId, recorded_by: RECORDER };
  const intent = await insert(deps.store, { ...base, kind: "send_attempt" });
  if (intent === "refused" || intent === "duplicate") return { status: "refused", reason: "the database refused the send attempt" };
  if (intent === "unknown") {
    // We never send without a confirmed intent record. If the record did land,
    // close it as not sent so it doesn't block the company forever.
    const closed = await insert(deps.store, { ...base, kind: "send_failed", note: "not sent: intent record unconfirmed" });
    // Only a confirmed closure is "not sent". A refusal can mean the intent
    // never landed, but it can equally be a permission or policy refusal that
    // leaves a landed attempt open (blocking the company), so it's reported as
    // unrecorded with the never-called proof, like the handoff path below.
    if (closed !== "ok" && closed !== "duplicate") {
      return { status: "not_sent_unrecorded", messageId, reason: "the send attempt couldn't be confirmed", proof: { neverCalled: true, messageId } };
    }
    return { status: "not_sent", reason: "the send attempt couldn't be confirmed" };
  }
  // From the handoff marker on, Gmail may have the message. Without a
  // confirmed marker we don't call Gmail, so the attempt can be closed safely.
  const handoff = await insert(deps.store, { ...base, kind: "send_handoff" });
  if (handoff !== "ok") {
    const closed = await insert(deps.store, { ...base, kind: "send_failed", note: "not sent: handoff marker unconfirmed" });
    if (closed !== "ok" && closed !== "duplicate") {
      return { status: "not_sent_unrecorded", messageId, reason: "the handoff marker couldn't be confirmed", proof: { neverCalled: true, messageId } };
    }
    return { status: "not_sent", reason: "the handoff marker couldn't be confirmed" };
  }

  let sent: { id: string; threadId: string };
  try {
    const raw = buildRaw({ from: sender.address, to: recipient, subject: draft.subject, body: draft.body, messageId, date: (deps.now ?? (() => new Date()))() });
    sent = await sendRaw(token, raw, f);
  } catch (e) {
    if (e instanceof GmailError && e.outcome === "definite") {
      const closed = await insert(deps.store, { ...base, kind: "send_failed", note: e.message.slice(0, 300) });
      // Until the refusal is recorded the attempt stays open (and blocks the
      // company), so say so rather than reporting a clean failure.
      if (closed !== "ok" && closed !== "duplicate") return { status: "failed_unrecorded", messageId, reason: e.message, refusal: { status: e.status ?? 400, message: e.message, messageId } };
      return { status: "failed", reason: e.message };
    }
    return { status: "unconfirmed", messageId };
  }
  const recorded = await insert(deps.store, { ...base, kind: "contacted", provider_message_id: sent.id, provider_thread_id: sent.threadId });
  if (recorded !== "ok" && recorded !== "duplicate") return { status: "sent_unrecorded", messageId };
  return { status: "sent", messageId, providerId: sent.id, threadId: sent.threadId };
}

export type ReconcileResult =
  | { status: "nothing_unresolved" | "not_connected" | "unknown_company" }
  | { status: "recorded"; providerId: string }
  | { status: "ambiguous" | "not_found" | "record_failed"; messageId: string };

/** Find an unresolved attempt's message in the mailbox and record what happened. */
export async function reconcileAttempt(companyId: string, deps: Deps): Promise<ReconcileResult> {
  const env = deps.env ?? process.env;
  const f = deps.fetch ?? fetch;
  const cfg = gmailConfig(env);
  if (!cfg) return { status: "not_connected" };
  const state = await deps.store.load(companyId);
  if (!state) return { status: "unknown_company" };
  const resolved = new Set(state.events.filter((e) => e.kind === "contacted" || e.kind === "send_failed").map((e) => e.rfc822_message_id));
  const open = state.events.find((e) => e.kind === "send_attempt" && !resolved.has(e.rfc822_message_id));
  if (!open?.rfc822_message_id) return { status: "nothing_unresolved" };
  const draft = state.drafts.find((d) => d.id === open.draft_id);
  const token = await accessToken(cfg, f);
  // Search by what this attempt actually used: its frozen recipient and its draft's subject.
  const found = await findSent(token, { messageId: open.rfc822_message_id, to: open.recipient ?? null, subject: draft?.subject ?? null, since: new Date(open.occurred_at) }, f);
  if (found === "ambiguous") return { status: "ambiguous", messageId: open.rfc822_message_id };
  // Not found stays unresolved: Gmail may still be processing it, or it went
  // out under another id. Josh decides after checking Sent; nothing resends.
  if (!found) return { status: "not_found", messageId: open.rfc822_message_id };
  const ok = await insert(deps.store, {
    company_id: companyId,
    kind: "contacted",
    lane: open.lane ?? undefined,
    draft_id: open.draft_id ?? null,
    sender: open.sender ?? undefined,
    recipient: open.recipient ?? null,
    rfc822_message_id: open.rfc822_message_id,
    provider_message_id: found.id,
    provider_thread_id: found.threadId,
    recorded_by: "outreach-reconcile",
  });
  return ok === "ok" || ok === "duplicate" ? { status: "recorded", providerId: found.id } : { status: "record_failed", messageId: open.rfc822_message_id };
}

/** A definite Gmail refusal (4xx other than 429): Gmail did not accept the message. */
export type GmailRefusal = { status: number; message: string };
/**
 * What lets an attempt be closed as not sent although a handoff marker may
 * exist: a definite refusal, or the dispatcher's own knowledge that it never
 * called Gmail (the marker's write was unconfirmed, so it may have landed).
 */
export type NotSentProof = (GmailRefusal | { neverCalled: true }) & { messageId: string };

export type CloseResult =
  | { status: "nothing_unresolved" | "not_connected" | "unknown_company" }
  | { status: "found_sent"; providerId: string } // it did go out: recorded as contacted instead
  | { status: "closed" }
  | { status: "uncertain"; messageId: string } // handed to Gmail, no refusal: may be delivered; stays open
  | { status: "proof_mismatch"; messageId: string } // the proof is for a different attempt: nothing closed
  | { status: "ambiguous" | "record_failed"; messageId: string };

/**
 * Close an unresolved attempt as NOT sent. The mailbox is checked first: if
 * the message is there it's recorded as contacted instead; an ambiguous
 * search closes nothing. An attempt that never reached Gmail (no handoff
 * marker) can then be closed. One that was handed to Gmail is closed only
 * with a definite refusal (from dispatch's failed_unrecorded result): an
 * empty Sent search doesn't prove Gmail never accepted it, because search
 * visibility can lag, so it stays open ("uncertain") and blocks any resend.
 */
export async function closeAttemptNotSent(companyId: string, proof: NotSentProof | null, deps: Deps): Promise<CloseResult> {
  const env = deps.env ?? process.env;
  const f = deps.fetch ?? fetch;
  const cfg = gmailConfig(env);
  if (!cfg) return { status: "not_connected" };
  const state = await deps.store.load(companyId);
  if (!state) return { status: "unknown_company" };
  const resolved = new Set(state.events.filter((e) => e.kind === "contacted" || e.kind === "send_failed").map((e) => e.rfc822_message_id));
  const open = state.events.find((e) => e.kind === "send_attempt" && !resolved.has(e.rfc822_message_id));
  if (!open?.rfc822_message_id) return { status: "nothing_unresolved" };
  const draft = state.drafts.find((d) => d.id === open.draft_id);
  const token = await accessToken(cfg, f);
  const found = await findSent(token, { messageId: open.rfc822_message_id, to: open.recipient ?? null, subject: draft?.subject ?? null, since: new Date(open.occurred_at) }, f);
  if (found === "ambiguous") return { status: "ambiguous", messageId: open.rfc822_message_id };
  const common = {
    company_id: companyId,
    lane: open.lane ?? undefined,
    draft_id: open.draft_id ?? null,
    sender: open.sender ?? undefined,
    recipient: open.recipient ?? null,
    rfc822_message_id: open.rfc822_message_id,
  };
  if (found) {
    const ok = await insert(deps.store, { ...common, kind: "contacted", provider_message_id: found.id, provider_thread_id: found.threadId, recorded_by: "outreach-close" });
    return ok === "ok" || ok === "duplicate" ? { status: "found_sent", providerId: found.id } : { status: "record_failed", messageId: open.rfc822_message_id };
  }
  const handedOff = state.events.some((e) => e.kind === "send_handoff" && e.rfc822_message_id === open.rfc822_message_id);
  // A proof only ever applies to the attempt it came from.
  if (proof && proof.messageId !== open.rfc822_message_id) return { status: "proof_mismatch", messageId: open.rfc822_message_id };
  const neverCalled = !!proof && "neverCalled" in proof;
  const refusal = proof && "status" in proof ? proof : null;
  const definite = !!refusal && refusal.status >= 400 && refusal.status < 500 && refusal.status !== 429;
  if (handedOff && !definite && !neverCalled) return { status: "uncertain", messageId: open.rfc822_message_id };
  const note = refusal && definite ? `not sent: Gmail refused (${refusal.status}) ${refusal.message}` : "not sent: never handed to Gmail";
  const ok = await insert(deps.store, { ...common, kind: "send_failed", note: note.slice(0, 300), recorded_by: "outreach-close" });
  return ok === "ok" || ok === "duplicate" ? { status: "closed" } : { status: "record_failed", messageId: open.rfc822_message_id };
}

const OPT_OUT = /\b(unsubscribe|remove me|take me off|stop emailing|do not contact|don't contact|not interested)\b/i;
const BOUNCE = /^(.*<)?(mailer-daemon|postmaster)@/i;
const address = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

/**
 * Record replies, opt-outs and bounces for contacted companies. Idempotent:
 * each provider message is recorded once per kind. Never replies to anyone.
 * Reads (a) each contacted thread, (b) mail from each contacted recipient
 * outside that thread (people often reply fresh), and (c) bounces matched to
 * our Message-IDs or failed recipients. A sender address shared by more than
 * one contacted company, or a bounce that matches more than one, isn't
 * guessed: it's reported for a person and makes the run incomplete.
 */
export type SyncFailure = { company_id: string; kind: NewEvent["kind"]; provider_message_id: string; reason: "refused" | "unknown" };
export type Unmatched = { provider_message_id: string; reason: "ambiguous_sender" | "ambiguous_bounce"; companies: string[] };
export type SyncResult =
  | { status: "not_connected" }
  // "incomplete": something wasn't read or saved (an opt-out may be missing).
  // Failed events are retried on the next run, because sync re-reads the mail.
  | {
      status: "ok" | "incomplete";
      recorded: number;
      already: number;
      checked: number;
      threadErrors: number;
      searchErrors: number;
      failures: SyncFailure[];
      unmatched: Unmatched[];
    };

export async function syncReplies(deps: Deps): Promise<SyncResult> {
  const env = deps.env ?? process.env;
  const f = deps.fetch ?? fetch;
  const cfg = gmailConfig(env);
  const sender = outreachSender(env);
  if (!cfg || !sender) return { status: "not_connected" };
  const token = await accessToken(cfg, f);
  let recorded = 0;
  let already = 0;
  let checked = 0;
  let threadErrors = 0;
  let searchErrors = 0;
  const failures: SyncFailure[] = [];
  const unmatched: Unmatched[] = [];
  const companies = await deps.store.contacted();
  // Our own addresses: the current alias and every alias recorded on any send.
  const own = new Set([sender.address.toLowerCase(), ...companies.flatMap(({ events }) => events.map((e) => (e.sender ?? "").trim().toLowerCase())).filter(Boolean)]);
  const byRecipient = new Map<string, string[]>();
  const byMessageId = new Map<string, string>();
  const firstContact = new Map<string, number>();
  for (const { company_id, events } of companies) {
    for (const e of events.filter((x) => x.kind === "contacted")) {
      const to = (e.recipient ?? "").trim().toLowerCase();
      if (to && !(byRecipient.get(to) ?? []).includes(company_id)) byRecipient.set(to, [...(byRecipient.get(to) ?? []), company_id]);
      if (e.rfc822_message_id) byMessageId.set(e.rfc822_message_id.toLowerCase(), company_id);
      const t = new Date(e.occurred_at).getTime();
      firstContact.set(company_id, Math.min(firstContact.get(company_id) ?? t, t));
    }
  }
  const seen = new Set<string>();
  const record = async (company_id: string, m: { id: string; from: string; subject: string; snippet: string }, threadId: string | null) => {
    const kinds: NewEvent["kind"][] = BOUNCE.test(m.from) ? ["bounced"] : OPT_OUT.test(`${m.subject} ${m.snippet}`) ? ["replied", "opted_out"] : ["replied"];
    for (const kind of kinds) {
      const r = await insert(deps.store, { company_id, kind, provider_message_id: m.id, provider_thread_id: threadId, recorded_by: "outreach-sync" });
      if (r === "ok") recorded++;
      else if (r === "duplicate") already++; // recorded on an earlier run
      else failures.push({ company_id, kind, provider_message_id: m.id, reason: r });
    }
  };

  // (a) The contacted threads.
  for (const { company_id, events } of companies) {
    for (const c of events.filter((e) => e.kind === "contacted" && e.provider_thread_id)) {
      checked++;
      let messages;
      try {
        messages = await threadMessages(token, c.provider_thread_id!, f);
      } catch {
        threadErrors++;
        continue;
      }
      const since = new Date(c.occurred_at).getTime() - 5 * 60_000;
      for (const m of messages) {
        seen.add(m.id);
        // Our own messages are never replies: Gmail labels them SENT, and the
        // From is the current alias or one recorded on a send (it may change).
        if (m.internalDate < since || m.labels.includes("SENT") || own.has(address(m.from))) continue;
        await record(company_id, m, c.provider_thread_id!);
      }
    }
  }
  const afterOf = (ids: string[]) => Math.floor((Math.min(...ids.map((id) => firstContact.get(id) ?? Date.now())) - 5 * 60_000) / 1000);
  const read = async (q: string) => {
    try {
      const r = await searchMessages(token, q, f);
      if (!r.complete) searchErrors++; // more pages than we read: not "nothing there"
      return r.messages.filter((m) => !seen.has(m.id));
    } catch {
      searchErrors++;
      return [];
    }
  };
  const meta = async (id: string) => {
    try {
      return await messageMeta(token, id, f);
    } catch {
      searchErrors++;
      return null;
    }
  };

  // (b) Mail from a contacted recipient outside the original thread.
  for (const [to, ids] of byRecipient) {
    for (const listed of await read(`from:${to} after:${afterOf(ids)}`)) {
      const m = await meta(listed.id);
      if (!m) continue;
      seen.add(m.id);
      if (m.labels.includes("SENT") || own.has(address(m.from)) || address(m.from) !== to) continue;
      if (ids.length > 1) unmatched.push({ provider_message_id: m.id, reason: "ambiguous_sender", companies: ids });
      else await record(ids[0], m, m.threadId);
    }
  }

  // (c) Bounces anywhere, matched to what we sent.
  if (companies.length) {
    for (const listed of await read(`from:(mailer-daemon OR postmaster) after:${afterOf([...firstContact.keys()])}`)) {
      const m = await meta(listed.id);
      if (!m) continue;
      seen.add(m.id);
      const refs = `${m.inReplyTo} ${m.references}`.toLowerCase();
      const hits = new Set<string>();
      for (const [mid, company] of byMessageId) if (refs.includes(mid)) hits.add(company);
      if (!hits.size) {
        for (const r of m.failedRecipients.toLowerCase().split(/[,\s]+/).filter(Boolean)) for (const c of byRecipient.get(r) ?? []) hits.add(c);
      }
      if (hits.size === 1) await record([...hits][0], { ...m, from: m.from || "mailer-daemon@" }, m.threadId);
      else if (hits.size > 1) unmatched.push({ provider_message_id: m.id, reason: "ambiguous_bounce", companies: [...hits] });
      // A bounce matching nothing we sent isn't ours (other mail from this mailbox).
    }
  }
  const clean = !failures.length && !threadErrors && !searchErrors && !unmatched.length;
  return { status: clean ? "ok" : "incomplete", recorded, already, checked, threadErrors, searchErrors, failures, unmatched };
}

export type ReplySyncRun =
  | { status: "not_connected" }
  | (Exclude<SyncResult, { status: "not_connected" }> & { run_recorded: boolean })
  | { status: "failed"; reason: string; run_recorded: boolean };

/**
 * One reply-sync run, with its outcome recorded so dispatch can require a
 * recent complete run. A run that throws (token refresh, timeouts) is
 * recorded as failed; a run whose record can't be saved says so.
 */
export async function runReplySync(deps: Deps): Promise<ReplySyncRun> {
  const now = deps.now ?? (() => new Date());
  const started_at = now().toISOString();
  let result: SyncResult | { status: "failed"; reason: string };
  try {
    result = await syncReplies(deps);
  } catch (e) {
    result = { status: "failed", reason: (e as Error).message.slice(0, 300) };
  }
  if (result.status === "not_connected") return result;
  const run: NewSyncRun =
    result.status === "failed"
      ? { status: "failed", started_at, finished_at: now().toISOString(), checked: 0, recorded: 0, problems: 1, note: result.reason }
      : {
          status: result.status,
          started_at,
          finished_at: now().toISOString(),
          checked: result.checked,
          recorded: result.recorded,
          problems: result.failures.length + result.threadErrors + result.searchErrors + result.unmatched.length,
          note: null,
        };
  let run_recorded = false;
  try {
    run_recorded = !(await deps.store.recordSync(run)).error;
  } catch {
    run_recorded = false;
  }
  return { ...result, run_recorded };
}
