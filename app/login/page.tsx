import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AuthButtons from "@/components/AuthButtons";

export const metadata = { title: "Sign in – OutbackConnections" };

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="text-neutral-600 text-sm">
        Continue with Google to access your dashboard.
      </p>
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <AuthButtons isAuthed={false} />
      </div>
    </div>
  );
}
