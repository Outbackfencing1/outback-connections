"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { flagListing, type FlagResult } from "@/app/listings/actions";

type Props = {
  listingId: string;
  signedIn: boolean;
  signInRedirect: string;
};

export default function FlagForm({ listingId, signedIn, signInRedirect }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!signedIn) {
    return (
      <p className="text-xs text-neutral-500">
        See something dodgy?{" "}
        <Link
          href={`/signin?next=${encodeURIComponent(signInRedirect)}`}
          className="underline"
        >
          Sign in
        </Link>{" "}
        to flag it.
      </p>
    );
  }

  if (done) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
        Thanks — we&apos;ll review it.
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const result: FlagResult = await flagListing(formData);
      if (result.ok) {
        setDone(true);
        setOpen(false);
      } else {
        setError(result.message);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-neutral-600 underline hover:text-neutral-900"
      >
        Flag this listing
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <input type="hidden" name="listing_id" value={listingId} />

      <p className="text-sm font-semibold text-neutral-900">Flag this listing</p>
      <p className="mt-1 text-xs text-neutral-600">
        Tell us why so we can review it. Anonymous to the poster.
      </p>

      <label className="mt-3 block">
        <span className="block text-xs font-medium text-neutral-700">Reason</span>
        <select
          name="reason"
          required
          defaultValue=""
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Pick one</option>
          <option value="scam">Scam / fraud</option>
          <option value="duplicate">Duplicate listing</option>
          <option value="offensive">Offensive or abusive</option>
          <option value="miscategorised">Wrong category</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className="mt-3 block">
        <span className="block text-xs font-medium text-neutral-700">Note (optional)</span>
        <textarea
          name="note"
          rows={3}
          maxLength={2000}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          placeholder="What's the issue?"
        />
      </label>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send flag"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-700 underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
