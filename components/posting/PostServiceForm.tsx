"use client";
import { useState, useTransition } from "react";
import BaseFields, { Field } from "./BaseFields";
import type { Category } from "./types";
import type { ActionResult } from "@/lib/posting";

type Props = {
  categories: Category[];
  action: (formData: FormData) => Promise<ActionResult>;
  /**
   * 'offering' = provider listing themselves in directory.
   * 'requesting' = customer asking for a service.
   * Affects copy on rate/travel fields only — server hardcodes direction.
   */
  mode: "offering" | "requesting";
};

export default function PostServiceForm({ categories, action, mode }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
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

      <BaseFields categories={categories} errors={errors} defaults={{}} />

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

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-block rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2 disabled:opacity-60"
        >
          {pending ? "Posting..." : mode === "offering" ? "List my service" : "Post request"}
        </button>
        <p className="mt-2 text-xs text-neutral-600">
          Listings stay up for 30 days, then expire unless you renew.
        </p>
      </div>
    </form>
  );
}
