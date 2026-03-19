// app/dashboard/page.tsx
import { auth } from "@/auth";
import Link from "next/link";

export const metadata = { title: "Dashboard – Outback Connections" };

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name ?? "there";

  const cards = [
    {
      href: "/dashboard/post-a-job",
      title: "Post a fencing job",
      description:
        "Create a listing with the work type, location, and budget. Contractors in your area will see it and send quotes.",
      action: "Create job",
    },
    {
      href: "/dashboard/opportunities",
      title: "Opportunities",
      description:
        "Browse open fencing work posted by landholders and businesses. Apply or save ones you're interested in.",
      action: "Browse jobs",
    },
    {
      href: "/dashboard/profile",
      title: "Your profile",
      description:
        "Set up your contractor profile with skills, service areas, and rates so landholders can find you.",
      action: "Edit profile",
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
      <p className="mt-1 text-neutral-600">Welcome back, {name}.</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <article key={c.href} className="rounded-xl border bg-white p-6 shadow-sm hover:border-green-300 hover:shadow-md transition">
            <h2 className="text-lg font-semibold text-neutral-900">{c.title}</h2>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{c.description}</p>
            <div className="mt-4">
              <Link
                href={c.href}
                className="inline-flex items-center rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition shadow-sm"
              >
                {c.action}
              </Link>
            </div>
          </article>
        ))}
      </div>

      {!session && (
        <div className="mt-8 rounded-xl border bg-amber-50 border-amber-200 p-4">
          <p className="text-sm text-amber-800">
            You&apos;re not signed in. Some actions may be unavailable.{" "}
            <Link href="/login" className="font-semibold underline underline-offset-2 hover:text-amber-900">
              Sign in
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}
