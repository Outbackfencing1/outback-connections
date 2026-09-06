"use server";

import { redirect } from "next/navigation";
import {
  checkPostingGuard,
  checkPostingRateLimit,
  getLatestPolicyVersionId,
  honeypotTripped,
  insertListing,
  serviceSchema,
  setFlash,
  valuesFrom,
  zodErrorsToMap,
  type ActionResult,
} from "@/lib/posting";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyProvidersOfRequest } from "@/lib/request-notify";

export async function postServiceRequest(formData: FormData): Promise<ActionResult> {
  // A farmer describing a job is demand, not supply: no 24h wait.
  const guard = await checkPostingGuard({ skipAccountAge: true });
  if (!guard.ok) return { ok: false, errors: { _: guard.message } };

  if (honeypotTripped(formData)) {
    redirect("/dashboard/listings");
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = serviceSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: zodErrorsToMap(parsed.error),
      values: valuesFrom(formData),
    };
  }
  const data = parsed.data;

  const rl = await checkPostingRateLimit(guard.userId);
  if (!rl.ok) {
    return { ok: false, errors: { _: rl.message }, values: valuesFrom(formData) };
  }

  const policyId = await getLatestPolicyVersionId();
  if (!policyId) {
    return {
      ok: false,
      errors: { _: "The site isn't ready to accept listings just now. Try again shortly." },
    };
  }

  const result = await insertListing(
    {
      user_id: guard.userId,
      kind: "service_request",
      category_id: data.category_id,
      title: data.title,
      description: data.description,
      postcode: data.postcode,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      contact_best_time: data.contact_best_time || null,
      policy_version_id: policyId,
      state: null,
      user_email: guard.email,
    },
    "service_details",
    {
      direction: "requesting",
      rate_type: data.rate_type ?? null,
      rate_amount: data.rate_amount ?? null,
      travel_willingness: data.travel_willingness ?? null,
    }
  );

  if (!result.ok) {
    return { ok: false, errors: { _: result.message }, values: valuesFrom(formData) };
  }

  // Tell claimed providers in the region. Best-effort; never blocks the post.
  let notified = 0;
  try {
    const admin = createAdminClient();
    const { data: cat } = admin
      ? await admin.from("categories").select("label").eq("id", data.category_id).maybeSingle()
      : { data: null };
    const out = await notifyProvidersOfRequest({
      categoryId: data.category_id,
      categoryLabel: cat?.label ?? "Services",
      postcode: data.postcode,
      title: data.title,
      slug: result.slug,
      reference: `REQ-${result.slug.slice(-8).toUpperCase()}`,
    });
    notified = out.notified;
  } catch (e) {
    console.error("[request] provider notify failed:", e);
  }

  await setFlash(
    notified > 0
      ? `Posted: ${data.title}. ${notified} listed business${notified === 1 ? "" : "es"} in your area ${notified === 1 ? "has" : "have"} been told.`
      : `Posted: ${data.title}`
  );
  redirect("/dashboard/listings");
}
