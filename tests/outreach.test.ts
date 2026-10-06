// Outreach sender/reply adapter (Gmail REST), with Gmail mocked. Proves the
// order: guard → intent record → send → outcome; that unknown outcomes are
// reconciled, never resent; and that reply sync is idempotent. No network.
import { describe, expect, it, vi } from "vitest";
import { draftHash, type PilotApproval, type PilotDraft } from "@/lib/digital-services/dispatch-guard";
import {
  closeAttemptNotSent,
  dispatchFirstContact,
  reconcileAttempt,
  replySyncHealthy,
  runReplySync,
  syncReplies,
  type NewEvent,
  type NewSyncRun,
  type OutreachStore,
  type StoredEvent,
  type SyncRun,
} from "@/lib/digital-services/outreach/dispatch";
import { buildRaw, gmailConfig } from "@/lib/digital-services/outreach/gmail";

const OWNER = "33333333-3333-4333-8333-333333333333";
const SENDER = "josh@outbackconnections.com.au";
const ENV = {
  DIGITAL_SERVICES_OUTREACH_SENDING: "on",
  DIGITAL_SERVICES_OUTREACH_SENDER: SENDER,
  DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON: "2026-10-06",
  DIGITAL_SERVICES_GMAIL_CLIENT_ID: "cid",
  DIGITAL_SERVICES_GMAIL_CLIENT_SECRET: "csecret",
  DIGITAL_SERVICES_GMAIL_REFRESH_TOKEN: "rtoken",
};
const SUBJECT = "A guided quote form for Fixture Cleaning";
const BODY = "Hi,\n\nFixture body.\n\nJosh";

// commit: the row is saved but the response is lost (the caller sees an error).
type Fail = { kind: NewEvent["kind"]; code: string; times: number; commit?: boolean };
function memoryStore(
  opts: { approvals?: boolean; refuseAttempt?: boolean; failOutcomeWrites?: number; fail?: Fail[]; sync?: SyncRun | null; failSyncRecord?: boolean } = {}
) {
  // A complete reply sync a minute ago, unless a test says otherwise.
  const syncRuns: SyncRun[] = opts.sync === null ? [] : [opts.sync ?? { status: "ok", finished_at: new Date(Date.now() - 60_000).toISOString() }];
  let failOutcome = opts.failOutcomeWrites ?? 0;
  const fails = (opts.fail ?? []).map((x) => ({ ...x }));
  const draft: PilotDraft = { id: "d1", company_id: "OC-901", revision: 1, subject: SUBJECT, body: BODY, sha256: draftHash(SUBJECT, BODY), evidence_revision: 0 };
  const approvals: PilotApproval[] =
    opts.approvals === false
      ? []
      : (["evidence_refresh", "preview_review", "copy_review", "message_approval"] as const).map((kind) => ({
          draft_id: "d1",
          draft_sha256: draft.sha256,
          kind,
          actor: "Josh",
          approved_at: "2026-10-06",
          approver_user_id: kind === "message_approval" ? OWNER : null,
        }));
  const events: (StoredEvent & NewEvent)[] = [];
  const store: OutreachStore & { events: typeof events; syncRuns: SyncRun[] } = {
    events,
    async load(id) {
      if (id !== "OC-901") return null;
      return {
        company: { id, lane: "email", reserved_for: "cowork", contact_address: "office@fixture.example", contact_basis_confirmed_at: "2026-10-06", contact_basis_confirmed_for: "office@fixture.example", evidence_revision: 0 },
        drafts: [draft],
        approvals,
        events: events.map((e) => ({ ...e })),
        ownerUserId: OWNER,
      };
    },
    async insertEvent(e) {
      if (e.kind === "send_attempt" && opts.refuseAttempt) return { error: { code: "OC403", message: "refused" } };
      const f = fails.find((x) => x.kind === e.kind && x.times > 0);
      if (f) {
        f.times--;
        if (f.commit) events.push({ ...e, occurred_at: new Date("2026-10-07T00:00:00Z").toISOString() } as StoredEvent & NewEvent);
        return { error: { code: f.code, message: `fixture failure ${f.code}` } };
      }
      if (e.kind === "send_failed" && failOutcome > 0) {
        failOutcome--;
        return { error: { code: "PGRST001", message: "database unreachable" } };
      }
      // The database's uniqueness rules, in miniature.
      const dup = events.some(
        (x) =>
          (e.kind === "send_attempt" && x.kind === "send_attempt" && x.draft_id === e.draft_id) ||
          ((e.kind === "contacted" || e.kind === "send_failed" || e.kind === "send_handoff") && x.kind === e.kind && x.rfc822_message_id === e.rfc822_message_id) ||
          (e.provider_message_id && x.kind === e.kind && x.provider_message_id === e.provider_message_id)
      );
      if (dup) return { error: { code: "23505", message: "duplicate key" } };
      events.push({ ...e, occurred_at: new Date("2026-10-07T00:00:00Z").toISOString() } as StoredEvent & NewEvent);
      return { error: null };
    },
    async contacted() {
      const c = events.filter((e) => e.kind === "contacted");
      return c.length ? [{ company_id: "OC-901", events: c }] : [];
    },
    syncRuns,
    async lastSync() {
      return syncRuns.at(-1) ?? null;
    },
    async recordSync(run: NewSyncRun) {
      if (opts.failSyncRecord) return { error: { code: "PGRST001", message: "database unreachable" } };
      syncRuns.push(run);
      return { error: null };
    },
  };
  return store;
}

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;
function gmail(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), init });
    const key = Object.keys(routes).find((k) => `${url.host}${url.pathname}`.endsWith(k));
    if (!key) return new Response("not mocked", { status: 404 });
    return routes[key](url, init);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
