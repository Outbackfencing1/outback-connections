"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  freightSchema,
  honeypotTripped,
  jobSchema,
  serviceSchema,
  setFlash,
  valuesFrom,
  zodErrorsToMap,
  type ActionResult,
} from "@/lib/posting";

/**
 * Edit a listing in place. Polymorphic on listing.kind. Verifies ownership
 * server-side, validates with the right schema, updates listings + detail.
 *
 * UPDATE doesn't have the orphan risk that INSERT does — both rows already
 * exist. If the second update fails, we have a partial state but the listing
 * remains intact (worst case: title saved, detail not). Caller can retry.
 */
export async function editListing(formData: FormData): Promise<ActionResult> {
  const id = formData.get("listing_id");
  if (typeof id !== "string" || !id) {
    return { ok: false, errors: { _: "Missing listing id" } };
  }

  if (honeypotTripped(formData)) {
    redirect("/dashboard/listings");
  }

  // Auth check (server client respects RLS; we'll need admin for the update)
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, errors: { _: "Sign in to edit listings" } };
  }

  // Load existing listing to get its kind + verify ownership
  const { data: existing } = await supabase
    .from("listings")
    .select("id, kind, user_id, postcode, slug")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return { ok: false, errors: { _: "Listing not found" } };
  }
  if (existing.user_id !== userData.user.id) {
    return { ok: false, errors: { _: "That listing isn't yours" } };
  }

  const raw = Object.fromEntries(formData.entries());
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, errors: { _: "Edit isn't configured. Try again later." } };
  }

  if (existing.kind === "job") {
    const parsed = jobSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        errors: zodErrorsToMap(parsed.error),
        values: valuesFrom(formData),
      };
    }
    const data = parsed.data;

    const { error: lErr } = await admin
      .from("listings")
      .update({
        category_id: data.category_id,
        title: data.title,
        description: data.description,
        postcode: data.postcode,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        contact_best_time: data.contact_best_time || null,
      })
      .eq("id", id);

    if (lErr) return { ok: false, errors: { _: "Couldn't save listing." } };

    const { error: dErr } = await admin
      .from("job_details")
      .update({
        work_type: data.work_type ?? null,
        pay_type: data.pay_type ?? null,
        pay_amount: data.pay_amount ?? null,
        start_date: data.start_date ?? null,
        duration_text: data.duration_text || null,
        accommodation_provided: data.accommodation_provided,
      })
      .eq("listing_id", id);

    if (dErr) return { ok: false, errors: { _: "Couldn't save job details." } };
  } else if (existing.kind === "freight") {
    const parsed = freightSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        errors: zodErrorsToMap(parsed.error),
        values: valuesFrom(formData),
      };
    }
    const data = parsed.data;

    const { error: lErr } = await admin
      .from("listings")
      .update({
        category_id: data.category_id,
        title: data.title,
        description: data.description,
        postcode: data.postcode,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        contact_best_time: data.contact_best_time || null,
      })
      .eq("id", id);
    if (lErr) return { ok: false, errors: { _: "Couldn't save listing." } };

    const { error: dErr } = await admin
      .from("freight_details")
      .update({
        direction: data.direction,
        origin_postcode: data.origin_postcode || null,
        destination_postcode: data.destination_postcode || null,
        vehicle_type: data.vehicle_type ?? null,
        cargo_type: data.cargo_type ?? null,
        weight_kg: data.weight_kg ?? null,
        pickup_from_date: data.pickup_from_date ?? null,
        pickup_by_date: data.pickup_by_date ?? null,
        budget_bracket: data.budget_bracket ?? null,
      })
      .eq("listing_id", id);
    if (dErr) return { ok: false, errors: { _: "Couldn't save freight details." } };
  } else {
    // service_offering or service_request
    const parsed = serviceSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        errors: zodErrorsToMap(parsed.error),
        values: valuesFrom(formData),
      };
    }
    const data = parsed.data;

    const { error: lErr } = await admin
      .from("listings")
      .update({
        category_id: data.category_id,
        title: data.title,
        description: data.description,
        postcode: data.postcode,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        contact_best_time: data.contact_best_time || null,
      })
      .eq("id", id);
    if (lErr) return { ok: false, errors: { _: "Couldn't save listing." } };

    const { error: dErr } = await admin
      .from("service_details")
      .update({
        rate_type: data.rate_type ?? null,
        rate_amount: data.rate_amount ?? null,
        travel_willingness: data.travel_willingness ?? null,
        // direction stays whatever it was — we don't let edit change kind
      })
      .eq("listing_id", id);
    if (dErr) return { ok: false, errors: { _: "Couldn't save service details." } };
  }

  setFlash(`Saved changes to your listing.`);
  revalidatePath("/dashboard/listings");
  revalidatePath(`/dashboard/listings/${id}/edit`);
  redirect("/dashboard/listings");
}
