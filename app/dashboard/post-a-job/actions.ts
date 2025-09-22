"use server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

const JobSchema = z.object({
  title: z.string().min(3, "Title is too short"),
  company: z.string().optional(),
  location: z.string().optional(),
  pay_rate: z.string().optional(),
  description: z.string().min(10, "Description is too short"),
});

export async function createJob(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const parsed = JobSchema.safeParse({
    title: raw.title,
    company: raw.company,
    location: raw.location,
    pay_rate: raw.pay_rate,
    description: raw.description,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(", ");
    return { ok: false as const, message: msg };
  }

  const supa = supabaseAdmin();
  const { error } = await supa.from("jobs").insert({
    ...parsed.data,
    status: "open",
  });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  // Refresh listings
  revalidatePath("/dashboard/opportunities");
  revalidatePath("/opportunities");
  return { ok: true as const };
}