const base: Record<string, Route> = {
  "oauth2.googleapis.com/token": () => json({ access_token: "at" }),
  // Searches find nothing unless a test says otherwise.
  "/messages": () => json({}),
  "/settings/sendAs": () => json({ sendAs: [{ sendAsEmail: "primary@outbackconnections.com.au", isPrimary: true }, { sendAsEmail: SENDER, verificationStatus: "accepted" }] }),
};
const MSGID = "<oc-fixed@outbackconnections.com.au>";

describe("dispatchFirstContact", () => {
  it("does nothing at all unless sending is switched on and Gmail is connected", async () => {
    const { f, calls } = gmail(base);
    const store = memoryStore();
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: { ...ENV, DIGITAL_SERVICES_OUTREACH_SENDING: "" }, fetch: f })).toEqual({ status: "disabled" });
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: { ...ENV, DIGITAL_SERVICES_GMAIL_REFRESH_TOKEN: "" }, fetch: f })).toEqual({ status: "not_connected" });
    expect(calls).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it("holds a company that fails the guard, before any Gmail call", async () => {
    const { f, calls } = gmail(base);
    const r = await dispatchFirstContact("OC-901", "cowork", { store: memoryStore({ approvals: false }), env: ENV, fetch: f });
    expect(r).toMatchObject({ status: "held", holds: expect.arrayContaining(["missing_message_approval"]) });
    const help = await dispatchFirstContact("OC-901", "cowork", { store: memoryStore(), env: { ...ENV, DIGITAL_SERVICES_OUTREACH_SENDER: "help@outbackconnections.com.au" }, fetch: f });
    expect(help).toMatchObject({ status: "held", holds: ["no_verified_sender"] });
    const unverified = await dispatchFirstContact("OC-901", "cowork", { store: memoryStore(), env: { ...ENV, DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON: "" }, fetch: f });
    expect(unverified).toMatchObject({ status: "held", holds: ["no_verified_sender"] });
    const engine = await dispatchFirstContact("OC-901", "engine", { store: memoryStore(), env: ENV, fetch: f });
    expect(engine).toMatchObject({ status: "held", holds: ["reserved_for_other_lane"] });
    expect(calls).toHaveLength(0);
  });

  it("records intent, sends once from the alias, and records Gmail's ids", async () => {
    let sentRaw = "";
    const { f } = gmail({
      ...base,
      "/messages/send": (_u, init) => {
        sentRaw = JSON.parse(String(init?.body)).raw;
        return json({ id: "gm-1", threadId: "th-1" });
      },
    });
    const store = memoryStore();
    const r = await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f, messageId: () => MSGID });
    expect(r).toEqual({ status: "sent", messageId: MSGID, providerId: "gm-1", threadId: "th-1" });
    expect(store.events.map((e) => e.kind)).toEqual(["send_attempt", "send_handoff", "contacted"]);
    expect(store.events[2]).toMatchObject({ rfc822_message_id: MSGID, provider_message_id: "gm-1", provider_thread_id: "th-1", sender: SENDER, lane: "cowork", draft_id: "d1" });
    const mime = Buffer.from(sentRaw, "base64url").toString("utf8");
    expect(mime).toContain(`From: ${SENDER}`);
    expect(mime).toContain("To: office@fixture.example");
    expect(mime).toContain(`Subject: ${SUBJECT}`);
    expect(mime).toContain(`Message-ID: ${MSGID}`);
    expect(mime).toContain(`List-Unsubscribe: <mailto:${SENDER}?subject=unsubscribe>`);
    expect(Buffer.from(mime.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8")).toBe(BODY.replace(/\n/g, "\r\n"));
    // A second dispatch is held: already contacted.
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f })).toMatchObject({ status: "held", holds: ["already_contacted"] });
  });

  it("an alias that isn't an accepted send-as address never sends", async () => {
    const { f, calls } = gmail({ ...base, "/settings/sendAs": () => json({ sendAs: [{ sendAsEmail: SENDER, verificationStatus: "pending" }] }) });
    const store = memoryStore();
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f })).toEqual({ status: "sender_not_send_as" });
    expect(calls.some((c) => c.url.includes("/messages/send"))).toBe(false);
    expect(store.events).toHaveLength(0);
  });

  it("if the database refuses the intent record, nothing is sent", async () => {
    const { f, calls } = gmail(base);
    expect(await dispatchFirstContact("OC-901", "cowork", { store: memoryStore({ refuseAttempt: true }), env: ENV, fetch: f })).toMatchObject({ status: "refused" });
    expect(calls.some((c) => c.url.includes("/messages/send"))).toBe(false);
  });

  it("a definite Gmail refusal is recorded as send_failed against the attempt", async () => {
    const { f } = gmail({ ...base, "/messages/send": () => json({ error: { message: "Invalid To header" } }, 400) });
    const store = memoryStore();
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f, messageId: () => MSGID })).toMatchObject({ status: "failed" });
    expect(store.events.map((e) => [e.kind, e.rfc822_message_id])).toEqual([
      ["send_attempt", MSGID],
      ["send_handoff", MSGID],
      ["send_failed", MSGID],
    ]);
  });

  it("a refusal whose record can't be saved is reported as unrecorded, then closed with that refusal after a mailbox check", async () => {
    const { f } = gmail({ ...base, "/messages/send": () => json({ error: { message: "Invalid To header" } }, 400) });
    const store = memoryStore({ failOutcomeWrites: 2 });
    const r = await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f, messageId: () => MSGID });
    expect(r).toMatchObject({ status: "failed_unrecorded", messageId: MSGID, refusal: { status: 400 } });
    expect(store.events.map((e) => e.kind)).toEqual(["send_attempt", "send_handoff"]);
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f })).toMatchObject({ status: "held", holds: ["unresolved_attempt"] });

    const empty = gmail({ ...base, "/messages": () => json({}) });
    // Without the refusal, an empty search proves nothing: it stays open.
    expect(await closeAttemptNotSent("OC-901", null, { store, env: ENV, fetch: empty.f })).toEqual({ status: "uncertain", messageId: MSGID });
    expect(store.events).toHaveLength(2);
    // With the definite refusal from the dispatch result, it closes.
    const refusal = r.status === "failed_unrecorded" ? r.refusal : null;
    expect(await closeAttemptNotSent("OC-901", refusal, { store, env: ENV, fetch: empty.f })).toEqual({ status: "closed" });
    expect(store.events.at(-1)).toMatchObject({ kind: "send_failed", rfc822_message_id: MSGID });
    expect(await closeAttemptNotSent("OC-901", refusal, { store, env: ENV, fetch: empty.f })).toEqual({ status: "nothing_unresolved" });
  });

  it("accepted mail with a lost response and delayed search visibility is never closed as not sent", async () => {
    // Gmail accepts the message, but the response is lost.
    const send = vi.fn(() => {
      throw new TypeError("socket hang up");
    });
    const store = memoryStore();
    const first = gmail({ ...base, "/messages/send": send });
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: first.f, messageId: () => MSGID })).toEqual({ status: "unconfirmed", messageId: MSGID });

    // Search hasn't indexed it yet: empty everywhere. Nothing is closed, and a
    // 429/5xx "refusal" isn't definite either.
    const notYet = gmail({ ...base, "/messages": () => json({}) });
    expect(await closeAttemptNotSent("OC-901", null, { store, env: ENV, fetch: notYet.f })).toEqual({ status: "uncertain", messageId: MSGID });
    expect(await closeAttemptNotSent("OC-901", { status: 503, message: "backend error", messageId: MSGID }, { store, env: ENV, fetch: notYet.f })).toEqual({ status: "uncertain", messageId: MSGID });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: notYet.f })).toEqual({ status: "not_found", messageId: MSGID });
    expect(store.events.map((e) => e.kind)).toEqual(["send_attempt", "send_handoff"]);
    // Resend stays blocked.
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: first.f })).toMatchObject({ status: "held", holds: ["unresolved_attempt"] });
    expect(send).toHaveBeenCalledTimes(1);

    // Later the search shows it: recorded as contacted.
    const visible = gmail({ ...base, "/messages": (u) => (u.searchParams.get("q") === `rfc822msgid:${MSGID}` ? json({ messages: [{ id: "gm-7", threadId: "th-7" }] }) : json({})) });
    expect(await closeAttemptNotSent("OC-901", null, { store, env: ENV, fetch: visible.f })).toEqual({ status: "found_sent", providerId: "gm-7" });
    expect(store.events.at(-1)).toMatchObject({ kind: "contacted", provider_message_id: "gm-7" });
  });

  it("an attempt that never reached Gmail (no handoff marker) can be closed after a mailbox check", async () => {
    const send = vi.fn(() => json({ id: "never", threadId: "never" }));
    const { f } = gmail({ ...base, "/messages/send": send });
    // The handoff marker is refused and the closing send_failed can't be saved either.
    const store = memoryStore({ fail: [{ kind: "send_handoff", code: "42501", times: 1 }], failOutcomeWrites: 2 });
    // The closing write failed too, so the result says so and carries the Message-ID.
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f, messageId: () => MSGID })).toMatchObject({ status: "not_sent_unrecorded", messageId: MSGID });
    expect(send).not.toHaveBeenCalled();
    expect(store.events.map((e) => e.kind)).toEqual(["send_attempt"]);
    const empty = gmail({ ...base, "/messages": () => json({}) });
    expect(await closeAttemptNotSent("OC-901", null, { store, env: ENV, fetch: empty.f })).toEqual({ status: "closed" });
    expect(store.events.at(-1)).toMatchObject({ kind: "send_failed", note: "not sent: never handed to Gmail" });
  });

  it("an intent that landed but whose closure can't be saved is reported with its Message-ID, and closes with the proof", async () => {
    const send = vi.fn(() => json({ id: "never", threadId: "never" }));
    const { f } = gmail({ ...base, "/messages/send": send });
    // The attempt commits but both responses are lost; both closing writes hit an outage.
    const store = memoryStore({ fail: [{ kind: "send_attempt", code: "PGRST001", times: 1, commit: true }], failOutcomeWrites: 2 });
    const r = await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f, messageId: () => MSGID });
    expect(r).toEqual({ status: "not_sent_unrecorded", messageId: MSGID, reason: "the send attempt couldn't be confirmed", proof: { neverCalled: true, messageId: MSGID } });
    expect(send).not.toHaveBeenCalled();
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f })).toMatchObject({ status: "held", holds: ["unresolved_attempt"] });
    const empty = gmail({ ...base, "/messages": () => json({}) });
    expect(await closeAttemptNotSent("OC-901", r.status === "not_sent_unrecorded" ? r.proof : null, { store, env: ENV, fetch: empty.f })).toEqual({ status: "closed" });
  });

  it("an intent that landed unconfirmed whose closure is refused (not just lost) is still unrecorded, never a clean not-sent", async () => {
    const send = vi.fn(() => json({ id: "never", threadId: "never" }));
    const { f } = gmail({ ...base, "/messages/send": send });
    const store = memoryStore({ fail: [{ kind: "send_attempt", code: "PGRST001", times: 1, commit: true }, { kind: "send_failed", code: "42501", times: 1 }] });
    const r = await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f, messageId: () => MSGID });
    expect(r).toEqual({ status: "not_sent_unrecorded", messageId: MSGID, reason: "the send attempt couldn't be confirmed", proof: { neverCalled: true, messageId: MSGID } });
    expect(send).not.toHaveBeenCalled();
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f })).toMatchObject({ status: "held", holds: ["unresolved_attempt"] });
    const empty = gmail({ ...base, "/messages": () => json({}) });
    expect(await closeAttemptNotSent("OC-901", r.status === "not_sent_unrecorded" ? r.proof : null, { store, env: ENV, fetch: empty.f })).toEqual({ status: "closed" });
  });

  it("a handoff marker that landed unconfirmed: uncertain without proof, closed with the dispatcher's never-called proof", async () => {
    const send = vi.fn(() => json({ id: "never", threadId: "never" }));
    const { f } = gmail({ ...base, "/messages/send": send });
    const store = memoryStore({ fail: [{ kind: "send_handoff", code: "PGRST002", times: 1, commit: true }], failOutcomeWrites: 2 });
    const r = await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f, messageId: () => MSGID });
    expect(r).toMatchObject({ status: "not_sent_unrecorded", messageId: MSGID, proof: { neverCalled: true, messageId: MSGID } });
    expect(send).not.toHaveBeenCalled();
    expect(store.events.map((e) => e.kind)).toEqual(["send_attempt", "send_handoff"]);
    const empty = gmail({ ...base, "/messages": () => json({}) });
    expect(await closeAttemptNotSent("OC-901", null, { store, env: ENV, fetch: empty.f })).toEqual({ status: "uncertain", messageId: MSGID });
    expect(await closeAttemptNotSent("OC-901", { neverCalled: true, messageId: MSGID }, { store, env: ENV, fetch: empty.f })).toEqual({ status: "closed" });
  });

  it("a proof only closes the attempt it came from: a stale proof can't close a newer, possibly delivered attempt", async () => {
    const store = memoryStore();
    const NEWER = "<oc-newer@outbackconnections.com.au>";
    await store.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, rfc822_message_id: NEWER, recorded_by: "t" });
    await store.insertEvent({ company_id: "OC-901", kind: "send_handoff", lane: "cowork", draft_id: "d1", sender: SENDER, rfc822_message_id: NEWER, recorded_by: "t" });
    const empty = gmail({ ...base, "/messages": () => json({}) });
    expect(await closeAttemptNotSent("OC-901", { neverCalled: true, messageId: MSGID }, { store, env: ENV, fetch: empty.f })).toEqual({ status: "proof_mismatch", messageId: NEWER });
    expect(await closeAttemptNotSent("OC-901", { status: 400, message: "Invalid To", messageId: MSGID }, { store, env: ENV, fetch: empty.f })).toEqual({ status: "proof_mismatch", messageId: NEWER });
    expect(store.events.map((e) => e.kind)).toEqual(["send_attempt", "send_handoff"]);
  });

  it("closing an attempt that actually went out records it as contacted instead", async () => {
    const store = memoryStore();
    await store.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, rfc822_message_id: MSGID, recorded_by: "t" });
    const found = gmail({ ...base, "/messages": (u) => (u.searchParams.get("q") === `rfc822msgid:${MSGID}` ? json({ messages: [{ id: "gm-5", threadId: "th-5" }] }) : json({})) });
    expect(await closeAttemptNotSent("OC-901", null, { store, env: ENV, fetch: found.f })).toEqual({ status: "found_sent", providerId: "gm-5" });
    expect(store.events.at(-1)).toMatchObject({ kind: "contacted", provider_message_id: "gm-5" });
  });

  it("an unknown outcome stays unresolved, blocks a resend, and is reconciled from the mailbox", async () => {
    const send = vi.fn(() => {
      throw new TypeError("fetch failed");
    });
    const { f } = gmail({ ...base, "/messages/send": send });
    const store = memoryStore();
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f, messageId: () => MSGID })).toEqual({ status: "unconfirmed", messageId: MSGID });
    expect(store.events.map((e) => e.kind)).toEqual(["send_attempt", "send_handoff"]);
    // A second dispatch is held by the guard, before any send.
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f })).toMatchObject({ status: "held", holds: ["unresolved_attempt"] });
    expect(send).toHaveBeenCalledTimes(1);

    // Reconcile: Gmail has it under our Message-ID.
    const found = gmail({ ...base, "/messages": (u) => (u.searchParams.get("q") === `rfc822msgid:${MSGID}` ? json({ messages: [{ id: "gm-9", threadId: "th-9" }] }) : json({})) });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: found.f })).toEqual({ status: "recorded", providerId: "gm-9" });
    expect(store.events.at(-1)).toMatchObject({ kind: "contacted", rfc822_message_id: MSGID, provider_message_id: "gm-9" });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: found.f })).toEqual({ status: "nothing_unresolved" });
  });

  it("reconciliation falls back to Sent by recipient and exact subject; several matches stay unresolved", async () => {
    const store = memoryStore();
    await store.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, recipient: "office@fixture.example", rfc822_message_id: MSGID, recorded_by: "t" });
    const subjects: Record<string, string> = { a: SUBJECT, b: "Something else", c: SUBJECT };
    const routes = (ids: string[]): Record<string, Route> => ({
      ...base,
      "/messages": (u) => (u.searchParams.get("q")?.startsWith("in:sent") ? json({ messages: ids.map((id) => ({ id, threadId: `t-${id}` })) }) : json({})),
      ...Object.fromEntries(Object.keys(subjects).map((id) => [`/messages/${id}`, () => json({ payload: { headers: [{ name: "Subject", value: subjects[id] }] } })])),
    });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: gmail(routes(["a", "c"])).f })).toEqual({ status: "ambiguous", messageId: MSGID });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: gmail(routes(["b"])).f })).toEqual({ status: "not_found", messageId: MSGID });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: gmail(routes(["a", "b"])).f })).toEqual({ status: "recorded", providerId: "a" });
  });
});

