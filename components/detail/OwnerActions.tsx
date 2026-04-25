"use client";
import Link from "next/link";
import { deleteListing } from "@/app/listings/actions";

type Props = {
  listingId: string;
  listingTitle: string;
};

export default function OwnerActions({ listingId, listingTitle }: Props) {
  function onDelete(e: React.FormEvent<HTMLFormElement>) {
    const ok = confirm(
      `Delete "${listingTitle}"? This can't be undone.`
    );
    if (!ok) e.preventDefault();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={`/dashboard/listings/${listingId}/edit`}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
      >
        Edit
      </Link>
      <form action={deleteListing} onSubmit={onDelete}>
        <input type="hidden" name="id" value={listingId} />
        <button
          type="submit"
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </form>
    </div>
  );
}
