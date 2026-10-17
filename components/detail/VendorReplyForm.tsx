"use client";

import { useActionState, useState } from "react";
import { replyToVendorReview, type ReviewActionState } from "@/app/reviews/actions";

type Props = {
  reviewId: string;
  returnPath: string;
  existingReply?: string | null;
};

const initial: ReviewActionState = {};

export default function VendorReplyForm({
  reviewId,
  returnPath,
  existingReply,
}: Props) {
  const [state, formAction, pending] = useActionState(replyToVendorReview, initial);
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <p className="mt-2 text-xs font-medium text-green-800">
        Reply saved.
      </p>
    );
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-green-800 underline hover:text-green-950"
        >
          {existingReply ? "Edit your reply" : "Reply to this review"}
        </button>
      ) : (
        <form action={formAction} className="mt-2 space-y-2 rounded-lg bg-neutral-50 p-3">
          <input type="hidden" name="review_id" value={reviewId} />
          <input type="hidden" name="return_path" value={returnPath} />
          {state.error && (
            <p className="text-xs font-medium text-red-700">{state.error}</p>
          )}
          <textarea
            name="vendor_reply"
            rows={2}
            maxLength={600}
            defaultValue={existingReply ?? ""}
            placeholder="Write a public reply (max 600 chars)..."
            className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-green-700 px-3 py-1 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {pending ? "Saving..." : "Post reply"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