describe("syncReplies", () => {
  it("records replies, opt-outs and bounces once each, skipping our own messages", async () => {
    const store = memoryStore();
    await store.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, rfc822_message_id: MSGID, recorded_by: "t" });
    await store.insertEvent({ company_id: "OC-901", kind: "contacted", lane: "cowork", draft_id: "d1", sender: SENDER, rfc822_message_id: MSGID, provider_message_id: "gm-1", provider_thread_id: "th-1", recorded_by: "t" });
    const t = Date.parse("2026-10-07T01:00:00Z");
    const thread = {
      messages: [
        { id: "gm-1", internalDate: String(t - 3_600_000), snippet: "Fixture body", payload: { headers: [{ name: "From", value: `Josh <${SENDER}>` }] } },
        { id: "gm-2", internalDate: String(t), snippet: "Please unsubscribe me", payload: { headers: [{ name: "From", value: "Owner <office@fixture.example>" }, { name: "Subject", value: "Re: x" }] } },
        { id: "gm-3", internalDate: String(t), snippet: "Delivery failed", payload: { headers: [{ name: "From", value: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" }] } },
        { id: "gm-4", internalDate: String(t), snippet: "Thanks, how much?", payload: { headers: [{ name: "From", value: `Josh <${SENDER.toUpperCase()}>` }] } },
      ],
    };
    const { f } = gmail({ ...base, "/threads/th-1": () => json(thread) });
    expect(await syncReplies({ store, env: ENV, fetch: f })).toEqual({ status: "ok", recorded: 3, already: 0, checked: 1, threadErrors: 0, searchErrors: 0, failures: [], unmatched: [] });
    expect(store.events.slice(2).map((e) => [e.kind, e.provider_message_id])).toEqual([
      ["replied", "gm-2"],
      ["opted_out", "gm-2"],
      ["bounced", "gm-3"],
    ]);
    expect(await syncReplies({ store, env: ENV, fetch: f })).toEqual({ status: "ok", recorded: 0, already: 3, checked: 1, threadErrors: 0, searchErrors: 0, failures: [], unmatched: [] });
    // Once replied, the guard holds any further first contact.
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: f })).toMatchObject({ status: "held", holds: expect.arrayContaining(["replied", "suppressed"]) });
  });
});

