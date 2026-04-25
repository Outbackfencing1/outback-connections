"use client";
import { hideListing, clearFlags } from "./actions";

type Props = {
  listingId: string;
  status: string;
  listingTitle: string;
};

export default function FlagRowActions({ listingId, status, listingTitle }: Props) {
  function confirmHide(e: React.FormEvent<HTMLFormElement>) {
    if (!confirm(`Hide "${listingTitle}"? It won't appear in browse pages anymore.`)) {
      e.preventDefault();
    }
  }
  function confirmClear(e: React.FormEvent<HTMLFormElement>) {
    if (!confirm(`Clear all flags on "${listingTitle}"? Use when the flags were unfounded.`)) {
      e.preventDefault();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "active" && (
        <form action={hideListing} onSubmit={confirmHide}>
          <input type="hidden" name="listing_id" value={listingId} />
          <button
            type="submit"
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            Hide listing
          </button>
        </form>
      )}
      <form action={clearFlags} onSubmit={confirmClear}>
        <input type="hidden" name="listing_id" value={listingId} />
        <button
          type="submit"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-neutral-50"
        >
          Clear flags
        </button>
      </form>
    </div>
  );
}
