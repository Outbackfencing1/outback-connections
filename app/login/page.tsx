import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Login – OutbackConnections",
};

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  async function loginGoogle() {
    "use server";
    await signIn("google");
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-3xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-gray-500">
        Use Google to sign in and access your dashboard.
      </p>

      <form action={loginGoogle} className="mt-8">
        <button
          type="submit"
          className="w-full rounded-xl border px-4 py-3 font-medium shadow-sm transition hover:bg-gray-50"
        >
          Continue with Google
        </button>
      </form>

      <p className="mt-4 text-xs text-gray-500">
        By signing in you agree to our terms and privacy policy.
      </p>
    </main>
  );
}
