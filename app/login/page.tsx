"use client";

import { useState, useTransition, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") || "/";

  useEffect(() => {
    if (status === "authenticated") {
      window.location.href = callbackUrl;
    }
  }, [status, callbackUrl]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    alert(`Mock login for ${email}. Replace with real auth later.`);
  }

  const onGoogle = () => {
    setErr(null);
    startTransition(async () => {
      try {
        await signIn("google", { callbackUrl });
      } catch (e: any) {
        setErr(e?.message || "Could not start Google sign-in.");
      }
    });
  };

  return (
    <main className="min-h-dvh bg-neutral-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mx-auto rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-extrabold text-green-800">Login</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Continue with Google or use the mock form below.
          </p>

          {err ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          <button
            onClick={onGoogle}
            disabled={isPending}
            className="mt-5 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-neutral-300 focus:outline-none focus:ring-4 focus:ring-green-200 disabled:opacity-60"
          >
            {isPending ? "Connecting to Google…" : "Continue with Google"}
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px w-full bg-neutral-200" />
            <span className="text-xs text-neutral-500">or</span>
            <div className="h-px w-full bg-neutral-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-green-600"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-green-600"
            />
            <button className="w-full rounded-xl bg-green-700 px-4 py-3 font-semibold text-white hover:bg-green-800">
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-neutral-600">
          <a href="/" className="hover:underline">← Back to home</a>
        </p>
      </div>
    </main>
  );
}
