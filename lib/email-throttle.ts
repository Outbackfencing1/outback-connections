// lib/email-throttle.ts
// Simple in-memory token-bucket throttle for outgoing transactional email.
// Hard cap: BULK_EMAIL_PER_HOUR (default 100) sends per hour. When the bucket
// is exhausted, returns ok:false rather than sending. The kill-switch env var
// EMAIL_THROTTLE_DISABLED=true blocks ALL outgoing email (incident response).
//
// In-memory means the limit resets on every cold start of a serverless
// instance, which on Vercel could be many resets per hour. That is FINE for
// the current scale: a true shared limit would need Redis/Postgres and the
// brief asks for a hard cap, not perfection. The kill switch is the real
// safety net.
//
// All call sites that want hardening should use sendThrottledEmail in place
// of sendEmail. Direct sendEmail is left intact for places that have their
// own sequencing (e.g. one-off transactional sends to a single recipient).
import { sendEmail, type EmailResult, type EmailSendInput } from "./email";

const PER_HOUR = parseInt(process.env.BULK_EMAIL_PER_HOUR ?? "100", 10);
const WINDOW_MS = 60 * 60 * 1000;

type SendStamp = number;
const sendLog: SendStamp[] = [];

export type ThrottledResult =
  | EmailResult
  | { ok: false; throttled: true; reason: "kill_switch" | "rate_limit"; available_in_seconds?: number };

function pruneOld() {
  const cutoff = Date.now() - WINDOW_MS;
  while (sendLog.length > 0 && sendLog[0] < cutoff) {
    sendLog.shift();
  }
}

export function getEmailQuota(): { sentInLastHour: number; remaining: number; capPerHour: number } {
  pruneOld();
  return {
    sentInLastHour: sendLog.length,
    remaining: Math.max(0, PER_HOUR - sendLog.length),
    capPerHour: PER_HOUR,
  };
}

export async function sendThrottledEmail(opts: EmailSendInput): Promise<ThrottledResult> {
  if (process.env.EMAIL_THROTTLE_DISABLED === "true") {
    console.warn("[email-throttle] kill switch active — refusing to send.");
    return { ok: false, throttled: true, reason: "kill_switch" };
  }

  pruneOld();
  if (sendLog.length >= PER_HOUR) {
    const oldest = sendLog[0];
    const waitSec = Math.ceil((WINDOW_MS - (Date.now() - oldest)) / 1000);
    console.warn("[email-throttle] rate limit hit. retry in", waitSec, "s");
    return {
      ok: false,
      throttled: true,
      reason: "rate_limit",
      available_in_seconds: waitSec,
    };
  }

  const result = await sendEmail(opts);
  if (result.ok) {
    sendLog.push(Date.now());
  }
  return result;
}
