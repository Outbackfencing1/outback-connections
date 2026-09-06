// lib/directory-access.ts
// Who may add unclaimed directory entries. Admins always can. A user with
// user_profiles.directory_contributor = true can too, and gets nothing else.
// The flag is only writable by the service role (no own-row UPDATE policy).
import { createClient } from "@/lib/supabase/server";

export type DirectoryAccess =
  | { ok: true; userId: string; isAdmin: boolean }
  | { ok: false; reason: "not_signed_in" | "forbidden"; message: string };

export async function requireDirectoryContributor(): Promise<DirectoryAccess> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, reason: "not_signed_in", message: "Sign in first." };
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, directory_contributor")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  const isAdmin = !!profile?.is_admin;
  if (!isAdmin && !profile?.directory_contributor) {
    return {
      ok: false,
      reason: "forbidden",
      message:
        "Your account isn't set up to add directory entries. Ask an admin to switch it on.",
    };
  }
  return { ok: true, userId: userData.user.id, isAdmin };
}
