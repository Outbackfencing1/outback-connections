import Link from "next/link";
import { redirect } from "next/navigation";
import SetNewPasswordForm from "@/components/SetNewPasswordForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Set new password — Outback Connections",
};

export const dynamic = "force-dynamic";

export default async function SetNewPasswordPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    // No active session — they likely landed here without clicking a fresh
    // recovery link. Send them back to the request page.
    redirect("/reset-password?error=expired");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-bold tracking-tight">Set a new password</h1>
      <p className="mt-2 text-sm text-neutral-700">
        Pick a password you&apos;ll remember. At least 8 characters.
      </p>

      <div className="mt-8">
        <SetNewPasswordForm />
      </div>

      <p className="mt-8 text-sm text-neutral-700">
        Changed your mind?{" "}
        <Link href="/dashboard" className="underline">
          Skip and go to dashboard
        </Link>
        .
      </p>
    </div>
  );
}
