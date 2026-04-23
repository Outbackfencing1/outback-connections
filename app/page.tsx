// app/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Outback Connections — rural consumer help, free",
  description:
    "Been ripped off, stuck on a quote, or something's gone wrong? We'll help. Free, for rural Australians. Run by Outback Fencing & Steel Supplies.",
};

export default function HomePage() {
  return (
    <div>
      {/* Conflict-of-interest disclosure — above the fold, unmissable. */}
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto max-w-3xl px-4 py-3 text-sm text-amber-900">
          <p>
            <span className="font-semibold">Upfront:</span> Outback Connections
            is run by{" "}
            <a
              href="https://outbackfencing.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Outback Fencing &amp; Steel Supplies
            </a>
            , a rural fencing manufacturer. We&apos;re telling you this up
            front so you know who we are.{" "}
            <Link href="/about" className="underline">
              More about us
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        {/* Hero */}
        <section>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
            Been ripped off? Stuck on a quote? Something gone wrong?{" "}
            <span className="text-green-800">We&apos;ll help — free.</span>
          </h1>

          <p className="mt-5 text-lg text-neutral-700 sm:text-xl">
            Tell us what&apos;s happened. We read every message within 48
            hours and point you somewhere useful — Fair Trading, Rural
            Financial Counselling, or a contractor we know to be straight.
          </p>

          <div className="mt-7">
            <Link
              href="/help"
              className="inline-block rounded-xl bg-green-700 px-6 py-4 text-lg font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2"
            >
              Get Help
            </Link>
          </div>

          <p className="mt-4 text-sm text-neutral-700">
            Something serious?{" "}
            <Link
              href="/report"
              className="font-medium underline underline-offset-2"
            >
              Report it privately
            </Link>
            . Nothing is made public — we don&apos;t name contractors.
          </p>
        </section>

        {/* What we do */}
        <section className="mt-14 border-t border-neutral-200 pt-8">
          <h2 className="text-2xl font-bold">What we do</h2>
          <ul className="mt-4 space-y-4 text-neutral-800">
            <li>
              <span className="font-semibold">Read your message.</span>{" "}
              Every one. Within 48 hours.
            </li>
            <li>
              <span className="font-semibold">
                Point you somewhere useful.
              </span>{" "}
              Fair Trading, Rural Financial Counselling, industry bodies, or
              contractors we know to be straight.
            </li>
            <li>
              <span className="font-semibold">Keep a private record.</span>{" "}
              Stored locked away. Never published with names attached. Helps
              us spot patterns across the bush.
            </li>
          </ul>
        </section>

        {/* Who we are */}
        <section className="mt-12 border-t border-neutral-200 pt-8">
          <h2 className="text-2xl font-bold">Who we are</h2>
          <p className="mt-3 text-neutral-800">
            A free service for rural Australians. Run by{" "}
            <a
              href="https://outbackfencing.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Outback Fencing &amp; Steel Supplies
            </a>{" "}
            in Orange, NSW. We started this because when rural people get
            stuck — on a quote, a job, or a contractor — there&apos;s no one
            local, plain-speaking, and free to turn to.
          </p>
          <p className="mt-3 text-neutral-800">
            We&apos;re new. We don&apos;t have testimonials yet. We&apos;d
            rather earn the trust than fake it.
          </p>
        </section>

        {/* Information, not advice */}
        <section className="mt-12 border-t border-neutral-200 pt-8">
          <h2 className="text-2xl font-bold">What we&apos;re not</h2>
          <p className="mt-3 text-neutral-800">
            We&apos;re not lawyers, accountants, or licensed advisors. What we
            give you is{" "}
            <span className="font-semibold">information, not advice</span> — a
            starting point, not a judgment. If the stakes are high, get
            proper advice alongside what we share.
          </p>
        </section>

        {/* Second CTA for long-scroll mobile */}
        <section className="mt-14 text-center">
          <Link
            href="/help"
            className="inline-block rounded-xl bg-green-700 px-6 py-4 text-lg font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2"
          >
            Get Help
          </Link>
          <p className="mt-3 text-sm text-neutral-600">
            Takes a few minutes. No account needed.
          </p>
        </section>
      </div>
    </div>
  );
}
