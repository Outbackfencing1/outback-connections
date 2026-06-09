import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Sign up — Outback Connections",
  description:
    "Create a free Outback Connections account with a password, or a one-time email link.",
};

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-bold tracking-tight">Sign up</h1>
      <p className="mt-2 text-sm text-neutral-700">
        Free account. Sign up with a password — or use a one-time email link.
      </p>

      <div className="mt-8">
        <AuthForm mode="signup" />
      </div>

      <p className="mt-8 text-sm text-neutral-700">
        Already have an account?{" "}
        <Link href="/signin" className="underline">
          Sign in
        </Link>
        .
      </p>

      <p className="mt-4 text-xs text-neutral-500">
        By creating an account you agree to our terms and privacy notice. Both
        are plain English and short.
      </p>
    </div>
  );
}
