// HS256 JWTs for the LOCAL stack only (random per-run secret; never a real key).
import { createHmac } from "node:crypto";
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
export function sign(payload, secret) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 6 * 3600, ...payload });
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
export function verify(token, secret) {
  const [h, b, s] = String(token).split(".");
  if (!h || !b || !s) return null;
  const want = createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url");
  if (want !== s) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp > Date.now() / 1000 ? p : null;
}
