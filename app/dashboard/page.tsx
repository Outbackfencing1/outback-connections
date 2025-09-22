// app/dashboard/page.tsx
import { auth } from "@/auth";
import Link from "next/link";

export const metadata = { title: "Dashboard – OutbackConnections" };

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name ?? "there";

  const cards = [
    {
      href: "/dashboard/post-a-job",
      title: "Post a job",
      description:
        "Create a listing with the work, location and pay. Contractors will be able to contact you.",
      action: "Create job",
    },
    {
      href: "/dashboard/opportunities",
      title: "Opportunities",
      description:
        "Browse open roles posted by landholders and businesses. Apply or save ones you like.",
      action: "Browse roles",
    },
    {
      href: "/dashboard/profile",
      title: "Your profile",
      description:
        "Tell us about your skills and availability so we can match you with the right work.",
      action: "Edit profile",
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-gray-700">Welcome, {name}.</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <article key={c.href} className="rounded-2xl border p-6 shadow-sm">
            <h2 className="text-lg font-medium">{c.title}</h2>
            <p className="mt-2 text-sm text-gray-700">{c.description}</p>
            <div className="mt-4">
              <Link
                href={c.href}
                className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                {c.action}
              </Link>
            </div>
          </article>
        ))}
      </div>

      {!session && (
        <p className="mt-8 text-sm text-amber-700">
          You’re not signed in. Some actions may be unavailable.
        </p>
      )}
    </main>
  );
}
