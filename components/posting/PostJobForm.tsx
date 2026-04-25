"use client";
import { useState, useTransition } from "react";
import BaseFields, { Field } from "./BaseFields";
import type { Category } from "./types";
import type { ActionResult } from "@/lib/posting";

type Props = {
  categories: Category[];
  action: (formData: FormData) => Promise<ActionResult>;
};

export default function PostJobForm({ categories, action }: Props) {
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
        <p className="text-sm font-semibold text-neutral-800">Job details</p>

        <Field id="work_type" label="Work type (optional)" error={errors.work_type} compact>
          <select
            id="work_type"
            name="work_type"
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          >
            <option value="">Not specified</option>
            <option value="full_time">Full time</option>
            <option value="casual">Casual</option>
            <option value="contract">Contract</option>
            <option value="seasonal">Seasonal</option>
            <option value="day_rate">Day rate</option>
          </select>
        </Field>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="pay_type" label="Pay type (optional)" error={errors.pay_type} compact>
            <select
              id="pay_type"
              name="pay_type"
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              <option value="">Not specified</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="negotiable">Negotiable</option>
              <option value="not_specified">Don&apos;t want to say</option>
            </select>
          </Field>

          <Field id="pay_amount" label="Pay amount (optional)" error={errors.pay_amount} compact>
            <input
              id="pay_amount"
              name="pay_amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="99999"
              placeholder="35.00"
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="start_date" label="Start date (optional)" error={errors.start_date} compact>
            <input
              id="start_date"
              name="start_date"
              type="date"
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>

          <Field id="duration_text" label="How long? (optional)" error={errors.duration_text} compact hint="e.g. 'ongoing', 'through harvest', '3 months'">
            <input
              id="duration_text"
              name="duration_text"
              type="text"
              maxLength={200}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>

        <div className="mt-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="accommodation_provided"
              defaultChecked={false}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-neutral-800">
              Accommodation provided
            </span>
          </label>
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-block rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2 disabled:opacity-60"
        >
          {pending ? "Posting..." : "Post job"}
        </button>
        <p className="mt-2 text-xs text-neutral-600">
          Listings stay up for 30 days, then expire unless you renew.
        </p>
      </div>
    </form>
  );
}
