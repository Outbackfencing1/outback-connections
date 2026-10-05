// lib/digital-services/owner.ts — server wrapper around decideOwnerAccess.
// Uses supabase.auth.getUser(), which verifies the session with Supabase Auth
// (not just a cookie decode). Call it at the top of every owner page and
// server action; never rely on hiding a link.
import { createClient } from "@/lib/supabase/server";
import { decideOwnerAccess, type OwnerDecision } from "./owner-access";

export async function getOwnerAccess(): Promise<OwnerDecision> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return decideOwnerAccess(data.user?.id ?? null, process.env.DIGITAL_SERVICES_OWNER_USER_ID);
}
