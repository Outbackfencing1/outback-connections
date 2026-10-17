"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { submitVendorReview, type ReviewActionState } from "@/app/reviews/actions";
import { DEAL_TYPES, TRUST_TAGS } from "@/lib/trust";

type Props = {
  signedIn: boolean;
  signInRedirect: string;
  listingId?: string | null;
  targetUserId?: string | null;
  targetBusinessId?: string | null;
  vendorLabel: string;
  defaultDealType?: string;
  defaultReviewerName?: string | null;
  defaultReviewerPostcode?: string | null;
};

const initial: ReviewActionState = {};

export default function LeaveReviewForm({
  signedIn,
  signInRedirect,
  listingId,
  targetUserId,
  targetBusinessId,
  vendorLabel,
  defaultDealType = "general",
  defaultReviewerName,
  defaultReviewerPostcode,
}: Props) {
  const [state, formAction, pending] = useActionState(submitVendorReview, initial);
  const [rating, setRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-950">
        <p className="font-semibold">Thanks — your feedback &amp; vouch has been published.</p>
        <p className="mt-1 text-xs text-green-900">
          Real feedback from farmers, contractors, and operators helps the whole rural community know who turns up and does the right thing.
        </p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-neutral-900">
              Dealt with {vendorLabel}? Leave feedback or vouch for them
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              Sign in so every review comes from a verified account.
            </p>
          </div>
          <Link
            href={`/signin?next=${encodeURIComponent(signInRedirect)}`}
            className="rounded-lg bg-green-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-800"
          >
            Sign in to leave a review
          </Link>
        </div>
      </div>
    );
  }

  function toggleTag(slug: string) {
    setSelectedTags((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug]
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">
            Leave feedback or vouch for {vendorLabel}
          </h3>
          <p className="text-xs text-neutral-600">
            Bought stock/hay, hired them, worked for them, or used their gear? Share how it went.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-green-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-800"
          >
            + Write a review / vouch
          </button>
        )}
      </div>

      {open && (
        <form action={formAction} className="mt-4 space-y-4 border-t border-neutral-100 pt-4">
          <input type="hidden" name="listing_id" value={listingId ?? ""} />
          <input type="hidden" name="target_user_id" value={targetUserId ?? ""} />
          <input type="hidden" name="target_business_id" value={targetBusinessId ?? ""} />
          <input type="hidden" name="return_path" value={signInRedirect} />
          <input type="hidden" name="rating" value={rating} />

          {state.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-900">
              {state.error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-700">
                Overall rating
              </label>
              <div className="mt-1.5 flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition ${
                      star <= rating
                        ? "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300"
                    }`}
                    aria-label={`${star} star${star === 1 ? "" : "s"}`}
                  >
                    ★ {star}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="would_recommend"
                className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
              >
                Would you deal with them again?
              </label>
              <select
                id="would_recommend"
                name="would_recommend"
                defaultValue="yes"
                className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
              >
                <option value="yes">Yes — would recommend / deal with again</option>
                <option value="no">No — had issues</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="deal_type"
              className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
            >
              How did you deal with them?
            </label>
            <select
              id="deal_type"
              name="deal_type"
              defaultValue={defaultDealType}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            >
              {DEAL_TYPES.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-700">
              Quick trust tags (click any that apply)
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TRUST_TAGS.map((t) => {
                const active = selectedTags.includes(t.slug);
                return (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => toggleTag(t.slug)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? "border-green-700 bg-green-700 text-white"
                        : "border-neutral-300 bg-neutral-50 text-neutral-800 hover:border-green-700"
                    }`}
                  >
                    {active ? "✓ " : "+ "}
                    {t.label}
                  </button>
                );
              })}
            </div>
            {selectedTags.map((slug) => (
              <input key={slug} type="hidden" name="tags" value={slug} />
            ))}
          </div>

          <div>
            <label
              htmlFor="review-comment"
              className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
            >
              Written feedback (optional if tags selected, max 800 chars)
            </label>
            <textarea
              id="review-comment"
              name="comment"
              rows={3}
              maxLength={800}
              placeholder="e.g. Bought 2 decks of lucerne hay off Dave — accurate weights, dry shedded bales, helped load the B-double on time."
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            />
            {state.fieldErrors?.comment && (
              <p className="mt-1 text-xs text-red-700">{state.fieldErrors.comment}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="reviewer_display_name"
                className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
              >
                Your name or property name (shown publicly)
              </label>
              <input
                id="reviewer_display_name"
                name="reviewer_display_name"
                type="text"
                required
                maxLength={60}
                defaultValue={defaultReviewerName ?? ""}
                placeholder="e.g. Tom S. or Brindabella Pastoral"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
              {state.fieldErrors?.reviewer_display_name && (
                <p className="mt-1 text-xs text-red-700">
                  {state.fieldErrors.reviewer_display_name}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="reviewer_postcode"
                className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
              >
                Your postcode (optional)
              </label>
              <input
                id="reviewer_postcode"
                name="reviewer_postcode"
                type="text"
                inputMode="numeric"
                maxLength={4}
                defaultValue={defaultReviewerPostcode ?? ""}
                placeholder="e.g. 2800"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
              {state.fieldErrors?.reviewer_postcode && (
                <p className="mt-1 text-xs text-red-700">
                  {state.fieldErrors.reviewer_postcode}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-green-700 px-4 py-2 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {pending ? "Publishing..." : "Publish review"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
