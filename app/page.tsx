// app/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Outback Connections | Rural Australia's Marketplace",
  description:
    "Find rural jobs, freight, and equipment across Australia. Built by Outback Fencing & Steel Supplies.",
};

export default function HomePage() {
  return (
    <main>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Hero */}
        <section className="py-10 sm:py-14 md:py-20">
          <div className="mx-auto max-w-3xl lg:max-w-5xl">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight [text-wrap:balance]">
              Rural Australia&apos;s marketplace for jobs, freight &amp; equipment
            </h1>

            <p className="mt-4 text-base sm:text-lg md:text-xl text-gray-700 [text-wrap:pretty]">
              Built by{" "}
              <a
                href="https://outbackfencing.com.au"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-4 hover:text-green-700"
              >
                Outback Fencing &amp; Steel Supplies
              </a>{" "}
              in Orange, NSW. We&apos;re connecting skilled Australians to get
              stuff done — on farm, on site, and everywhere in between.
            </p>

            {/* CTAs */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link
                href="/post-a-job"
                className="w-full sm:w-auto rounded-full px-5 py-3 text-center bg-green-700 text-white font-medium hover:bg-green-800 transition"
              >
                Post a listing
              </Link>
              <Link
                href="/opportunities"
                className="w-full sm:w-auto rounded-full px-5 py-3 text-center border font-medium hover:bg-gray-50 transition"
              >
                Browse opportunities
              </Link>
            </div>

            <div className="mt-3">
              <Link
                href="/pricing"
                className="text-sm font-medium text-gray-700 hover:text-green-700 underline underline-offset-4"
              >
                See pricing
              </Link>
            </div>
          </div>
        </section>

        {/* Value bullets */}
        <section className="pb-12 sm:pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <Feature
              title="Local &amp; fast"
              body="Post a job and reach nearby contractors quickly. Keep work close to home."
            />
            <Feature
              title="Fair &amp; transparent"
              body="Clear expectations and messaging up front to avoid time-wasting back-and-forth."
            />
            <Feature
              title="Made for the bush"
              body="Built for rural and regional work — fencing, earthworks, station work, trades and more."
            />
          </div>
        </section>

        {/* Secondary CTA */}
        <section className="pb-16 sm:pb-24">
          <div className="rounded-2xl border shadow-sm p-6 sm:p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Ready to get something done?
              </h2>
              <p className="mt-2 text-gray-700">
                It takes less than 2 minutes to post a job.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/post-a-job"
                className="rounded-full px-5 py-3 text-center bg-green-700 text-white font-medium hover:bg-green-800 transition"
              >
                Post a listing
              </Link>
              <Link
                href="/opportunities"
                className="rounded-full px-5 py-3 text-center border font-medium hover:bg-gray-50 transition"
              >
                Browse opportunities
              </Link>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border p-4 sm:p-5 md:p-6 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-gray-700 text-sm sm:text-base">{body}</p>
    </div>
  );
}
