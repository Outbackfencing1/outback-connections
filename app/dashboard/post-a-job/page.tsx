// app/post-a-job/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Post a job – OutbackConnections"
};

export default function PostAJobPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">Post a job</h1>
      <p className="mt-2 text-neutral-600">
        Create a job and start receiving quotes. (Placeholder form for now.)
      </p>

      <form className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="text-sm">
          Title
          <input className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Eg. 500m boundary fence" />
        </label>
        <label className="text-sm">
          Description
          <textarea className="mt-1 w-full rounded-lg border px-3 py-2" rows={5} placeholder="Describe the work..." />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-xl border border-green-700 bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm">
            Submit
          </button>
          <Link href="/opportunities" className="rounded-xl border px-4 py-2 text-sm font-medium shadow-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
