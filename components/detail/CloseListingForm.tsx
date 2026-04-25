"use client";
import { useState, useTransition } from "react";
import { closeListing } from "@/app/listings/actions";

type Props = {
  listingId: string;
  listingTitle: string;
};

export default function CloseListingForm({ listingId, listingTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <span className="text-xs text-green-700">Closed — thanks for telling us how it went.</span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100"
      >
        Mark as filled
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const result = await closeListing(formData);
      if (result.ok) {
        setDone(true);
        setOpen(false);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <input type="hidden" name="listing_id" value={listingId} />
      <p className="text-sm font-semibold text-neutral-900">
        How did &ldquo;{listingTitle}&rdquo; go?
      </p>
      <p className="mt-1 text-xs text-neutral-600">
        We use this anonymously to improve the marketplace. No public effect.
      </p>

      <fieldset className="mt-3 space-y-1.5 text-sm">
        <legend className="sr-only">Outcome reason</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="reason" value="matched" required className="mt-1" />
          <span>Matched — someone got back to me through the listing</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="reason" value="no_takers" className="mt-1" />
          <span>No takers — listing didn&apos;t pull any responses</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="reason" value="withdrawn" className="mt-1" />
          <span>Withdrawn — sorted out elsewhere or no longer needed</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="reason" value="other" className="mt-1" />
          <span>Other (note below)</span>
        </label>
      </fieldset>

      <label className="mt-3 block">
        <span className="block text-xs font-medium text-neutral-700">Note (optional)</span>
        <textarea
          name="note"
          rows={2}
          maxLength={2000}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          placeholder="What happened?"
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
          className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
        >
          {pending ? "Closing…" : "Close listing"}
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
