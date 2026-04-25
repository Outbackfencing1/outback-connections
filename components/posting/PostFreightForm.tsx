"use client";
import { useState, useTransition } from "react";
import BaseFields, { Field } from "./BaseFields";
import type { Category } from "./types";
import type { ActionResult } from "@/lib/posting";

type Props = {
  categories: Category[];
  action: (formData: FormData) => Promise<ActionResult>;
  listingId?: string;
  defaults?: Record<string, string>;
  submitLabel?: string;
};

export default function PostFreightForm({ categories, action, listingId, defaults, submitLabel }: Props) {
  const v = (k: string) => defaults?.[k] ?? "";
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

      {listingId && <input type="hidden" name="listing_id" value={listingId} />}

      <Field id="direction" label="What kind of freight post is this?" error={errors.direction} required>
        <select
          id="direction"
          name="direction"
          required
          defaultValue={v("direction")}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        >
          <option value="">Pick one</option>
          <option value="need_freight">I need freight moved</option>
          <option value="offering_truck">I&apos;ve got a truck with space</option>
        </select>
      </Field>

      <BaseFields categories={categories} errors={errors} defaults={defaults ?? {}} />

      <div className="rounded-xl border border-neutral-200 p-4">
        <p className="text-sm font-semibold text-neutral-800">Freight details</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="origin_postcode" label="Origin postcode (optional)" error={errors.origin_postcode} compact>
            <input
              id="origin_postcode"
              name="origin_postcode"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              defaultValue={v("origin_postcode")}
              className="mt-1 block w-32 rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>

          <Field id="destination_postcode" label="Destination postcode (optional)" error={errors.destination_postcode} compact>
            <input
              id="destination_postcode"
              name="destination_postcode"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              defaultValue={v("destination_postcode")}
              className="mt-1 block w-32 rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="vehicle_type" label="Vehicle type (optional)" error={errors.vehicle_type} compact>
            <select
              id="vehicle_type"
              name="vehicle_type"
              defaultValue={v("vehicle_type")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              <option value="">Not specified</option>
              <option value="tipper">Tipper</option>
              <option value="livestock">Livestock crate</option>
              <option value="flatbed">Flatbed</option>
              <option value="b_double">B-double</option>
              <option value="refrigerated">Refrigerated</option>
              <option value="tray">Tray</option>
              <option value="other">Other</option>
            </select>
          </Field>

          <Field id="cargo_type" label="Cargo type (optional)" error={errors.cargo_type} compact>
            <select
              id="cargo_type"
              name="cargo_type"
              defaultValue={v("cargo_type")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              <option value="">Not specified</option>
              <option value="livestock">Livestock</option>
              <option value="grain">Grain / crop</option>
              <option value="hay_fodder">Hay / fodder</option>
              <option value="machinery">Machinery / oversize</option>
              <option value="fuel_water">Fuel / water</option>
              <option value="refrigerated">Refrigerated</option>
              <option value="general">General</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="weight_kg" label="Weight (kg, optional)" error={errors.weight_kg} compact>
            <input
              id="weight_kg"
              name="weight_kg"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              max="1000000"
              defaultValue={v("weight_kg")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>

          <Field id="budget_bracket" label="Budget (optional)" error={errors.budget_bracket} compact>
            <select
              id="budget_bracket"
              name="budget_bracket"
              defaultValue={v("budget_bracket")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              <option value="">Not specified</option>
              <option value="under_1k">Under $1,000</option>
              <option value="1k_5k">$1,000 – $5,000</option>
              <option value="5k_20k">$5,000 – $20,000</option>
              <option value="20k_50k">$20,000 – $50,000</option>
              <option value="over_50k">$50,000+</option>
              <option value="unknown">Not sure</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="pickup_from_date" label="Pickup from (optional)" error={errors.pickup_from_date} compact>
            <input
              id="pickup_from_date"
              name="pickup_from_date"
              type="date"
              defaultValue={v("pickup_from_date")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>

          <Field id="pickup_by_date" label="Pickup by (optional)" error={errors.pickup_by_date} compact>
            <input
              id="pickup_by_date"
              name="pickup_by_date"
              type="date"
              defaultValue={v("pickup_by_date")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>
      </div>

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
          {pending ? "Saving..." : (submitLabel ?? "Post freight")}
        </button>
        <p className="mt-2 text-xs text-neutral-600">
          Listings stay up for 30 days, then expire unless you renew.
        </p>
      </div>
    </form>
  );
}
