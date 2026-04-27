"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ToggleResult =
  | { ok: true; active: boolean }
  | { ok: false; message: string };

export async function setLockdown(input: {
  active: boolean;
  reason: string;
}): Promise<ToggleResult> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in first." };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return { ok: false, message: "Admin only." };
  }

  if (input.active && (!input.reason || input.reason.trim().length < 3)) {
    return { ok: false, message: "Give a short reason before activating." };
  }

  const { error } = await supabase.rpc("admin_set_lockdown", {
    p_active: input.active,
    p_reason: input.active ? input.reason.trim().slice(0, 200) : null,
  });
  if (error) {
    console.error("[lockdown] rpc failed:", error.message);
    return { ok: false, message: "Couldn't toggle lockdown." };
  }

  revalidateTag("lockdown");
  return { ok: true, active: input.active };
}
