// app/choose-role/setRoleAction.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function setRole(role: "customer" | "contractor") {
  const session = await auth();

  const email = session?.user?.email;
  if (!email) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/choose-role")}`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/choose-role")}`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role },
  });

  redirect("/");
}
