"use client";
import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/app/signin/actions";

export default function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await requestPasswordReset({ email: email.trim() });
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.message);
      }
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-900">
        <p className="font-semibold">Check your email.</p>
        <p className="mt-2">
          If <strong>{email}</strong> has an account, we&apos;ve sent a link
          to reset your password. The link is good for the next hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-neutral-800"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !email}
        className="inline-block rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
