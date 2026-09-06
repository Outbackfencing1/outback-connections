"use client";
import { useState, useTransition } from "react";
import BaseFields, { Field } from "./BaseFields";
import type { Category } from "./types";
import type { ActionResult } from "@/lib/posting";
import {
  CONDITIONS,
  CONDITION_LABELS,
  DELIVERY,
  DELIVERY_LABELS,
  PRICE_TYPES,
  PRICE_TYPE_LABELS,
} from "@/lib/sale";

type Props = {
  categories: Category[];
  action: (formData: FormData) => Promise<ActionResult>;
  listingId?: string;
  defaults?: Record<string, string>;
  submitLabel?: string;
};

export default function PostSaleForm({ categories, action, listingId, defaults, submitLabel }: Props) {
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
          document.getElementById(firstKey)?.scrollIntoView({ behavior: "smooth", block: "center" });
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

      <BaseFields categories={categories} errors={errors} defaults={defaults ?? {}} />

      <div className="rounded-xl border border-neutral-200 p-4">
        <p className="text-sm font-semibold text-neutral-800">Price and quantity</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="price_type" label="Price type" error={errors.price_type} required compact>
            <select
              id="price_type"
              name="price_type"
              required
              defaultValue={v("price_type") || "negotiable"}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              {PRICE_TYPES.map((p) => (
                <option key={p} value={p}>
                  {PRICE_TYPE_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>

          <Field id="price" label="Price (AUD, optional for negotiable / POA)" error={errors.price} compact hint="Numbers only, like 1250 or 85.50">
            <input
              id="price"
              name="price"
              inputMode="decimal"
              maxLength={20}
              defaultValue={v("price")}
              placeholder="1250"
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="quantity" label="Quantity (optional)" error={errors.quantity} compact>
            <input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="1000000"
              defaultValue={v("quantity")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
          <Field id="unit" label="Unit (optional)" error={errors.unit} compact hint="head, bales, tonnes, rolls…">
            <input
              id="unit"
              name="unit"
              maxLength={30}
              defaultValue={v("unit")}
              placeholder="bales"
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="condition" label="Condition" error={errors.condition} compact>
            <select
              id="condition"
              name="condition"
              defaultValue={v("condition") || "na"}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="delivery" label="Pickup or delivery" error={errors.delivery} compact>
            <select
              id="delivery"
              name="delivery"
              defaultValue={v("delivery") || "pickup"}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              {DELIVERY.map((d) => (
                <option key={d} value={d}>
                  {DELIVERY_LABELS[d]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
        <strong>Tip:</strong> Say what it is, how many, where it is, and whether you can load it.
        Buyers contact you directly; there&apos;s no payment through the site and no commission.
      </p>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-block rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2 disabled:opacity-60"
        >
          {pending ? "Saving..." : (submitLabel ?? "Post it for sale")}
        </button>
        <p className="mt-2 text-xs text-neutral-600">
          Listings stay up for 30 days, then expire unless you renew. Mark it sold from your dashboard.
        </p>
      </div>
    </form>
  );
}
