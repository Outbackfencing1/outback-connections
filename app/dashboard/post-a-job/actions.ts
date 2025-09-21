// app/dashboard/post-a-job/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export async function createJob(formData: FormData) {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error(
      "Database not configured. Add Vercel Postgres to this project so you can post jobs."
    );
  }

  const title = String(formData.get("title") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const rate = String(formData.get("rate") || "").trim();
  const description = String(formData.get("description") || "").trim();

  if (!title || !location || !description) {
    throw new Error("Please fill in title, location, and description.");
  }

  // Build a slug and ensure uniqueness
  let base = slugify(`${title}-${location}`);
  if (!base) base = `job-${Date.now()}`;
  let slug = base;

  // If a job already exists with this slug, add a suffix
  let i = 2;
  while (await prisma.job.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }

  const job = await prisma.job.create({
    data: {
      slug,
      title,
      location,
      rate: rate || null,
      description,
      status: "OPEN",
    },
  });

  // Revalidate the list page and go to the details page
  revalidatePath("/dashboard/opportunities");
  redirect(`/dashboard/opportunities/${job.slug}`);
}
