"use client";
import { useState, useTransition } from "react";
import BaseFields, { Field } from "./BaseFields";
import type { Category } from "./types";
import type { ActionResult } from "@/lib/posting";
import {
  TRAVEL_RADII,
  TRAVEL_RADIUS_LABELS,
  WORKER_TICKETS,
  WORKER_TICKET_LABELS,
  parseWorkerTickets,
  type JobDirection,
} from "@/lib/work-board";

type Props = {
  categories: Category[];
  action: (formData: FormData) => Promise<ActionResult>;
  /** Edit mode: pass the listing id so the action knows which row to update */
  listingId?: string;
  /** Edit mode or query-param prefill: pre-populate form fields */
  defaults?: Record<string, string>;
  /** Submit-button label override */
  submitLabel?: string;
};

export default function PostJobForm({ categories, action, listingId, defaults, submitLabel }: Props) {
  const v = (k: string) => defaults?.[k] ?? "";
  const initialDirection: JobDirection =
    v("direction") === "available_for_work" ? "available_for_work" : "hiring";
  const [direction, setDirection] = useState<JobDirection>(initialDirection);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const selectedTickets = new Set(parseWorkerTickets(v("tickets")));
  const isWorker = direction === "available_for_work";

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

      {listingId && <input type="hidden" name="listing_id" value={listingId} />}
      <input type="hidden" name="direction" value={direction} />

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
          What are you listing?
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setDirection("hiring")}
            className={`rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition ${
              !isWorker
                ? "border-green-700 bg-green-700 text-white shadow-sm"
                : "border-neutral-300 bg-white text-neutral-800 hover:border-green-700"
            }`}
          >
            <span className="block font-semibold">I&apos;m hiring (Post a job)</span>
            <span className={`block text-xs ${!isWorker ? "text-green-100" : "text-neutral-500"}`}>
              Looking for a driver, operator, fencer or hand
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDirection("available_for_work")}
            className={`rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition ${
              isWorker
                ? "border-green-700 bg-green-700 text-white shadow-sm"
                : "border-neutral-300 bg-white text-neutral-800 hover:border-green-700"
            }`}
          >
            <span className="block font-semibold">I&apos;m available for work (List my skills)</span>
            <span className={`block text-xs ${isWorker ? "text-green-100" : "text-neutral-500"}`}>
              Put your skills, tickets &amp; availability on the board
            </span>
          </button>
        </div>
      </div>

      <BaseFields categories={categories} errors={errors} defaults={defaults ?? {}} />

      <div className="rounded-xl border border-neutral-200 p-4">
        <p className="text-sm font-semibold text-neutral-800">
          {isWorker ? "Skills, tickets & availability" : "Job details"}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            id="work_type"
            label={isWorker ? "Preferred work type (optional)" : "Work type (optional)"}
            error={errors.work_type}
            compact
          >
            <select
              id="work_type"
              name="work_type"
              defaultValue={v("work_type")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              <option value="">Not specified</option>
              <option value="full_time">Full time</option>
              <option value="casual">Casual</option>
              <option value="contract">Contract / ABN</option>
              <option value="seasonal">Seasonal / harvest</option>
              <option value="day_rate">Day rate</option>
            </select>
          </Field>

          <Field
            id="travel_willingness"
            label={isWorker ? "How far will you travel? (optional)" : "Location flexibility (optional)"}
            error={errors.travel_willingness}
            compact
          >
            <select
              id="travel_willingness"
              name="travel_willingness"
              defaultValue={v("travel_willingness")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              <option value="">Not specified</option>
              {TRAVEL_RADII.map((r) => (
                <option key={r} value={r}>
                  {TRAVEL_RADIUS_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            id="pay_type"
            label={isWorker ? "Rate type (optional)" : "Pay type (optional)"}
            error={errors.pay_type}
            compact
          >
            <select
              id="pay_type"
              name="pay_type"
              defaultValue={v("pay_type")}
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

          <Field
            id="pay_amount"
            label={isWorker ? "Rate amount AUD (optional)" : "Pay amount AUD (optional)"}
            error={errors.pay_amount}
            compact
          >
            <input
              id="pay_amount"
              name="pay_amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="99999"
              placeholder={isWorker ? "45.00" : "35.00"}
              defaultValue={v("pay_amount")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field
            id="start_date"
            label={isWorker ? "Available from (optional)" : "Start date (optional)"}
            error={errors.start_date}
            compact
          >
            <input
              id="start_date"
              name="start_date"
              type="date"
              defaultValue={v("start_date")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>

          <Field
            id="duration_text"
            label={isWorker ? "Availability window (optional)" : "How long? (optional)"}
            error={errors.duration_text}
            compact
            hint={isWorker ? "e.g. 'Nov–Jan harvest', 'ongoing'" : "e.g. 'ongoing', 'through harvest'"}
          >
            <input
              id="duration_text"
              name="duration_text"
              type="text"
              maxLength={200}
              defaultValue={v("duration_text")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>

          <Field
            id="experience_years"
            label={isWorker ? "Years experience (optional)" : "Min. years experience (optional)"}
            error={errors.experience_years}
            compact
          >
            <input
              id="experience_years"
              name="experience_years"
              type="number"
              inputMode="numeric"
              min="0"
              max="80"
              placeholder="5"
              defaultValue={v("experience_years")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
            {isWorker
              ? "Tickets, licences & machinery skills (tick all you have)"
              : "Tickets, licences or skills wanted (optional)"}
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {WORKER_TICKETS.map((ticket) => (
              <label
                key={ticket}
                className="flex items-start gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50/70 px-3 py-2 text-xs text-neutral-800 hover:border-green-600"
              >
                <input
                  type="checkbox"
                  name="tickets"
                  value={ticket}
                  defaultChecked={selectedTickets.has(ticket)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>{WORKER_TICKET_LABELS[ticket]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="accommodation_provided"
              defaultChecked={v("accommodation_provided") === "true"}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-neutral-800">
              {isWorker
                ? "On-farm accommodation needed (or tick 'Self-Contained' above if you bring your own camp/van)"
                : "Accommodation provided on-farm"}
            </span>
          </label>
        </div>
      </div>

      <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
        <strong>Tip:</strong>{" "}
        {isWorker
          ? "Include the machines/trucks you've operated (e.g. Case/John Deere header, Kenworth road train, Cat D6), your base town, and when you're free."
          : "Specific listings get more responses. Mention postcode, machinery/stock type, rate range, and best contact times."}
      </p>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-block rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2 disabled:opacity-60"
        >
          {pending
            ? "Saving..."
            : submitLabel ?? (isWorker ? "Post my skills & availability" : "Post job")}
        </button>
        <p className="mt-2 text-xs text-neutral-600">
          Listings stay up for 30 days, then expire unless you renew.
        </p>
      </div>
    </form>
  );
}
