// lib/auth-events.ts
// Best-effort logger for auth events. Used for the user-visible 'recent
// account activity' section on /dashboard/privacy and for fraud / abuse
// investigations. All sends are fire-and-forget — never block a sign-in
// because logging failed.
import { headers } from "next/headers";
import { createAdminClient } from "./supabase/admin";

export type AuthEventType =
  | "magic_link_requested"
  | "magic_link_used"
  | "password_signin"
  | "password_signup"
  | "password_reset_requested"
  | "password_reset_completed"
  | "sign_out"
  | "failed_signin";

export type LogAuthEventInput = {
  userId?: string | null;
  email?: string | null;
  eventType: AuthEventType;
};

export function getRequestContext(): { ip: string | null; userAgent: string | null } {
  try {
    const h = headers();
    const fwd = h.get("x-forwarded-for");
    const ip = fwd ? fwd.split(",")[0]?.trim() ?? null : h.get("x-real-ip");
    const ua = h.get("user-agent");
    return { ip: ip || null, userAgent: ua || null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function logAuthEvent(input: LogAuthEventInput): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { ip, userAgent } = getRequestContext();
    await admin.from("auth_events").insert({
      user_id: input.userId ?? null,
      email: input.email ?? null,
      event_type: input.eventType,
      ip,
      user_agent: userAgent,
    });
  } catch (e) {
    console.error("[auth-events] insert failed:", e);
  }
}
