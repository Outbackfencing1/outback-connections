// lib/requireRole.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireRole(required: "customer" | "contractor") {
  const session = await import { auth } from "@/lib/auth";
const session = await auth();
;
  if (!session) redirect(`/api/auth/login?callbackUrl=/dashboard`);
  const role = (session.user as any).role ?? null;
  if (!role) redirect("/choose-role");
  if (role !== required) {
    redirect(role === "customer" ? "/dashboard/post-a-job" : "/dashboard/opportunities");
  }
  return session;
}