describe("syncReplies when the database doesn't save", () => {
  async function contactedStore(fail: Fail[]) {
    const store = memoryStore({ fail });
    await store.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, rfc822_message_id: MSGID, recorded_by: "t" });
    await store.insertEvent({ company_id: "OC-901", kind: "contacted", lane: "cowork", draft_id: "d1", sender: SENDER, rfc822_message_id: MSGID, provider_message_id: "gm-1", provider_thread_id: "th-1", recorded_by: "t" });
    return store;
  }
  const unsubscribe = {
    messages: [
      { id: "gm-2", internalDate: String(Date.parse("2026-10-07T01:00:00Z")), snippet: "Please unsubscribe me", payload: { headers: [{ name: "From", value: "Owner <office@fixture.example>" }] } },
    ],
  };

  it("an opt-out the database refuses is reported (not 'ok'), and is saved on the next run", async () => {
    const store = await contactedStore([{ kind: "opted_out", code: "42501", times: 1 }]);
    const { f } = gmail({ ...base, "/threads/th-1": () => json(unsubscribe) });
    const first = await syncReplies({ store, env: ENV, fetch: f });
    expect(first).toEqual({
      status: "incomplete",
      recorded: 1,
      already: 0,
      checked: 1,
      threadErrors: 0,
      searchErrors: 0,
      failures: [{ company_id: "OC-901", kind: "opted_out", provider_message_id: "gm-2", reason: "refused" }],
      unmatched: [],
    });
    expect(store.events.filter((e) => e.kind === "opted_out")).toHaveLength(0);
    // Recovery: the next run saves it; the reply already saved is a genuine duplicate, not a failure.
    expect(await syncReplies({ store, env: ENV, fetch: f })).toEqual({ status: "ok", recorded: 1, already: 1, checked: 1, threadErrors: 0, searchErrors: 0, failures: [], unmatched: [] });
    expect(store.events.filter((e) => e.kind === "opted_out")).toHaveLength(1);
  });

  it("a transport failure on save is reported as unknown and retried next run", async () => {
    const store = await contactedStore([{ kind: "opted_out", code: "PGRST001", times: 2 }]);
    const { f } = gmail({ ...base, "/threads/th-1": () => json(unsubscribe) });
    expect(await syncReplies({ store, env: ENV, fetch: f })).toMatchObject({ status: "incomplete", failures: [{ kind: "opted_out", reason: "unknown" }] });
    expect(await syncReplies({ store, env: ENV, fetch: f })).toMatchObject({ status: "ok", recorded: 1, failures: [] });
  });

  it("an unreadable thread makes the run incomplete", async () => {
    const store = await contactedStore([]);
    const { f } = gmail({ ...base, "/threads/th-1": () => json({ error: "backend" }, 503) });
    expect(await syncReplies({ store, env: ENV, fetch: f })).toMatchObject({ status: "incomplete", threadErrors: 1 });
  });
});

