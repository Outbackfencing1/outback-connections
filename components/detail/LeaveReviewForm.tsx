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
const COMPLETED_DEAL_TYPES = DEAL_TYPES.filter((d) => d.slug !== "general");

export default function LeaveReviewForm({
  signedIn,
  signInRedirect,
  listingId,
  targetUserId,
  targetBusinessId,
  vendorLabel,
  defaultDealType = "fencing_service",
  defaultReviewerName,
  defaultReviewerPostcode,
}: Props) {
  const [state, formAction, pending] = useActionState(submitVendorReview, initial);
  const [rating, setRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const initialDealType =
    defaultDealType && defaultDealType !== "general"
      ? defaultDealType
      : "fencing_service";

  if (state.ok) {
    return (
      <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-950">
        <p className="font-semibold">
          Thanks — your completed-work review has been published.
        </p>
        <p className="mt-1 text-xs text-green-900">
          Specific feedback from real dealings helps farmers, contractors, and workers across the bush know who turns up and does the job properly.
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
              Had work completed or dealt with {vendorLabel}? Write a review
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              Sign in so every review comes from a traceable account after a real dealing.
            </p>
          </div>
          <Link
            href={`/signin?next=${encodeURIComponent(signInRedirect)}`}
            className="rounded-lg bg-green-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-800"
          >
            Sign in to write a review
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
            Write a completed-work review for {vendorLabel}
          </h3>
          <p className="text-xs text-neutral-600">
            For real dealings where fencing, contracting, farm work, freight, or stock/hay sales were completed. (For a neighbour recommendation without a full review, use the quick vouch buttons above.)
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-green-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-800"
          >
            + Write completed-work review
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
                Overall rating (completed work)
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
                Would you hire / deal with them again?
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
              What work or dealing was completed?
            </label>
            <select
              id="deal_type"
              name="deal_type"
              defaultValue={initialDealType}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            >
              {COMPLETED_DEAL_TYPES.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.label}
                </option>
              ))}
            </select>
            {state.fieldErrors?.deal_type && (
              <p className="mt-1 text-xs text-red-700">{state.fieldErrors.deal_type}</p>
            )}
          </div>

          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-700">
              Specific qualities observed (optional tags)
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
              What work was done &amp; how did it go? (Required, 15–800 chars)
            </label>
            <textarea
              id="review-comment"
              name="comment"
              rows={3}
              required
              minLength={15}
              maxLength={800}
              placeholder="e.g. Put up 2.4km of 8/90/30 hinge joint and strainer assemblies near Molong. Turned up when he said he would and left gates swinging properly."
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

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700 space-y-2">
            <label className="flex items-start gap-2 font-medium text-neutral-900 cursor-pointer">
              <input
                type="checkbox"
                name="confirmed_genuine_dealing"
                value="yes"
                required
                className="mt-0.5 rounded border-neutral-300 text-green-700 focus:ring-green-600"
              />
              <span>
                I confirm this review is based on a genuine dealing with {vendorLabel} and I have no undisclosed commercial or family conflict.
              </span>
            </label>
            {state.fieldErrors?.confirmed_genuine_dealing && (
              <p className="text-xs text-red-700">
                {state.fieldErrors.confirmed_genuine_dealing}
              </p>
            )}
            <p className="text-[11px] text-neutral-600">
              <strong>Review &amp; reply policy:</strong> We publish both positive and critical reviews from real dealings in line with{" "}
              <a
                href="https://www.accc.gov.au/consumers/advertising-and-promotions/online-reviews-for-product-and-services"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-green-800"
              >
                ACCC online review guidance
              </a>
              . The business owner can post a public reply. Fake, incentivised, or defamatory reviews are removed.
            </p>
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
              {pending ? "Publishing..." : "Publish completed-work review"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

