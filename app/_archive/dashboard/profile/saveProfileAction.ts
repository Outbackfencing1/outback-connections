"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

const ProfileSchema = z.object({
  handle: z.string().max(60).optional(),
  company: z.string().max(200).optional(),
  abn: z.string().max(20).optional(),
  serviceAreas: z.string().optional(),
  skills: z.string().optional(),
  rateType: z.enum(["hourly", "day", ""]).optional(),
  rateAmount: z.number().min(0).max(100000).optional(),
  licence: z.string().max(100).optional(),
  insured: z.boolean().optional(),
  insuranceExp: z.string().optional(),
  bio: z.string().max(2000).optional(),
  portfolio: z.string().optional(),
});

export async function saveProfile(data: unknown) {
  const session = await auth();
  if (!session?.user?.email) return false;

  const supa = supabaseAdmin();
  if (!supa) return false;

  const parsed = ProfileSchema.safeParse(data);
  if (!parsed.success) return false;

  const d = parsed.data;

  const row = {
    user_email: session.user.email,
    handle: d.handle || null,
    company: d.company || null,
    abn: d.abn || null,
    service_areas: d.serviceAreas
      ? d.serviceAreas.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    skills: d.skills
      ? d.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    rate_type: d.rateType || null,
    rate_amount: d.rateAmount ?? 0,
    licence: d.licence || null,
    insured: d.insured ?? false,
    insurance_exp: d.insuranceExp || null,
    bio: d.bio || null,
    portfolio: d.portfolio
      ? d.portfolio.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  };

  const { error } = await supa
    .from("profiles")
    .upsert(row, { onConflict: "user_email" });

  if (error) {
    console.error("saveProfile error:", error.message);
    return false;
  }

  revalidatePath("/dashboard/profile");
  if (row.handle) revalidatePath(`/c/${row.handle}`);
  return true;
}
