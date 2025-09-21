"use client";

import { useState } from "react";

type JobForm = {
  title: string;
  location: string;
  rate: string;
  description: string;
};

export default function PostAJobPage() {
  const [data, setData] = useState<JobForm>({
    title: "",
    location: "",
    rate: "",
    description: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  function update<K extends keyof JobForm>(key: K, value: JobForm[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");

    // Placeholder: no API/DB yet. Simulate a save.
    try {
      await new Promise((r) => setTimeout(r, 800));
      console.log("Job payload:", data);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-xl font-semibold">Post a Job</h2>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input
            value={data.title}
            onChange={(e) => update("title", e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2"
            placeholder="e.g. Farm Hand (Casual)"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Location</label>
            <input
              value={data.location}
              onChange={(e) => update("location", e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2"
              placeholder="e.g. Dubbo, NSW"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Rate</label>
            <input
              value={data.rate}
              onChange={(e) => update("rate", e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2"
              placeholder="e.g. $32/hr"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea
            value={data.description}
            onChange={(e) => update("description", e.target.value)}
            required
            rows={6}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Brief role summary, requirements, start date, etc."
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-xl border px-4 py-2 font-medium shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
          >
            {status === "saving" ? "Saving…" : "Publish Job"}
          </button>

          {status === "saved" && (
            <span className="text-sm text-green-600">Saved (demo).</span>
          )}
          {status === "error" && (
            <span className="text-sm text-red-600">Something went wrong.</span>
          )}
        </div>
      </form>

      <div className="mt-8 rounded-xl border p-4 text-sm text-gray-600">
        <p className="font-medium">What happens next?</p>
        <ul className="mt-2 list-disc pl-5">
          <li>This page currently simulates a save (no database yet).</li>
          <li>
            When you’re ready, we’ll wire this to{" "}
            <code>/api/jobs</code> and Prisma on Vercel.
          </li>
        </ul>
      </div>
    </div>
  );
}
