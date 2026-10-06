// Persona session cookies for @supabase/ssr against the local gateway.
import { sign } from "./jwt.mjs";
export const PERSONAS = {
  member: { id: "11111111-1111-4111-8111-111111111111", email: "member@example.test" },
  admin: { id: "22222222-2222-4222-8222-222222222222", email: "admin@example.test" },
  owner: { id: "33333333-3333-4333-8333-333333333333", email: "owner@example.test" },
};
export function sessionCookie(persona, secret, gatewayUrl) {
  const p = PERSONAS[persona];
  const access_token = sign({ sub: p.id, role: "authenticated", aud: "authenticated", email: p.email }, secret);
  const expires_at = Math.floor(Date.now() / 1000) + 6 * 3600;
  const session = { access_token, token_type: "bearer", expires_in: 6 * 3600, expires_at, refresh_token: "local-refresh", user: { id: p.id, aud: "authenticated", role: "authenticated", email: p.email } };
  const ref = new URL(gatewayUrl).hostname.split(".")[0];
  return { name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") };
}
