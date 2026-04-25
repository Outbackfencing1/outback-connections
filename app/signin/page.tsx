import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Sign in — Outback Connections",
  description:
    "Sign in to Outback Connections with a magic link or your password.",
};

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  // Already signed in? Send them to the dashboard.
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-neutral-700">
        Magic link or password — your choice.
      </p>

      <div className="mt-8">
        <AuthForm mode="signin" />
      </div>

      <p className="mt-8 text-sm text-neutral-700">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
        .
      </p>
    </div>
  );
}
