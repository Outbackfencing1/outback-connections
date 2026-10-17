"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SearchAlertState = {
  ok?: boolean;
  error?: string;
};

export async function subscribeSearchAlert(
  _prev: SearchAlertState,
  formData: FormData
): Promise<SearchAlertState> {
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const verticalRaw = String(formData.get("vertical") ?? "").trim();
  const signalRaw = String(formData.get("signal") ?? "all").trim() || "all";
  const postcodeRaw = String(formData.get("postcode") ?? "").trim();

  if (!emailRaw || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw)) {
    return { error: "Enter a valid email address." };
  }
  if (!["job", "sale", "freight", "service"].includes(verticalRaw)) {
    return { error: "Invalid board." };
  }
  if (postcodeRaw && !/^\d{4}$/.test(postcodeRaw)) {
    return { error: "Enter a 4-digit Australian postcode (or leave blank for Australia-wide)." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Server configuration error." };
  }

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  const { data: existing } = await admin
    .from("search_alerts")
    .select("id")
    .ilike("email", emailRaw)
    .eq("vertical", verticalRaw)
    .eq("signal", signalRaw)
    .eq("postcode", postcodeRaw || "")
    .maybeSingle();

  if (existing) {
    await admin
      .from("search_alerts")
      .update({ active: true, user_id: userId })
      .eq("id", existing.id);
    return { ok: true };
  }

  const { error: insertErr } = await admin.from("search_alerts").insert({
    user_id: userId,
    email: emailRaw,
    vertical: verticalRaw,
    signal: signalRaw,
    postcode: postcodeRaw || null,
    active: true,
  });

  if (insertErr) {
    // If dedup index hit, still succeed
    return { ok: true };
  }

  return { ok: true };
}
