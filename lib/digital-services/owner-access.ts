// lib/digital-services/owner-access.ts
// Digital-services data belongs to Josh alone: prospects, enquiries, drafts,
// payments. Marketplace admin status is NOT enough. Access requires a
// signed-in user whose verified auth id equals DIGITAL_SERVICES_OWNER_USER_ID
// (a server-only env var holding Josh's auth.users id). If the variable is
// missing or malformed, nobody gets in: fail closed with a readiness message.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OwnerDecision =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_signed_in" | "forbidden" | "not_configured" };

export function decideOwnerAccess(userId: string | null | undefined, configuredOwnerId: string | undefined): OwnerDecision {
  const owner = (configuredOwnerId ?? "").trim();
  // Sign-in first, so a logged-out visitor learns nothing about configuration.
  if (!userId) return { ok: false, reason: "not_signed_in" };
  if (!UUID.test(owner)) return { ok: false, reason: "not_configured" };
  if (userId.toLowerCase() !== owner.toLowerCase()) return { ok: false, reason: "forbidden" };
  return { ok: true, userId };
}
