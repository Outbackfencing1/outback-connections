"use client";
import { useState, useTransition } from "react";
import { sendMagicLink } from "@/app/signin/actions";

type Props = {
  /** "sign in" or "sign up" — copy only; flow is identical */
  mode: "signin" | "signup";
};

export default function AuthForm({ mode }: Props) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await sendMagicLink(email.trim());
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
          We sent a link to <strong>{email}</strong>. Open it on this device
          and you&apos;ll be signed in. The link is good for the next hour.
        </p>
        <p className="mt-3 text-xs">
          Can&apos;t find it? Check spam, or{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
          >
            try again with a different email
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
        <p className="mt-1 text-xs text-neutral-600">
          We&apos;ll send you a one-time link. No passwords to remember.
        </p>
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
        {pending
          ? "Sending…"
          : mode === "signup"
            ? "Send sign-up link"
            : "Send sign-in link"}
      </button>
    </form>
  );
}
