"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { createJob } from "./actions";

export default function PostJobForm() {
  const [isPending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  return (
    <form
      className="max-w-3xl space-y-4"
      action={(fd) =>
        start(async () => {
          setToast(null);
          const res = await createJob(fd);
          if (res.ok) {
            setToast("Job posted!");
            (document.getElementById("job-form") as HTMLFormElement)?.reset();
          } else {
            setToast(res.message || "Something went wrong.");
          }
        })
      }
      id="job-form"
    >
      <div>
        <label className="block text-sm font-medium">Job title *</label>
        <input name="title" required className="mt-1 w-full rounded border px-3 py-2" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Company</label>
          <input name="company" className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Location</label>
          <input name="location" className="mt-1 w-full rounded border px-3 py-2" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Pay rate</label>
        <input name="pay_rate" className="mt-1 w-full rounded border px-3 py-2" placeholder="$30–$34/hr" />
      </div>

      <div>
        <label className="block text-sm font-medium">Description *</label>
        <textarea
          name="description"
          required
          rows={6}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </div>

      {toast && <p className="text-sm text-gray-700">{toast}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Posting…" : "Post job"}
      </button>
    </form>
  );
}
