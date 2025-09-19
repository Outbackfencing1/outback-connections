"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dashboard";

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Use your Google account to continue.
          </p>
        </div>

        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="w-full rounded-xl border px-4 py-3 text-sm font-medium shadow-sm hover:bg-neutral-50 active:scale-[0.99] transition"
          aria-label="Sign in with Google"
        >
          Continue with Google
        </button>

        <p className="mt-4 text-xs leading-5 text-neutral-500">
          By signing in, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
