import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Dashboard – OutbackConnections" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) {
    redirect("/login?callbackUrl=/dashboard");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-neutral-600">
        Signed in as <span className="font-medium">{session.user?.email}</span>.
      </p>
    </div>
  );
}
