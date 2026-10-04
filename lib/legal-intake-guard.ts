// lib/legal-intake-guard.ts
// Spam guard for the two public legal-concern forms (the listing "Report a
// legal concern" form and /legal/concerns-notice). Both need no account,
// write a defamation_complaints row and email the team, so a script could
// flood both. A genuine complaint must still get through, so the limits are
// loose and every refusal points to the help@ inbox. Counting errors fail
// open, like lib/rate-limit.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { honeypotTripped } from "@/lib/posting";

const WINDOW_MS = 60 * 60 * 1000;
const PER_EMAIL_MAX = 3;
const ALL_MAX = 20;
const REFUSED =
  "We've had a lot of reports in the last hour, so this one didn't go through. Email help@outbackconnections.com.au and we'll pick it up from there.";

export async function legalIntakeGuard(
  admin: SupabaseClient,
  formData: FormData,
  complainantEmail: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (honeypotTripped(formData)) {
    return { ok: false, message: "That didn't go through. Email help@outbackconnections.com.au instead." };
  }
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const [mine, all] = await Promise.all([
    admin
      .from("defamation_complaints")
      .select("id", { count: "exact", head: true })
      .ilike("complainant_email", complainantEmail.replace(/[%_\\]/g, "\\$&"))
      .gte("received_at", since),
    admin.from("defamation_complaints").select("id", { count: "exact", head: true }).gte("received_at", since),
  ]);
  if (!mine.error && (mine.count ?? 0) >= PER_EMAIL_MAX) return { ok: false, message: REFUSED };
  if (!all.error && (all.count ?? 0) >= ALL_MAX) return { ok: false, message: REFUSED };
  return { ok: true };
}
