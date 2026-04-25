"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
} from "@/app/signin/actions";

type Props = {
  /** "sign in" or "sign up" — copy + which extra fields render */
  mode: "signin" | "signup";
};

type Method = "magic" | "password";

export default function AuthForm({ mode }: Props) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [method, setMethod] = useState<Method>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [confirmAge, setConfirmAge] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [sent, setSent] = useState<null | "magic" | "confirm">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function validateConsent(): string | null {
    if (!isSignup) return null;
    if (!agreeTerms) return "Please tick the box agreeing to the terms and privacy notice.";
    if (!confirmAge) return "You need to confirm you're 18 or over.";
    return null;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const consentError = validateConsent();
    if (consentError) {
      setError(consentError);
      return;
    }
    const trimmedEmail = email.trim();

    start(async () => {
      if (method === "magic") {
        const result = await sendMagicLink({
          email: trimmedEmail,
          mode,
          agreeTerms,
          confirmAge,
          marketing,
        });
        if (result.ok) {
          setSent("magic");
        } else {
          setError(result.message);
        }
        return;
      }

      // Password method
      if (isSignup) {
        const result = await signUpWithPassword({
          email: trimmedEmail,
          password,
          agreeTerms,
          confirmAge,
          marketing,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (result.redirect) {
          router.push(result.redirect);
          router.refresh();
        } else {
          setSent("confirm");
        }
      } else {
        const result = await signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (result.redirect) {
          router.push(result.redirect);
          router.refresh();
        }
      }
    });
  }

  if (sent === "magic") {
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
              setSent(null);
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

  if (sent === "confirm") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-900">
        <p className="font-semibold">Confirm your email.</p>
        <p className="mt-2">
          Account created. We sent a confirmation link to{" "}
          <strong>{email}</strong>. Click it to activate the account, then come
          back and sign in with your password.
        </p>
      </div>
    );
  }

  const passwordHelp = isSignup
    ? "At least 8 characters."
    : "Forgot it? Use the reset link below.";

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div role="tablist" aria-label="Sign-in method" className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={method === "magic"}
          onClick={() => {
            setMethod("magic");
            setError(null);
          }}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
            method === "magic"
              ? "border-green-700 bg-green-50 text-green-900"
              : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          Magic link
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === "password"}
          onClick={() => {
            setMethod("password");
            setError(null);
          }}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
            method === "password"
              ? "border-green-700 bg-green-50 text-green-900"
              : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          Password
        </button>
      </div>

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
        {method === "magic" && (
          <p className="mt-1 text-xs text-neutral-600">
            We&apos;ll send you a one-time link. No password needed.
          </p>
        )}
      </div>

      {method === "password" && (
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-neutral-800"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          />
          <p className="mt-1 text-xs text-neutral-600">{passwordHelp}</p>
          {!isSignup && (
            <p className="mt-2 text-xs">
              <Link href="/reset-password" className="underline text-neutral-700">
                Forgot password?
              </Link>
            </p>
          )}
        </div>
      )}

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
        disabled={pending || !email || (method === "password" && !password)}
        className="inline-block rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2 disabled:opacity-60"
      >
        {pending
          ? method === "magic"
            ? "Sending…"
            : isSignup
              ? "Creating account…"
              : "Signing in…"
          : method === "magic"
            ? isSignup
              ? "Send sign-up link"
              : "Send sign-in link"
            : isSignup
              ? "Create account"
              : "Sign in"}
      </button>
    </form>
  );
}
