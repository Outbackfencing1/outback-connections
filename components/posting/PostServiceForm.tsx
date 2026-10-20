"use client";
import { useState, useTransition } from "react";
import BaseFields, { Field } from "./BaseFields";
import type { Category } from "./types";
import type { ActionResult } from "@/lib/posting";
import {
  FENCE_LENGTH_OPTIONS,
  FENCE_MATERIALS_OPTIONS,
  FENCE_TIMING_OPTIONS,
  FENCE_TYPE_OPTIONS,
  formatFencingJobSpecSummary,
  redactStreetAddressForPublicDisplay,
} from "@/lib/fencing-job";

type Props = {
  categories: Category[];
  action: (formData: FormData) => Promise<ActionResult>;
  mode: "offering" | "requesting";
  listingId?: string;
  defaults?: Record<string, string>;
  submitLabel?: string;
};

export default function PostServiceForm({
  categories,
  action,
  mode,
  listingId,
  defaults,
  submitLabel,
}: Props) {
  const v = (k: string) => defaults?.[k] ?? "";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (mode === "requesting") {
      const brief = formatFencingJobSpecSummary({
        fenceType: String(formData.get("fence_type") ?? "") || null,
        approxLength: String(formData.get("approx_length") ?? "") || null,
        timing: String(formData.get("timing") ?? "") || null,
        materialsStatus: String(formData.get("materials_status") ?? "") || null,
        photoUrls: formData.get("photo_url")
          ? [String(formData.get("photo_url")).trim()]
          : [],
      });
      const rawDesc = String(formData.get("description") ?? "").trim();
      const safeDesc = redactStreetAddressForPublicDisplay(rawDesc);
      const combined = brief ? `${brief}\n\n${safeDesc}` : safeDesc;
      formData.set("description", combined.slice(0, 2000));
    }

    setErrors({});
    start(async () => {
      const result = await action(formData);
      if (result && !result.ok) {
        setErrors(result.errors);
        const firstKey = Object.keys(result.errors).find((k) => k !== "_");
        if (firstKey) {
          document.getElementById(firstKey)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-5">
      {errors._ && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {errors._}
        </div>
      )}

      {listingId && <input type="hidden" name="listing_id" value={listingId} />}

      {mode === "requesting" && (
        <div className="rounded-xl border border-green-300 bg-green-50/70 p-4 text-xs text-green-950">
          <p className="font-bold">
            🔒 Exact farm addresses are kept private
          </p>
          <p className="mt-1 text-green-900">
            Only your nearest town/postcode and job details appear publicly. Do not put your property road number or gate code in the public description — share exact directions privately once a contractor replies.
          </p>
        </div>
      )}

      <BaseFields categories={categories} errors={errors} defaults={defaults ?? {}} />

      {mode === "requesting" && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Fencing &amp; Contracting Job Brief (Optional — helps contractors quote accurately)
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              If you&apos;re posting a fencing, yard, or rural contracting job, select the approximate length, fence type, timing, and materials status below.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="fence_type" label="Fence / work type" compact>
              <select
                id="fence_type"
                name="fence_type"
                defaultValue={v("fence_type")}
                className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select type (optional)</option>
                {FENCE_TYPE_OPTIONS.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="approx_length" label="Approximate length" compact>
              <select
                id="approx_length"
                name="approx_length"
                defaultValue={v("approx_length")}
                className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select length (optional)</option>
                {FENCE_LENGTH_OPTIONS.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="timing" label="Preferred timing" compact>
              <select
                id="timing"
                name="timing"
                defaultValue={v("timing")}
                className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select timing (optional)</option>
                {FENCE_TIMING_OPTIONS.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="materials_status" label="Materials status" compact>
              <select
                id="materials_status"
                name="materials_status"
                defaultValue={v("materials_status")}
                className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select materials status (optional)</option>
                {FENCE_MATERIALS_OPTIONS.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field id="photo_url" label="Link to a photo of the fence line, country or gateway (optional)" compact>
            <input
              id="photo_url"
              name="photo_url"
              type="url"
              maxLength={300}
              defaultValue={v("photo_url")}
              placeholder="https://... (optional photo link)"
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 p-4">
        <p className="text-sm font-semibold text-neutral-800">
          {mode === "offering" ? "Your rate" : "Budget / rate (optional)"}
        </p>
        <p className="mt-1 text-xs text-neutral-600">
          {mode === "offering"
            ? "Optional — gives people a sense of pricing before they call."
            : "Optional — what you expect to pay, or leave blank for quotes."}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="rate_type" label="Rate type" error={errors.rate_type} compact>
            <select
              id="rate_type"
              name="rate_type"
              defaultValue={v("rate_type")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              <option value="">Not specified</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="fixed">Fixed price</option>
              <option value="per_km">Per km</option>
              <option value="quote">By quote</option>
              <option value="negotiable">Negotiable</option>
            </select>
          </Field>

          <Field id="rate_amount" label="Amount" error={errors.rate_amount} compact>
            <input
              id="rate_amount"
              name="rate_amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="99999"
              placeholder="120.00"
              defaultValue={v("rate_amount")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>
      </div>

      {mode === "offering" && (
        <Field id="travel_willingness" label="How far will you travel?" error={errors.travel_willingness}>
          <select
            id="travel_willingness"
            name="travel_willingness"
            defaultValue={v("travel_willingness")}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          >
            <option value="">Not specified</option>
            <option value="postcode_only">Same postcode only</option>
            <option value="within_50km">Within 50km</option>
            <option value="within_200km">Within 200km</option>
            <option value="state_wide">State-wide</option>
            <option value="national">National</option>
          </select>
        </Field>
      )}

      <p className="rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-xs text-neutral-700">
        <strong>Tip:</strong> Specific listings get more responses.
        Mention postcode, price range, and best contact times if you can.
      </p>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-block rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2 disabled:opacity-60"
        >
          {pending ? "Saving..." : submitLabel ?? (mode === "offering" ? "List my service" : "Post request")}
        </button>
        <p className="mt-2 text-xs text-neutral-600">
          Listings stay up for 30 days, then expire unless you renew.
        </p>
      </div>
    </form>
  );
}

