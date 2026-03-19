"use server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

const JobSchema = z.object({
  title: z.string().min(3, "Title is too short"),
  location: z.string().optional(),
  rate: z.string().optional(),
  description: z.string().min(10, "Description is too short"),
});

export async function createJob(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const parsed = JobSchema.safeParse({
    title: raw.title,
    location: raw.location,
    rate: raw.rate,
    description: raw.description,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(", ");
    return { ok: false as const, message: msg };
  }

  const supa = supabaseAdmin();
  if (!supa) {
    return {
      ok: false as const,
      message: "Database is not configured yet. Job posting will be available soon.",
    };
  }

  // Generate a URL-friendly slug from the title
  const slug = parsed.data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { error } = await supa.from("jobs").insert({
    title: parsed.data.title,
    location: parsed.data.location || null,
    rate: parsed.data.rate || null,
    description: parsed.data.description,
    slug,
    status: "open",
  });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/dashboard/opportunities");
  revalidatePath("/opportunities");
  return { ok: true as const };
}
