// app/dashboard/post-a-job/page.tsx
import { createJob } from "./actions";
import Link from "next/link";

export const metadata = {
  title: "Post a job – OutbackConnections",
  description: "Create a new job so local contractors can find and apply.",
};

export default function PostAJobPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-bold">Post a job</h1>
        <Link
          href="/dashboard/opportunities"
          className="rounded-full border px-4 py-2 text-sm hover:bg-gray-50"
        >
          View opportunities
        </Link>
      </div>

      <p className="mt-2 text-gray-600">
        Fill out the details below. You can keep it simple—title, location, and a short
        description is enough to start.
      </p>

      <form action={createJob} className="mt-8 space-y-5">
        <div>
          <label htmlFor="title" className="block text-sm font-medium">
            Title *
          </label>
          <input
            id="title"
            name="title"
            required
            className="mt-1 w-full rounded-xl border px-3 py-2"
            placeholder="e.g., Fencing labourer needed"
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-medium">
            Location *
          </label>
          <input
            id="location"
            name="location"
            required
            className="mt-1 w-full rounded-xl border px-3 py-2"
            placeholder="e.g., Tamworth, NSW"
          />
        </div>

        <div>
          <label htmlFor="rate" className="block text-sm font-medium">
            Rate (optional)
          </label>
          <input
            id="rate"
            name="rate"
            className="mt-1 w-full rounded-xl border px-3 py-2"
            placeholder="$30–$34/hr or $290/day"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium">
            Description *
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={6}
            className="mt-1 w-full rounded-xl border px-3 py-2"
            placeholder="What needs doing? When? Any requirements?"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            className="rounded-full bg-green-700 px-5 py-3 text-white font-medium hover:bg-green-800 transition"
          >
            Post job
          </button>
          <Link
            href="/"
            className="rounded-full border px-5 py-3 text-center font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </Link>
        </div>

        <p className="text-xs text-gray-500">
          By posting a job you agree to keep things fair and transparent.
        </p>
      </form>
    </main>
  );
}
