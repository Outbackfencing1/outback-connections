"use server";

import { redirect } from "next/navigation";
import {
  checkPostingGuard,
  checkPostingRateLimit,
  getLatestPolicyVersionId,
  honeypotTripped,
  insertListing,
  saleSchema,
  setFlash,
  valuesFrom,
  zodErrorsToMap,
  type ActionResult,
} from "@/lib/posting";
import { dollarsToCents } from "@/lib/sale";

export async function postForSale(formData: FormData): Promise<ActionResult> {
  const guard = await checkPostingGuard();
  if (!guard.ok) return { ok: false, errors: { _: guard.message } };

  if (honeypotTripped(formData)) {
    redirect("/dashboard/listings");
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = saleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: zodErrorsToMap(parsed.error), values: valuesFrom(formData) };
  }
  const data = parsed.data;

  const rl = await checkPostingRateLimit(guard.userId);
  if (!rl.ok) {
    return { ok: false, errors: { _: rl.message }, values: valuesFrom(formData) };
  }

  const policyId = await getLatestPolicyVersionId();
  if (!policyId) {
    return { ok: false, errors: { _: "The site isn't ready to accept listings just now. Try again shortly." } };
  }

  const cents = dollarsToCents(data.price);
  const result = await insertListing(
    {
      user_id: guard.userId,
      kind: "for_sale",
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
    "sale_details",
    {
      price_cents: typeof cents === "number" ? cents : null,
      price_type: data.price_type,
      quantity: data.quantity ?? null,
      unit: data.unit || null,
      condition: data.condition ?? "na",
      delivery: data.delivery ?? "pickup",
    }
  );

  if (!result.ok) {
    return { ok: false, errors: { _: result.message }, values: valuesFrom(formData) };
  }

  await setFlash(`Posted for sale: ${data.title}`);
  redirect("/dashboard/listings");
}
