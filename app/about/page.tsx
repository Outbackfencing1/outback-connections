import Link from "next/link";

export const metadata = {
  title: "About — Outback Connections",
  description:
    "Who runs Outback Connections, what it is, what it isn't, and how it's funded. Plain English, no spin.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">About</h1>

      <p className="mt-4 text-neutral-800">
        Outback Connections is a free marketplace for rural Australia.
        Three pillars: jobs, freight, and services. Post what you&apos;ve
        got or what you need. Anyone can browse; sign in to post or to
        contact a listing.
      </p>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">Who runs it</h2>
        <p className="text-neutral-800">
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong>{" "}
          (ABN 76 674 671 820), based in Orange, NSW. A rural fencing and
          steel manufacturer that&apos;s been doing business with rural
          customers for years.
        </p>
        <p className="text-neutral-800">
          We&apos;re telling you upfront because the platform will list
          fencing contractors alongside everyone else. We disclose the
          relationship on every page so you can judge for yourself.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">Why free</h2>
        <p className="text-neutral-800">
          hipages charges tradies $20–30 per lead whether they win the
          job or not. Airtasker is city-focused. Nothing decent exists for
          rural Australia. Charging tradies to find rural work is the
          opposite of what the bush needs, so we won&apos;t do it.
        </p>
        <p className="text-neutral-800">
          This is funded by Outback Fencing. No lead fees, no paid
          placement, no ads. Free forever for the people using it.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">What we don&apos;t do</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>No reviews or ratings.</strong> Too easy to fake,
            too easy to defame, and we&apos;re not running a
            trust-and-safety team. Maybe later, properly — with a lawyer.
          </li>
          <li>
            <strong>No messaging system.</strong> You contact each other
            directly by email or phone. We never charge for a connection.
          </li>
          <li>
            <strong>No paid tiers, no boosted listings.</strong> Everyone
            shows up on equal footing.
          </li>
          <li>
            <strong>No scraping your contact details.</strong> They&apos;re
            hidden from the public web — you only see them after signing in.
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">We&apos;re new</h2>
        <p className="text-neutral-800">
          Launched in 2026. We don&apos;t have hundreds of listings yet,
          and we don&apos;t have testimonials. If the platform earns your
          trust over time, word will get around. We&apos;d rather start
          small and honest than fake our way to critical mass.
        </p>
        <p className="text-neutral-800">
          Questions, ideas, or spot a problem? Email{" "}
          <a
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          — a real person reads it.
        </p>
      </section>

      <section className="mt-12 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Ready to post?</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Takes a few minutes. Free forever.
        </p>
        <Link
          href="/post"
          className="mt-4 inline-block rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Post a listing
        </Link>
      </section>

      <div className="mt-10">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
