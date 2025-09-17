// app/dashboard/layout.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await import { auth } from "@/lib/auth";
const session = await auth();
;
  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/dashboard")}`); // ✅ use /login
  }

  const role = (session.user as any).role ?? null;
  if (!role) redirect("/choose-role");

  return <div className="min-h-screen">{children}</div>;
}
