"use client";

import { useState, useTransition } from "react";
import { createFreightListing } from "./actions";

export default function PostFreightForm() {
  const [isPending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [toastOk, setToastOk] = useState(false);

  return (
    <form
      className="max-w-3xl space-y-5"
      action={(fd) =>
        start(async () => {
          setToast(null);
          const res = await createFreightListing(fd);
          if (res.ok) {
            setToast("Freight listing posted successfully!");
            setToastOk(true);
            (document.getElementById("freight-form") as HTMLFormElement)?.reset();
          } else {
            setToast(res.message || "Something went wrong.");
            setToastOk(false);
          }
        })
      }
      id="freight-form"
    >
      <div>
        <label className="block text-sm font-semibold text-neutral-700">Listing title *</label>
        <input
          name="title"
          required
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
          placeholder="e.g. Hay bales — Dubbo to Broken Hill"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-neutral-700">Origin</label>
          <input
            name="origin"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="e.g. Dubbo, NSW"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-neutral-700">Destination</label>
          <input
            name="destination"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="e.g. Broken Hill, NSW"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-semibold text-neutral-700">Vehicle type</label>
          <select
            name="vehicle_type"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600 bg-white"
          >
            <option value="">Select...</option>
            <option value="Semi trailer">Semi trailer</option>
            <option value="B-double">B-double</option>
            <option value="Flat top">Flat top</option>
            <option value="Stock crate">Stock crate</option>
            <option value="Tilt tray">Tilt tray</option>
            <option value="Ute / trailer">Ute / trailer</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-neutral-700">Weight / size</label>
          <input
            name="weight"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="e.g. 20 tonnes"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-neutral-700">Budget</label>
          <input
            name="budget"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="e.g. $2,500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-neutral-700">Description *</label>
        <textarea
          name="description"
          required
          rows={5}
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
          placeholder="Describe what needs to be transported — goods, dimensions, pickup/delivery details, timeline..."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-neutral-700">Contact email</label>
          <input
            name="contact_email"
            type="email"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-neutral-700">Contact phone</label>
          <input
            name="contact_phone"
            type="tel"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="04XX XXX XXX"
          />
        </div>
      </div>

      {toast && (
        <div className={`rounded-lg border p-3 text-sm ${
          toastOk
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {toast}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 transition shadow-sm disabled:opacity-50"
      >
        {isPending ? "Posting\u2026" : "Post freight listing"}
      </button>
    </form>
  );
}
