// app/choose-role/setRoleAction.ts
"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function setRole(role: "customer" | "contractor") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/choose-role")}`); // ✅ use /login
  }

  await prisma.user.update({
    where: { id: (session.user as any).id },
    data: { role },
  });
  return true;
}
