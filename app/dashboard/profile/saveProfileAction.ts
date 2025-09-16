"use server";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

export async function saveProfile(input: {
  handle: string;
  company: string;
  abn?: string;
  serviceAreas?: string; // comma list
  skills?: string;       // comma list
  rateType?: string;
  rateAmount?: number;
  licence?: string;
  insured?: boolean;
  insuranceExp?: string; // yyyy-mm-dd
  bio?: string;
  portfolio?: string;    // comma list
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return false;

  // persist handle on the User
  const handle = input.handle?.trim() || null;
  if (handle) {
    // ensure unique
    const existing = await prisma.user.findFirst({ where: { handle } });
    if (existing && existing.id !== (session.user as any).id) {
      throw new Error("Handle already taken");
    }
    await prisma.user.update({
      where: { id: (session.user as any).id },
      data: { handle },
    });
  }

  const toArray = (s?: string) =>
    s ? s.split(",").map(x => x.trim()).filter(Boolean) : [];

  await prisma.contractorProfile.upsert({
    where: { userId: (session.user as any).id },
    create: {
      userId: (session.user as any).id,
      company: input.company,
      abn: input.abn || null,
      serviceAreas: toArray(input.serviceAreas),
      skills: toArray(input.skills),
      rateType: input.rateType || null,
      rateAmount: input.rateAmount || null,
      licence: input.licence || null,
      insured: !!input.insured,
      insuranceExp: input.insuranceExp ? new Date(input.insuranceExp) : null,
      bio: input.bio || null,
      portfolio: toArray(input.portfolio),
    },
    update: {
      company: input.company,
      abn: input.abn || null,
      serviceAreas: toArray(input.serviceAreas),
      skills: toArray(input.skills),
      rateType: input.rateType || null,
      rateAmount: input.rateAmount || null,
      licence: input.licence || null,
      insured: !!input.insured,
      insuranceExp: input.insuranceExp ? new Date(input.insuranceExp) : null,
      bio: input.bio || null,
      portfolio: toArray(input.portfolio),
    },
  });

  return true;
}
