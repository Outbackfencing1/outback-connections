import Link from "next/link";

export const metadata = {
  title: "OutbackConnections – Get skilled work done across Australia",
  description:
    "Post a job, find trusted contractors, and keep projects moving. OutbackConnections connects farmers, landholders and trades with verified locals.",
  openGraph: {
    title: "OutbackConnections – Get skilled work done across Australia",
    description:
      "Post a job, find trusted contractors, and keep projects moving. OutbackConnections connects farmers, landholders and trades with verified locals.",
    url: "https://www.outbackconnections.com.au",
    type: "website"
  }
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Hero */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
        <div className="grid items-center gap-6 lg:grid-cols-2">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              Get skilled work done—fast, fair, and local
            </h1>
            <p className="mt-3 text-base leading-7 text-neutral-700">
              There are so many skilled Australians, but most ways to find help
              are messy and time-consuming. We’re building OutbackConnections to{" "}
              <span className="font-semibold">unlock productivity</span> and help
              people get stuff done—on farm, on site, and everywhere in between.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <PrimaryLink href="/post-a-job">Post a job</PrimaryLink>
              <SecondaryLink href="/opportunities">
                Find opportunities
              </SecondaryLink>
              <GhostLink href="/pricing">See pricing</GhostLink>
            </div>

            <ul className="mt-6 grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <Dot /> Verified IDs & references
              </li>
              <li className="flex items-center gap-2">
                <Dot /> Transparent reviews
              </li>
              <li className="flex items-center gap-2">
                <Dot /> Simple quotes & messaging
              </li>
              <li className="flex items-center gap-2">
                <Dot /> Built for rural & regional work
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border bg-neutral-50 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat number="3,200+" label="Contractors interested" />
              <Stat number="7,800+" label="Jobs planned & posted" />
              <Stat number="4.9/5" label="Average rating" />
              <Stat number="48h" label="Typical time to first quote" />
            </div>
            <div className="mt-6 rounded-xl border bg-white p-4 text-sm text-neutral-700">
              <p className="font-medium">What makes us different?</p>
              <p className="mt-1">
                Clear scopes, fair quoting, and tools that cut admin—so more of
                your time is spent doing the work, not chasing it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ValueCard
          title="Trust first"
          desc="ID checks, references and badges help you pick with confidence."
        />
        <ValueCard
          title="Fair & transparent"
          desc="Clear briefs, comparable quotes, and no hidden gotchas."
        />
        <ValueCard
          title="Built for the bush"
          desc="Fencing, earthmoving, welding, stock work—real jobs, real results."
        />
        <ValueCard
          title="Less admin"
          desc="Messaging, quoting and simple records all in one place."
        />
      </section>

      {/* How it works */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-bold tracking-tight">How it works</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Steps
            role="For customers"
            items={[
              {
                title: "Post a job",
                text:
                  "Describe the work, timing, and location. Add photos if helpful."
              },
              {
                title: "Compare quotes",
                text:
                  "Chat, refine scope, and choose the contractor that fits best."
              },
              {
                title: "Get it done",
                text:
                  "Track progress and leave a review to help the next person."
              }
            ]}
            cta={{ href: "/post-a-job", label: "Post a job" }}
          />
          <Steps
            role="For contractors"
            items={[
              {
                title: "Build your profile",
                text:
                  "List skills, tickets, regions and availability. Earn badges."
              },
              {
                title: "Find & win work",
                text:
                  "Browse new jobs, quote quickly, and message customers."
              },
              {
                title: "Deliver & grow",
                text:
                  "Great reviews lift your ranking and unlock higher-value jobs."
              }
            ]}
            cta={{ href: "/opportunities", label: "See opportunities" }}
          />
        </div>
      </section>

      {/* Popular categories */}
      <section>
        <h2 className="text-xl font-bold tracking-tight">Popular categories</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Category title="Fencing & rural infrastructure" href="/opportunities" />
          <Category title="Earthmoving & site prep" href="/opportunities" />
          <Category title="Welding & steel fabrication" href="/opportunities" />
          <Category title="Carpentry & sheds" href="/opportunities" />
          <Category title="Electrical & solar" href="/opportunities" />
          <Category title="Water, pumps & troughs" href="/opportunities" />
        </div>
      </section>

      {/* FAQ (lightweight, no JS) */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-bold tracking-tight">FAQs</h2>
        <div className="mt-4 space-y-3">
          <Faq
            q="Is OutbackConnections free to try?"
            a="Yes. Posting a job is free. Contractors can browse opportunities; paid tiers unlock higher volume, priority placement and advanced tools."
          />
          <Faq
            q="How do reviews and badges work?"
            a="Customers leave a rating and comments after each job. Badges reflect verified licences, tickets, insurance and on-platform performance."
          />
          <Faq
            q="Do you support remote and regional areas?"
            a="Absolutely. The platform is designed for rural and regional work—flexible regions, travel notes, and offline-friendly messaging."
          />
        </div>
      </section>

      {/* Closing CTA */}
      <section className="rounded-2xl border bg-white p-6 text-center shadow-sm sm:p-10">
        <h2 className="text-2xl font-bold tracking-tight">
          Ready to get work moving?
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-neutral-700">
          Post a job in minutes or browse opportunities now. Simple tools, fair
          process, real results.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <PrimaryLink href="/post-a-job">Post a job</PrimaryLink>
          <SecondaryLink href="/opportunities">Find opportunities</SecondaryLink>
          <GhostLink href="/dashboard">Go to dashboard</GhostLink>
        </div>
      </section>
    </div>
  );
}

/* ---------- small server-safe UI helpers (no client code) ---------- */

function Dot() {
  return <span className="inline-block h-2 w-2 rounded-full bg-green-600" />;
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-green-700 bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 active:opacity-90"
    >
      {children}
    </Link>
  );
}

function SecondaryLink({
  href,
  children
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50 active:opacity-95"
    >
      {children}
    </Link>
  );
}

function GhostLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 text-center">
      <div className="text-2xl font-black tracking-tight">{number}</div>
      <div className="mt-1 text-xs text-neutral-600">{label}</div>
    </div>
  );
}

function ValueCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-neutral-700">{desc}</p>
    </div>
  );
}

function Steps({
  role,
  items,
  cta
}: {
  role: string;
  items: { title: string; text: string }[];
  cta: { href: string; label: string };
}) {
  return (
    <div className="rounded-xl border bg-neutral-50 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          {role}
        </h3>
        <Link
          href={cta.href}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-neutral-100"
        >
          {cta.label}
        </Link>
      </div>
      <ol className="mt-4 space-y-3">
        {items.map((s, i) => (
          <li key={i} className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-neutral-200">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-700 text-xs font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-sm text-neutral-700">{s.text}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Category({ title, href }: { title: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
    >
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-neutral-700">Browse active jobs in this category.</p>
    </Link>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-xl border bg-neutral-50 p-4">
      <summary className="cursor-pointer select-none text-sm font-semibold">{q}</summary>
      <p className="mt-2 text-sm text-neutral-700">{a}</p>
    </details>
  );
}
