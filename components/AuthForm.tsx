"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { sendMagicLink } from "@/app/signin/actions";

type Props = {
  /** "sign in" or "sign up" — copy + which extra fields render */
  mode: "signin" | "signup";
};

export default function AuthForm({ mode }: Props) {
  const [email, setEmail] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [confirmAge, setConfirmAge] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const isSignup = mode === "signup";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (isSignup) {
      if (!agreeTerms) {
        setError("Please tick the box agreeing to the terms and privacy notice.");
        return;
      }
      if (!confirmAge) {
        setError("You need to confirm you're 18 or over.");
        return;
      }
    }
    start(async () => {
      const result = await sendMagicLink({
        email: email.trim(),
        mode,
        agreeTerms,
        confirmAge,
        marketing,
      });
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
        <p className="mt-1 text-xs text-neutral-600">
          We&apos;ll send you a one-time link. No passwords to remember.
        </p>
      </div>

      {isSignup && (
        <>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                required
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm text-neutral-800">
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="underline">
                  Terms of service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="underline">
                  Privacy notice
                </Link>
                . I understand Outback Connections is a platform — listings
                come from other users, not from us, and I&apos;m responsible
                for verifying anyone I contact.{" "}
                <span className="text-red-600">*</span>
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={confirmAge}
                onChange={(e) => setConfirmAge(e.target.checked)}
                required
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm text-neutral-800">
                I confirm I&apos;m 18 or over.{" "}
                <span className="text-red-600">*</span>
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-neutral-200 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm text-neutral-800">
                Send me occasional updates about the platform (no more than
                monthly, easy unsubscribe).
              </span>
            </label>
          </div>
        </>
      )}

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