describe("syncReplies after the alias changes", () => {
  it("never counts our own earlier messages as replies", async () => {
    const store = memoryStore();
    const OLD = "websites@outbackconnections.com.au";
    await store.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: OLD, rfc822_message_id: MSGID, recorded_by: "t" });
    await store.insertEvent({ company_id: "OC-901", kind: "contacted", lane: "cowork", draft_id: "d1", sender: OLD, rfc822_message_id: MSGID, provider_message_id: "gm-1", provider_thread_id: "th-1", recorded_by: "t" });
    const t = Date.parse("2026-10-07T01:00:00Z");
    const thread = {
      messages: [
        { id: "gm-1", internalDate: String(t), snippet: "Fixture body", payload: { headers: [{ name: "From", value: `Josh <${OLD}>` }] } },
        { id: "gm-6", internalDate: String(t), snippet: "Follow-up", labelIds: ["SENT"], payload: { headers: [{ name: "From", value: "Josh <someone-else@outbackconnections.com.au>" }] } },
      ],
    };
    const { f } = gmail({ ...base, "/threads/th-1": () => json(thread) });
    expect(await syncReplies({ store, env: ENV, fetch: f })).toEqual({ status: "ok", recorded: 0, already: 0, checked: 1, threadErrors: 0, searchErrors: 0, failures: [], unmatched: [] });
  });
});

