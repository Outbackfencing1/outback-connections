import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Gate a page by role.
 * Call at the top of a server component / action.
 */
export async function requireRole(required: "customer" | "contractor") {
  const session = await auth();
  if (!session) {
    redirect(`/login?callbackUrl=/dashboard`);
  }

  const role = (session.user as any)?.role as
    | "customer"
    | "contractor"
    | undefined;

  if (!role || role !== required) {
    redirect("/choose-role");
  }
}
