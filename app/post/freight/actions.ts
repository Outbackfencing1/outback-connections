"use server";

import { redirect } from "next/navigation";
import {
  checkPostingGuard,
  checkPostingRateLimit,
  freightSchema,
  getLatestPolicyVersionId,
  honeypotTripped,
  insertListing,
  setFlash,
  valuesFrom,
  zodErrorsToMap,
  type ActionResult,
} from "@/lib/posting";

export async function postFreight(formData: FormData): Promise<ActionResult> {
  const guard = await checkPostingGuard();
  if (!guard.ok) return { ok: false, errors: { _: guard.message } };

  if (honeypotTripped(formData)) {
    redirect("/dashboard/listings");
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = freightSchema.safeParse(raw);
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
      kind: "freight",
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
    "freight_details",
    {
      direction: data.direction,
      origin_postcode: data.origin_postcode || null,
      destination_postcode: data.destination_postcode || null,
      vehicle_type: data.vehicle_type ?? null,
      cargo_type: data.cargo_type ?? null,
      weight_kg: data.weight_kg ?? null,
      pickup_from_date: data.pickup_from_date ?? null,
      pickup_by_date: data.pickup_by_date ?? null,
      budget_bracket: data.budget_bracket ?? null,
    }
  );

  if (!result.ok) {
    return { ok: false, errors: { _: result.message }, values: valuesFrom(formData) };
  }

  setFlash(`Posted: ${data.title}`);
  redirect("/dashboard/listings");
}
