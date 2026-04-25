import Link from "next/link";
import { redirect } from "next/navigation";
import ResetPasswordForm from "@/components/ResetPasswordForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Reset password — Outback Connections",
  description: "Reset your Outback Connections password.",
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-bold tracking-tight">Reset password</h1>
      <p className="mt-2 text-sm text-neutral-700">
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>

      <div className="mt-8">
        <ResetPasswordForm />
      </div>

      <p className="mt-8 text-sm text-neutral-700">
        Remembered it?{" "}
        <Link href="/signin" className="underline">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
