"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { createJob } from "./actions";

export default function PostJobForm() {
  const [isPending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [toastOk, setToastOk] = useState(false);

  return (
    <form
      className="max-w-3xl space-y-5"
      action={(fd) =>
        start(async () => {
          setToast(null);
          const res = await createJob(fd);
          if (res.ok) {
            setToast("Job posted successfully!");
            setToastOk(true);
            (document.getElementById("job-form") as HTMLFormElement)?.reset();
          } else {
            setToast(res.message || "Something went wrong.");
            setToastOk(false);
          }
        })
      }
      id="job-form"
    >
      <div>
        <label className="block text-sm font-semibold text-neutral-700">Fencing job title *</label>
        <input
          name="title"
          required
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
          placeholder="e.g. Boundary fencing — 3km hinge joint run"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-neutral-700">Location</label>
          <input
            name="location"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="e.g. Molong, NSW"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-neutral-700">Rate / Budget</label>
          <input
            name="rate"
            className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="e.g. $35/hr or $8,000 fixed"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-neutral-700">Description *</label>
        <textarea
          name="description"
          required
          rows={6}
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
          placeholder="Describe the fencing work needed — type of fence, terrain, materials, timeline..."
        />
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
        {isPending ? "Posting\u2026" : "Post fencing job"}
      </button>
    </form>
  );
}
