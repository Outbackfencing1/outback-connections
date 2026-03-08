import Link from "next/link";

export const metadata = {
  title: "Pricing – Outback Connections",
  description: "Simple, transparent pricing for contractors on Outback Connections.",
};

export default function PricingPage() {
  const plans = [
    {
      name: "Free",
      price: "Free",
      desc: "Browse listings and post 1 listing per month.",
      features: [
        "Browse all listings",
        "1 listing per month",
        "Basic profile page",
        "Email notifications",
      ],
      cta: "Get Started",
      href: "/login",
      highlight: "Great for getting started",
    },
    {
      name: "Pro",
      price: "$29 / month",
      desc: "Unlimited listings with featured placement and analytics.",
      features: [
        "Unlimited listings",
        "Featured placement",
        "Listing analytics",
        "Priority in search results",
        "In-app messaging",
      ],
      cta: "Coming Soon",
      href: "#",
      highlight: "Most popular",
    },
    {
      name: "Business",
      price: "$99 / month",
      desc: "Everything in Pro plus API access, bulk listings, and priority support.",
      features: [
        "Everything in Pro",
        "API access",
        "Bulk listing upload",
        "Priority support",
        "Team logins",
        "Custom branding",
      ],
      cta: "Coming Soon",
      href: "#",
      highlight: "",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-10">
      <header>
        <h1 className="text-3xl font-extrabold text-green-800">Pricing</h1>
        <p className="mt-2 text-neutral-700">
          Simple, transparent pricing. Start free and upgrade when you&apos;re ready.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.name} className="flex flex-col rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-neutral-900">{plan.name}</h2>
            <div className="mt-2 text-2xl font-extrabold text-green-800">{plan.price}</div>
            {plan.highlight ? (
              <div className="mt-1 text-xs font-semibold text-green-800">{plan.highlight}</div>
            ) : null}
            <p className="mt-2 text-sm text-neutral-600">{plan.desc}</p>

            <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-700">
              {plan.features.map((f) => (
                <li key={f}>&bull; {f}</li>
              ))}
            </ul>

            {plan.href === "#" ? (
              <span className="mt-6 inline-block rounded-xl bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-500 text-center cursor-not-allowed">
                {plan.cta}
              </span>
            ) : (
              <Link
                href={plan.href}
                className="mt-6 inline-block rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 text-center"
              >
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="text-lg font-extrabold">Need a custom plan?</h3>
        <p className="mt-2 text-sm text-neutral-700">
          For large teams, regional contractors, or enterprise needs, get in touch
          and we&apos;ll put together a package that works for you.
        </p>
        <Link
          href="/post-a-job"
          className="mt-4 inline-block rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        >
          Contact Us
        </Link>
      </section>
    </div>
  );
}
