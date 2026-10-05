// lib/digital-services/outreach/gmail.ts
// Gmail REST transport for the Outback Connections outreach sender, using the
// Google Workspace mailbox that already handles the domain's mail (MX → Google).
// No paid service: an OAuth client in Josh's own Google Cloud project with a
// refresh token for the mailbox that owns the sender alias. Scopes:
// gmail.send (send) and gmail.readonly (send-as check, reconciliation, replies).
//
// Nothing here decides WHETHER to send; dispatch.ts does that (guard, intent
// record, kill switch). This module only talks to Gmail and reports what Gmail
// said, distinguishing a definite refusal from an unknown outcome.
// Setup: docs/digital-services/OUTREACH-SENDER.md.

export type GmailConfig = { clientId: string; clientSecret: string; refreshToken: string };
export type Fetch = typeof fetch;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"];

/** Env names only; values live in Vercel (server-only), never in the repository. */
export function gmailConfig(env: Record<string, string | undefined> = process.env): GmailConfig | null {
  const clientId = env.DIGITAL_SERVICES_GMAIL_CLIENT_ID?.trim();
  const clientSecret = env.DIGITAL_SERVICES_GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = env.DIGITAL_SERVICES_GMAIL_REFRESH_TOKEN?.trim();
  return clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken } : null;
}

export class GmailError extends Error {
  /** definite: Gmail answered and refused (nothing was sent). unknown: we can't tell. */
  constructor(
    message: string,
    readonly outcome: "definite" | "unknown",
    readonly status?: number
  ) {
    super(message);
  }
}

export async function accessToken(cfg: GmailConfig, f: Fetch = fetch): Promise<string> {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: "refresh_token" }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) throw new GmailError(`token refresh failed (${res.status} ${json.error ?? ""})`.trim(), "definite", res.status);
  return json.access_token;
}

async function get<T>(token: string, path: string, f: Fetch): Promise<T> {
  const res = await f(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new GmailError(`Gmail ${path.split("?")[0]} ${res.status}`, res.status >= 500 || res.status === 429 ? "unknown" : "definite", res.status);
  return (await res.json()) as T;
}

/** The sender must be this mailbox's address or an accepted send-as alias. */
export async function confirmSendAs(token: string, address: string, f: Fetch = fetch): Promise<boolean> {
  const { sendAs = [] } = await get<{ sendAs?: { sendAsEmail: string; verificationStatus?: string; isPrimary?: boolean }[] }>(token, "/settings/sendAs", f);
  const want = address.trim().toLowerCase();
  return sendAs.some((s) => s.sendAsEmail.toLowerCase() === want && (s.isPrimary || s.verificationStatus === "accepted"));
}

/** Our own Message-ID, generated before sending so an unknown outcome can be reconciled. */
export function newMessageId(domain = "outbackconnections.com.au", rand: () => string = () => crypto.randomUUID()): string {
  return `<oc-${rand()}@${domain}>`;
}

const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`);
const oneLine = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

/** A plain-text RFC 5322 message, base64url-encoded for Gmail's `raw`. */
export function buildRaw(m: { from: string; to: string; subject: string; body: string; messageId: string; date?: Date }): string {
  const headers = [
    `From: ${oneLine(m.from)}`,
    `To: ${oneLine(m.to)}`,
    `Subject: ${encodeHeader(oneLine(m.subject))}`,
    `Message-ID: ${oneLine(m.messageId)}`,
    `Date: ${(m.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    // A one-step opt-out that reaches the same monitored mailbox.
    `List-Unsubscribe: <mailto:${oneLine(m.from)}?subject=unsubscribe>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body = Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

/**
 * Send one message. A 4xx answer (other than 429) is a definite refusal: Gmail
 * didn't accept it. A network failure, timeout, 429 or 5xx is unknown: it may
 * have been sent, so the caller must reconcile, never resend.
 */
export async function sendRaw(token: string, raw: string, f: Fetch = fetch): Promise<{ id: string; threadId: string }> {
  let res: Response;
  try {
    res = await f(`${API}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
  } catch (e) {
    throw new GmailError(`send: ${(e as Error).message}`, "unknown");
  }
  if (!res.ok) throw new GmailError(`send ${res.status}`, res.status >= 500 || res.status === 429 ? "unknown" : "definite", res.status);
  const json = (await res.json().catch(() => null)) as { id?: string; threadId?: string } | null;
  if (!json?.id || !json.threadId) throw new GmailError("send: accepted without message ids", "unknown", res.status);
  return { id: json.id, threadId: json.threadId };
}

/**
 * Look for a message we may have sent: first by our Message-ID; if Gmail
 * rewrote it, by recipient and exact subject in Sent since the attempt. Only
 * a single unambiguous match counts.
 */
export async function findSent(
  token: string,
  q: { messageId: string; to: string; subject: string; since: Date },
  f: Fetch = fetch
): Promise<{ id: string; threadId: string } | "ambiguous" | null> {
  type List = { messages?: { id: string; threadId: string }[] };
  const byId = await get<List>(token, `/messages?q=${encodeURIComponent(`rfc822msgid:${q.messageId}`)}&includeSpamTrash=true`, f);
  if (byId.messages?.length === 1) return byId.messages[0];
  if ((byId.messages?.length ?? 0) > 1) return "ambiguous";
  const after = Math.floor(q.since.getTime() / 1000) - 60;
  const search = `in:sent to:${q.to} after:${after}`;
  const list = await get<List>(token, `/messages?q=${encodeURIComponent(search)}`, f);
  const matches: { id: string; threadId: string }[] = [];
  for (const m of list.messages ?? []) {
    const meta = await get<{ payload?: { headers?: { name: string; value: string }[] } }>(token, `/messages/${m.id}?format=metadata&metadataHeaders=Subject`, f);
    const subject = meta.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
    if (subject.trim() === q.subject.trim()) matches.push(m);
  }
  if (matches.length === 1) return matches[0];
  return matches.length > 1 ? "ambiguous" : null;
}

export type ThreadMessage = { id: string; from: string; subject: string; snippet: string; internalDate: number };

export async function threadMessages(token: string, threadId: string, f: Fetch = fetch): Promise<ThreadMessage[]> {
  const t = await get<{ messages?: { id: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }[] }>(
    token,
    `/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
    f
  );
  const h = (m: { payload?: { headers?: { name: string; value: string }[] } }, n: string) =>
    m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
  return (t.messages ?? []).map((m) => ({ id: m.id, from: h(m, "from"), subject: h(m, "subject"), snippet: m.snippet ?? "", internalDate: Number(m.internalDate ?? 0) }));
}
