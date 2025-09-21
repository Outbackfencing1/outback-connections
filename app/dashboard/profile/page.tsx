import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export const metadata = { title: "Contractor profile – OutbackConnections" };

export default async function ProfilePage() {
  // Require sign-in
  const session = await auth();
  if (!session) redirect("/login?callbackUrl=/dashboard/profile");

  // Optional role guard using the role cookie we set on choose-role
  const role = cookies().get("fc_role")?.value as
    | "customer"
    | "contractor"
    | undefined;

  if (role !== "contractor") {
    // Force the user to pick the contractor role first
    redirect("/choose-role");
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight">Contractor profile</h1>
      <p className="mt-2 text-neutral-600">
        Signed in as{" "}
        <span className="font-medium">{session.user?.email ?? "unknown"}</span>.
      </p>

      <div className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-neutral-700">
          This is a placeholder page. The database is not enabled yet, so we’re
          not loading or saving a profile. When you’re ready to use Prisma, we
          can wire this up to your schema.
        </p>
      </div>
    </div>
  );
}
