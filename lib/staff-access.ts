// lib/staff-access.ts
// Two tiers. Staff (user_profiles.is_staff) run the day-to-day: outreach
// workspace, enquiry queue, directory add, bulk import, reports. Admins do
// everything staff do plus moderation, lockdown, flags, duplicate accounts,
// incidents and claim approval. Both flags are service-role-only to set.
import { createClient } from "@/lib/supabase/server";

export type StaffAccess =
  | { ok: true; userId: string; email: string | null; isAdmin: boolean; isStaff: boolean }
  | { ok: false; reason: "not_signed_in" | "forbidden"; message: string };

export async function getStaffAccess(): Promise<StaffAccess> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, reason: "not_signed_in", message: "Sign in first." };
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  const isAdmin = !!profile?.is_admin;
  const isStaff = isAdmin || !!profile?.is_staff;
  if (!isStaff) {
    return { ok: false, reason: "forbidden", message: "Staff and admins only." };
  }
  return { ok: true, userId: userData.user.id, email: userData.user.email ?? null, isAdmin, isStaff };
}