describe("offline failure and recovery", () => {
  const contactedTo = async (store: ReturnType<typeof memoryStore>, company = "OC-901", recipient = "office@fixture.example", msgId = MSGID) => {
    await store.insertEvent({ company_id: company, kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, recipient, rfc822_message_id: msgId, recorded_by: "t" });
    await store.insertEvent({ company_id: company, kind: "contacted", lane: "cowork", draft_id: "d1", sender: SENDER, recipient, rfc822_message_id: msgId, provider_message_id: `gm-${company}`, provider_thread_id: `th-${company}`, recorded_by: "t" });
  };
  const meta = (id: string, from: string, extra: Record<string, string> = {}, snippet = "") =>
    json({
      id,
      threadId: `fresh-${id}`,
      snippet,
      internalDate: String(Date.parse("2026-10-07T02:00:00Z")),
      payload: { headers: [{ name: "From", value: from }, ...Object.entries(extra).map(([name, value]) => ({ name, value }))] },
    });
  const emptyThread = () => json({ messages: [] });

  it("a failed, incomplete or stale reply sync holds dispatch before any send; a fresh complete run releases it", async () => {
    const send = vi.fn(() => json({ id: "gm-s", threadId: "th-s" }));
    const { f } = gmail({ ...base, "/messages/send": send });
    for (const sync of [null, { status: "failed" as const, finished_at: new Date().toISOString() }, { status: "incomplete" as const, finished_at: new Date().toISOString() }, { status: "ok" as const, finished_at: new Date(Date.now() - 7 * 3_600_000).toISOString() }]) {
      const r = await dispatchFirstContact("OC-901", "cowork", { store: memoryStore({ sync }), env: ENV, fetch: f });
      expect(r).toMatchObject({ status: "held", holds: ["reply_sync_unhealthy"] });
    }
    expect(send).not.toHaveBeenCalled();
    expect(await dispatchFirstContact("OC-901", "cowork", { store: memoryStore(), env: ENV, fetch: f, messageId: () => MSGID })).toMatchObject({ status: "sent" });
  });

  it("background jobs can't bypass the owner, revision or suppression controls", async () => {
    const send = vi.fn(() => json({ id: "gm-s", threadId: "th-s" }));
    const { f } = gmail({ ...base, "/messages/send": send });
    expect(await dispatchFirstContact("OC-901", "cowork", { store: memoryStore({ approvals: false }), env: ENV, fetch: f })).toMatchObject({ status: "held" });
    const suppressed = memoryStore();
    await suppressed.insertEvent({ company_id: "OC-901", kind: "opted_out", recorded_by: "outreach-sync" });
    expect(await dispatchFirstContact("OC-901", "cowork", { store: suppressed, env: ENV, fetch: f })).toMatchObject({ status: "held", holds: ["suppressed"] });
    expect(send).not.toHaveBeenCalled();
  });

  it("the recipient is frozen on the attempt: reconciliation searches what was sent, not the company's new address", async () => {
    const store = memoryStore();
    await store.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, recipient: "old@fixture.example", rfc822_message_id: MSGID, recorded_by: "t" });
    const queries: string[] = [];
    const { f } = gmail({ ...base, "/messages": (u) => (queries.push(u.searchParams.get("q") ?? ""), json({})) });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: f })).toEqual({ status: "not_found", messageId: MSGID });
    expect(queries).toEqual([`rfc822msgid:${MSGID}`, expect.stringContaining("to:old@fixture.example")]);
    // An attempt without a frozen recipient (legacy) only searches by Message-ID: never by a guess.
    const legacy = memoryStore();
    await legacy.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, rfc822_message_id: MSGID, recorded_by: "t" });
    queries.length = 0;
    expect(await reconcileAttempt("OC-901", { store: legacy, env: ENV, fetch: f })).toEqual({ status: "not_found", messageId: MSGID });
    expect(queries).toEqual([`rfc822msgid:${MSGID}`]);
  });

  it("delayed indexing: not found now stays unresolved and blocks; found later is recorded", async () => {
    const store = memoryStore();
    await store.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, recipient: "office@fixture.example", rfc822_message_id: MSGID, recorded_by: "t" });
    await store.insertEvent({ company_id: "OC-901", kind: "send_handoff", lane: "cowork", draft_id: "d1", sender: SENDER, recipient: "office@fixture.example", rfc822_message_id: MSGID, recorded_by: "t" });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: gmail(base).f })).toEqual({ status: "not_found", messageId: MSGID });
    expect(await closeAttemptNotSent("OC-901", null, { store, env: ENV, fetch: gmail(base).f })).toEqual({ status: "uncertain", messageId: MSGID });
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: gmail(base).f })).toMatchObject({ status: "held", holds: ["unresolved_attempt"] });
    const later = gmail({ ...base, "/messages": (u) => (u.searchParams.get("q") === `rfc822msgid:${MSGID}` ? json({ messages: [{ id: "gm-late", threadId: "th-late" }] }) : json({})) });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: later.f })).toEqual({ status: "recorded", providerId: "gm-late" });
  });

  it("Sent searches follow every page; more pages than we read is ambiguous, never 'not found'", async () => {
    const store = memoryStore();
    await store.insertEvent({ company_id: "OC-901", kind: "send_attempt", lane: "cowork", draft_id: "d1", sender: SENDER, recipient: "office@fixture.example", rfc822_message_id: MSGID, recorded_by: "t" });
    const paged = (pages: number) =>
      gmail({
        ...base,
        "/messages": (u) => {
          if (!u.searchParams.get("q")?.startsWith("in:sent")) return json({});
          const n = Number(u.searchParams.get("pageToken") ?? "0");
          const last = n === pages - 1;
          return json({ messages: last ? [{ id: "match", threadId: "t-m" }] : [{ id: `other-${n}`, threadId: "t-o" }], ...(last ? {} : { nextPageToken: String(n + 1) }) });
        },
        "/messages/match": () => json({ payload: { headers: [{ name: "Subject", value: SUBJECT }] } }),
        ...Object.fromEntries(Array.from({ length: 12 }, (_, n) => [`/messages/other-${n}`, () => json({ payload: { headers: [{ name: "Subject", value: "Other" }] } })])),
      });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: paged(12).f })).toEqual({ status: "ambiguous", messageId: MSGID });
    expect(await reconcileAttempt("OC-901", { store, env: ENV, fetch: paged(3).f })).toEqual({ status: "recorded", providerId: "match" });
  });

  it("timeouts: a send that hangs is unknown (reconcile, never resend); a hung search is a sync error, not 'nothing there'", async () => {
    const hang: Route = (_u, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }))));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const realTimeout = AbortSignal.timeout;
      AbortSignal.timeout = () => {
        const c = new AbortController();
        setTimeout(() => c.abort(new Error("timeout")), 5);
        return c.signal;
      };
      try {
        const sendStore = memoryStore();
        const pending = dispatchFirstContact("OC-901", "cowork", { store: sendStore, env: ENV, fetch: gmail({ ...base, "/messages/send": hang }).f, messageId: () => MSGID });
        await vi.advanceTimersByTimeAsync(10);
        expect(await pending).toEqual({ status: "unconfirmed", messageId: MSGID });
        expect(sendStore.events.map((e) => e.kind)).toEqual(["send_attempt", "send_handoff"]);
        const syncStore = memoryStore();
        await contactedTo(syncStore);
        const sync = syncReplies({ store: syncStore, env: ENV, fetch: gmail({ ...base, "/threads/th-OC-901": emptyThread, "/messages": hang }).f });
        await vi.advanceTimersByTimeAsync(10);
        expect(await sync).toMatchObject({ status: "incomplete", searchErrors: 2 });
      } finally {
        AbortSignal.timeout = realTimeout;
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("a reply sent fresh (outside the thread) is still found; an opt-out there suppresses", async () => {
    const store = memoryStore();
    await contactedTo(store);
    const { f } = gmail({
      ...base,
      "/threads/th-OC-901": emptyThread,
      "/messages": (u) => (u.searchParams.get("q")?.startsWith("from:office@fixture.example") ? json({ messages: [{ id: "fresh-1", threadId: "fresh-t" }] }) : json({})),
      "/messages/fresh-1": () => meta("fresh-1", "Owner <office@fixture.example>", { Subject: "Please remove me from your list" }),
    });
    expect(await syncReplies({ store, env: ENV, fetch: f })).toMatchObject({ status: "ok", recorded: 2 });
    expect(store.events.filter((e) => e.kind === "opted_out")).toHaveLength(1);
    // Seen again on the next run: a duplicate inbound message is recorded once.
    expect(await syncReplies({ store, env: ENV, fetch: f })).toMatchObject({ status: "ok", recorded: 0, already: 2 });
  });

  it("a sender shared by two contacted companies isn't guessed: reported as ambiguous, run incomplete", async () => {
    const store = memoryStore();
    await contactedTo(store, "OC-901", "shared@fixture.example", "<a@outbackconnections.com.au>");
    await contactedTo(store, "OC-902", "shared@fixture.example", "<b@outbackconnections.com.au>");
    store.contacted = async () => {
      const by = new Map<string, StoredEvent[]>();
      for (const e of store.events.filter((x) => x.kind === "contacted")) by.set(e.company_id, [...(by.get(e.company_id) ?? []), e]);
      return [...by].map(([company_id, events]) => ({ company_id, events }));
    };
    const { f } = gmail({
      ...base,
      "/threads/th-OC-901": emptyThread,
      "/threads/th-OC-902": emptyThread,
      "/messages": (u) => (u.searchParams.get("q")?.startsWith("from:shared@") ? json({ messages: [{ id: "fresh-2", threadId: "x" }] }) : json({})),
      "/messages/fresh-2": () => meta("fresh-2", "shared@fixture.example", { Subject: "Re: hello" }),
    });
    const r = await syncReplies({ store, env: ENV, fetch: f });
    expect(r).toMatchObject({ status: "incomplete", recorded: 0, unmatched: [{ provider_message_id: "fresh-2", reason: "ambiguous_sender", companies: ["OC-901", "OC-902"] }] });
  });

  it("a bounce outside the thread is matched by our Message-ID (or failed recipient); one that isn't ours is ignored", async () => {
    const store = memoryStore();
    await contactedTo(store);
    const { f } = gmail({
      ...base,
      "/threads/th-OC-901": emptyThread,
      "/messages": (u) =>
        u.searchParams.get("q")?.startsWith("from:(mailer-daemon") ? json({ messages: [{ id: "bn-1", threadId: "b1" }, { id: "bn-2", threadId: "b2" }] }) : json({}),
      "/messages/bn-1": () => meta("bn-1", "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", { References: MSGID }),
      "/messages/bn-2": () => meta("bn-2", "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", { References: "<someone-elses@example.test>" }),
    });
    expect(await syncReplies({ store, env: ENV, fetch: f })).toMatchObject({ status: "ok", recorded: 1, unmatched: [] });
    expect(store.events.filter((e) => e.kind === "bounced").map((e) => e.provider_message_id)).toEqual(["bn-1"]);
  });

  it("a sync that throws is recorded as failed and holds dispatch; a run whose record can't be saved says so", async () => {
    const store = memoryStore();
    const down = gmail({ ...base, "oauth2.googleapis.com/token": () => json({ error: "server" }, 503) });
    expect(await runReplySync({ store, env: ENV, fetch: down.f })).toMatchObject({ status: "failed", run_recorded: true });
    expect(store.syncRuns.at(-1)).toMatchObject({ status: "failed" });
    expect(await dispatchFirstContact("OC-901", "cowork", { store, env: ENV, fetch: gmail(base).f })).toMatchObject({ status: "held", holds: ["reply_sync_unhealthy"] });
    expect(await runReplySync({ store, env: ENV, fetch: gmail(base).f })).toMatchObject({ status: "ok", run_recorded: true });
    expect(await runReplySync({ store: memoryStore({ failSyncRecord: true }), env: ENV, fetch: gmail(base).f })).toMatchObject({ status: "ok", run_recorded: false });
  });

  it("an opt-out that wasn't saved leaves the run incomplete, which holds dispatch until a later run saves it", async () => {
    const store = memoryStore({ fail: [{ kind: "opted_out", code: "42501", times: 1 }] });
    await contactedTo(store);
    const { f } = gmail({
      ...base,
      "/threads/th-OC-901": () => json({ messages: [{ id: "u1", internalDate: String(Date.parse("2026-10-07T03:00:00Z")), snippet: "unsubscribe", payload: { headers: [{ name: "From", value: "office@fixture.example" }] } }] }),
    });
    expect(await runReplySync({ store, env: ENV, fetch: f })).toMatchObject({ status: "incomplete", run_recorded: true });
    expect(replyHealthy(store)).toBe(false);
    expect(await runReplySync({ store, env: ENV, fetch: f })).toMatchObject({ status: "ok", run_recorded: true });
    expect(replyHealthy(store)).toBe(true);
  });
});

const replyHealthy = (store: { syncRuns: SyncRun[] }) => replySyncHealthy(store.syncRuns.at(-1) ?? null, new Date());

describe("gmail helpers", () => {
  it("reads config from env names only", () => {
    expect(gmailConfig({})).toBeNull();
    expect(gmailConfig(ENV)).toEqual({ clientId: "cid", clientSecret: "csecret", refreshToken: "rtoken" });
  });
  it("can't be header-injected through the subject or recipient", () => {
    const raw = buildRaw({ from: SENDER, to: "a@example.test\r\nBcc: x@example.test", subject: "Hi\r\nBcc: y@example.test", body: "b", messageId: MSGID });
    const head = Buffer.from(raw, "base64url").toString("utf8").split("\r\n\r\n")[0];
    expect(head.split("\r\n").some((l) => l.startsWith("Bcc:"))).toBe(false);
  });
  it("encodes a non-ASCII subject", () => {
    const head = Buffer.from(buildRaw({ from: SENDER, to: "a@example.test", subject: "Café quote", body: "b", messageId: MSGID }), "base64url").toString("utf8");
    expect(head).toContain(`Subject: =?UTF-8?B?${Buffer.from("Café quote").toString("base64")}?=`);
  });
});
