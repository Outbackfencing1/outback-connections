// lib/signed-tokens.ts
// HMAC-signed URL tokens for actions that need to be triggered from email
// without a session: listing renewal, unsubscribe, account-magic-link
// recovery if we ever add it.
//
// Token format: base64url(payload).base64url(signature)
// Payload is JSON: { p: purpose, u: user_id, l: listing_id?, e: exp_ms }
// Signature is HMAC-SHA256 over the base64url(payload) with URL_SIGNING_SECRET.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.URL_SIGNING_SECRET;

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8");
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export type SignedTokenPayload = {
  /** What this token authorises. e.g. 'renew', 'unsubscribe' */
  p: string;
  /** Subject user id */
  u: string;
  /** Optional listing id for listing-scoped purposes */
  l?: string;
  /** Expiry as unix ms */
  e: number;
};

export function signToken(payload: Omit<SignedTokenPayload, "e"> & { ttlMs: number }): string {
  if (!SECRET) {
    throw new Error("URL_SIGNING_SECRET not configured");
  }
  const { ttlMs, ...rest } = payload;
  const body: SignedTokenPayload = { ...rest, e: Date.now() + ttlMs };
  const encoded = b64url(JSON.stringify(body));
  const sig = b64url(createHmac("sha256", SECRET).update(encoded).digest());
  return `${encoded}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: SignedTokenPayload }
  | { ok: false; reason: "no_secret" | "malformed" | "bad_signature" | "expired" };

export function verifyToken(token: string): VerifyResult {
  if (!SECRET) return { ok: false, reason: "no_secret" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [encoded, sig] = parts;

  const expectedSig = b64url(createHmac("sha256", SECRET).update(encoded).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: SignedTokenPayload;
  try {
    payload = JSON.parse(fromB64url(encoded).toString("utf8")) as SignedTokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload.e !== "number" || payload.e < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}
