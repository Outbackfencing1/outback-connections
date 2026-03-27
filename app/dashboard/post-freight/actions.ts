"use server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

const FreightSchema = z.object({
  title: z.string().min(3, "Title is too short"),
  origin: z.string().optional(),
  destination: z.string().optional(),
  description: z.string().min(10, "Description is too short"),
  weight: z.string().optional(),
  vehicle_type: z.string().optional(),
  budget: z.string().optional(),
  contact_email: z.string().email("Invalid email").optional().or(z.literal("")),
  contact_phone: z.string().optional(),
});

export async function createFreightListing(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const parsed = FreightSchema.safeParse({
    title: raw.title,
    origin: raw.origin,
    destination: raw.destination,
    description: raw.description,
    weight: raw.weight,
    vehicle_type: raw.vehicle_type,
    budget: raw.budget,
    contact_email: raw.contact_email,
    contact_phone: raw.contact_phone,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(", ");
    return { ok: false as const, message: msg };
  }

  const supa = supabaseAdmin();
  if (!supa) {
    return {
      ok: false as const,
      message: "Database is not configured yet. Freight posting will be available soon.",
    };
  }

  const { error } = await supa.from("freight_listings").insert({
    title: parsed.data.title,
    origin: parsed.data.origin || null,
    destination: parsed.data.destination || null,
    description: parsed.data.description,
    weight: parsed.data.weight || null,
    vehicle_type: parsed.data.vehicle_type || null,
    budget: parsed.data.budget || null,
    contact_email: parsed.data.contact_email || null,
    contact_phone: parsed.data.contact_phone || null,
    status: "open",
  });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/freight");
  return { ok: true as const };
}
