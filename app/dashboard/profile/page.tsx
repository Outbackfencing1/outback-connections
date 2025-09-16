import { requireRole } from "@/lib/requireRole";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "./profile-form";

export default async function ContractorProfilePage() {
  const session = await requireRole("contractor");

  const profile = await prisma.contractorProfile.findUnique({
    where: { userId: (session.user as any).id },
  });

  // ensure a record exists
  const data = profile ?? (await prisma.contractorProfile.create({
    data: {
      userId: (session.user as any).id,
      company: (session.user?.name as string) || "My Fencing Business",
      serviceAreas: [],
      skills: [],
      portfolio: [],
    },
  }));

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Contractor Profile</h1>
      <ProfileForm initial={data} />
    </main>
  );
}