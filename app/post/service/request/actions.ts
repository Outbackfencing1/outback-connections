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

export async function postServiceRequest(formData: FormData): Promise<ActionResult> {
  const guard = await checkPostingGuard();
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

  setFlash(`Posted: ${data.title}`);
  redirect("/dashboard/listings");
}
