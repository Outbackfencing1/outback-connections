"use client";
import { useState, useTransition } from "react";
import BaseFields, { Field } from "./BaseFields";
import type { Category } from "./types";
import type { ActionResult } from "@/lib/posting";
import {
  COMMODITY_GROUPS,
  CONDITIONS,
  CONDITION_LABELS,
  DELIVERY,
  DELIVERY_LABELS,
  HARVEST_SEASONS,
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
  const [side, setSide] = useState<"supply" | "demand">(
    v("side") === "demand" ? "demand" : "supply"
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const isWanted = side === "demand";

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

      <fieldset className="rounded-xl border border-green-200 bg-green-50/60 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-green-900">
          What are you posting?
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm ${
              !isWanted
                ? "border-green-700 bg-white font-semibold text-neutral-900 shadow-sm"
                : "border-neutral-200 bg-white/70 text-neutral-700"
            }`}
          >
            <input
              type="radio"
              name="side"
              value="supply"
              checked={!isWanted}
              onChange={() => setSide("supply")}
              className="mt-0.5 h-4 w-4 text-green-700"
            />
            <span>
              <span className="block font-semibold">For Sale (Available)</span>
              <span className="block text-xs font-normal text-neutral-600">
                Selling cattle, sheep, hay, grain, machinery or fencing gear
              </span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm ${
              isWanted
                ? "border-green-700 bg-white font-semibold text-neutral-900 shadow-sm"
                : "border-neutral-200 bg-white/70 text-neutral-700"
            }`}
          >
            <input
              type="radio"
              name="side"
              value="demand"
              checked={isWanted}
              onChange={() => setSide("demand")}
              className="mt-0.5 h-4 w-4 text-green-700"
            />
            <span>
              <span className="block font-semibold">Wanted to Buy (Chasing)</span>
              <span className="block text-xs font-normal text-neutral-600">
                Looking to source livestock, hay, feed grain or machinery
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <BaseFields
        categories={categories}
        errors={errors}
        defaults={defaults ?? {}}
        titleLabel={isWanted ? "What are you looking to buy?" : "Title"}
        titlePlaceholder={
          isWanted
            ? "e.g. Chasing 2 decks of weaner steers or 100 rolls of lucerne hay near Dubbo"
            : "e.g. 120 × 8x4x3 shedded lucerne hay bales — Forbes"
        }
        descriptionLabel={
          isWanted ? "Specs, delivery & target price details" : "Description"
        }
      />

      <div className="rounded-xl border border-neutral-200 p-4">
        <p className="text-sm font-semibold text-neutral-800">
          {isWanted ? "Wanted stock, crop & budget details" : "Crop, livestock & price details"}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            id="sub_category"
            label="Stock, crop or gear type (optional)"
            error={errors.sub_category}
            compact
            hint="Helps buyers filter for exact hay, grain or stock"
          >
            <select
              id="sub_category"
              name="sub_category"
              defaultValue={v("sub_category")}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              <option value="">Select type (optional)…</option>
              {COMMODITY_GROUPS.map((g) => (
                <optgroup key={g.categorySlug} label={g.groupLabel}>
                  {g.options.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field
            id="harvest_season"
            label="Season, breed or specs (optional)"
            error={errors.harvest_season}
            compact
            hint="e.g. '2026/27 Season · Shedded', 'Angus 380kg', '8x4x3'"
          >
            <input
              id="harvest_season"
              name="harvest_season"
              list="harvest-season-suggestions"
              maxLength={60}
              defaultValue={v("harvest_season")}
              placeholder="2026/27 Season · Shedded"
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
            <datalist id="harvest-season-suggestions">
              {HARVEST_SEASONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>

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
          {pending
            ? "Saving..."
            : (submitLabel ?? (isWanted ? "Post wanted to buy" : "Post it for sale"))}
        </button>
        <p className="mt-2 text-xs text-neutral-600">
          Listings stay up for 30 days, then expire unless you renew. Mark it sold or sourced from your dashboard.
        </p>
      </div>
    </form>
  );
}
