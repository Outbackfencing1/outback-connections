"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAuthEvent } from "@/lib/auth-events";

export async function signOut() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  if (data.user) {
    void logAuthEvent({
      userId: data.user.id,
      email: data.user.email ?? null,
      eventType: "sign_out",
    });
  }
  redirect("/");
}
