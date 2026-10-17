"use client";

import { useState } from "react";
import Link from "next/link";
import { submitClaim } from "@/app/listings/actions";

export default function ClaimButton({
  businessId,
  signedIn,
  signInRedirect,
  variant = "inline",
  defaultPhone = null,
  defaultAbn = null,
}: {
  businessId: string;
  signedIn: boolean;
  signInRedirect: string;
  variant?: "inline" | "full";
  defaultPhone?: string | null;
  defaultAbn?: string | null;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [autoApproved, setAutoApproved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showInlineForm, setShowInlineForm] = useState(false);

  const [role, setRole] = useState("Owner / Director");
  const [phone, setPhone] = useState("");
  const [abn, setAbn] = useState(defaultAbn ?? "");
  const [note, setNote] = useState("");

  if (!signedIn) {
    const next = encodeURIComponent(signInRedirect);
    if (variant === "full") {
      return (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={`/signup?next=${next}`}
            className="rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-800"
          >
            Create free owner account to claim →
          </Link>
          <Link
            href={`/signin?next=${next}`}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            Sign in with existing account
          </Link>
        </div>
      );
    }
    return (
      <span>
        <Link href={`/signup?next=${next}`} className="font-medium underline">
          Claim it free
        </Link>{" "}
        (a couple of minutes, or{" "}
        <Link href={`/signin?next=${next}`} className="underline">
          sign in
        </Link>{" "}
        if you have an account)
      </span>
    );
  }

  if (state === "done") {
    if (variant === "full" || showInlineForm) {
      return (
        <div
          className={`mt-4 rounded-xl border p-4 text-sm ${
            autoApproved
              ? "border-green-300 bg-green-50 text-green-950"
              : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
        >
          <p className="font-bold">
            {autoApproved
              ? "✓ Ownership verified — this profile is now yours!"
              : "✓ Claim submitted for verification"}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {msg ||
              (autoApproved
                ? "Your business profile and listings are now linked to your account."
                : "We've received your verification details and will confirm ownership shortly.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Link
              href="/dashboard/settings"
              className="rounded-lg bg-green-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-800"
            >
              Edit profile, details &amp; upload photos →
            </Link>
            <Link
              href={`/profile/${businessId}`}
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              View public profile →
            </Link>
          </div>
        </div>
      );
    }
    return (
      <span className="font-medium text-green-800">
        {autoApproved ? (
          <>
            ✓ Claim verified!{" "}
            <Link href="/dashboard/settings" className="underline">
              Edit profile &amp; add photos →
            </Link>
          </>
        ) : (
          "Claim submitted — we'll review it shortly."
        )}
      </span>
    );
  }

  async function handleClaimSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setState("sending");
    setMsg(null);
    const res = await submitClaim(businessId, {
      role,
      phone,
      abn,
      note,
    });
    if (res.ok) {
      setAutoApproved(Boolean(res.autoApproved));
      setMsg(res.message ?? null);
      setState("done");
    } else {
      setState("error");
      setMsg(res.message);
    }
  }

  if (variant === "inline" && !showInlineForm) {
    return (
      <span>
        <button
          type="button"
          onClick={() => setShowInlineForm(true)}
          className="font-medium underline"
        >
          Claim this business
        </button>{" "}
        or{" "}
        <Link href={`/claim/${businessId}`} className="font-medium underline">
          verify ownership →
        </Link>
      </span>
    );
  }

  return (
    <form
      onSubmit={handleClaimSubmit}
      className="mt-4 space-y-3 rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-sm"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-green-800">
        Owner Verification Details
      </p>
      <p className="text-xs text-neutral-600">
        To protect rural businesses from impersonation, enter your business phone number and/or 11-digit ABN below.{" "}
        <strong>
          If your login email, website domain, or ABN matches our records, your profile unlocks immediately.
        </strong>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-neutral-700">
            Your role at the business
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
          >
            <option value="Owner / Director">Owner / Director</option>
            <option value="Partner / Family Member">Partner / Family Member</option>
            <option value="Operations / Office Manager">Operations / Office Manager</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700">
            Business phone number {defaultPhone ? `(on file: ${defaultPhone})` : ""}
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={defaultPhone || "e.g. 0428 123 456"}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-neutral-700">
            11-Digit ABN (instant verification &amp; badge)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={abn}
            onChange={(e) => setAbn(e.target.value)}
            placeholder="e.g. 51 824 753 556"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700">
            Quick note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="e.g. Owner — mobile above is mine"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
        </div>
      </div>

      {msg && state === "error" && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
          {msg}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-green-800 disabled:opacity-50"
        >
          {state === "sending" ? "Verifying & claiming…" : "✓ Verify & Claim Business Profile"}
        </button>
        {variant === "inline" && (
          <button
            type="button"
            onClick={() => setShowInlineForm(false)}
            className="text-xs font-medium text-neutral-500 underline"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

