"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Form payload for saving/updating a contractor profile.
 * You can adjust these names to match your form field names.
 */
export type ProfileInput = {
  company?: string;
  abn?: string;
  serviceAreas?: string; // comma-separated (e.g. "2800, 2795")
  skills?: string;       // comma-separated (e.g. "hinge joint, gates")
  rateType?: string;
  rateAmount?: number;
  licence?: string;
  insured?: boolean;
  insuranceExp?: string; // yyyy-mm-dd
  bio?: string;
  portfolio?: string;    // comma-separated URLs
};

export async function saveProfile(input: ProfileInput) {
  const session = await auth();
  if (!session?.user?.id) return false;

  const userId = (session.user as any).id as string;

  const toArray = (csv?: string) =>
    csv
      ? csv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const data: any = {
    company: input.company,
    abn: input.abn,
    rateType: input.rateType,
    rateAmount: input.rateAmount ?? undefined,
    licence: input.licence,
    insured: input.insured ?? undefined,
    insuranceExp: input.insuranceExp ? new Date(input.insuranceExp) : undefined,
    bio: input.bio,
    serviceAreas: toArray(input.serviceAreas),
    skills: toArray(input.skills),
    portfolio: toArray(input.portfolio),
  };

  await prisma.contractorProfile.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      company: input.company ?? "",
      ...data,
    },
  });

  return true;
}
