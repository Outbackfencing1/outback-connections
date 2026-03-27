import Link from "next/link";

export const metadata = {
  title: "Pricing – Outback Connections",
  description: "Simple, transparent pricing for rural businesses on Outback Connections.",
};

export default function PricingPage() {
  const plans = [
    {
      name: "Free",
      price: "Free",
      desc: "Get started with basic access to jobs, freight, and opportunities.",
      features: [
        "Browse all listings",
        "1 listing per month",
        "Basic contractor profile",
        "Email notifications",
      ],
      cta: "Get Started",
      href: "/login",
      highlight: "Great for getting started",
      featured: false,
    },
    {
      name: "Pro",
      price: "$29",
      period: "/ month",
      desc: "For active contractors and businesses who want more visibility and unlimited posts.",
      features: [
        "Unlimited job & freight listings",
        "Featured placement in search",
        "Listing analytics & views",
        "Priority in search results",
        "In-app messaging",
      ],
      cta: "Contact Us",
      href: "/post-a-job",
      highlight: "Most popular",
      featured: true,
    },
    {
      name: "Business",
      price: "$99",
      period: "/ month",
      desc: "For companies with teams and high-volume operations.",
      features: [
        "Everything in Pro",
        "API access",
        "Bulk listing upload",
        "Priority support",
        "Team logins",
        "Custom branding",
      ],
      cta: "Contact Us",
      href: "/post-a-job",
      highlight: "Best value for teams",
      featured: false,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      <header className="text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900">
          Simple, transparent pricing
        </h1>
        <p className="mt-3 text-neutral-600 max-w-lg mx-auto">
          Start free. Upgrade when you need more listings, visibility, and features.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col rounded-2xl border p-6 shadow-sm ${
              plan.featured
                ? "border-green-300 bg-green-50 ring-1 ring-green-200"
                : "bg-white"
            }`}
          >
            {plan.highlight && (
              <div className={`mb-3 inline-block self-start rounded-full px-3 py-1 text-xs font-semibold ${
                plan.featured
                  ? "bg-green-700 text-white"
                  : "bg-neutral-100 text-neutral-700"
              }`}>
                {plan.highlight}
              </div>
            )}

            <h2 className="text-xl font-bold text-neutral-900">{plan.name}</h2>

            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-neutral-900">{plan.price}</span>
              {plan.period && (
                <span className="text-sm text-neutral-500">{plan.period}</span>
              )}
            </div>

            <p className="mt-3 text-sm text-neutral-600 leading-relaxed">{plan.desc}</p>

            <ul className="mt-5 flex-1 space-y-2.5 text-sm text-neutral-700">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href={plan.href}
              className="mt-6 inline-block rounded-full bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 text-center transition shadow-sm"
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border bg-white p-6 sm:p-8 shadow-sm text-center">
        <h3 className="text-lg font-bold text-neutral-900">Need a custom plan?</h3>
        <p className="mt-2 text-sm text-neutral-600 max-w-md mx-auto">
          For large companies, regional groups, or enterprise needs,
          get in touch and we&apos;ll put together a package that works for you.
        </p>
        <Link
          href="/post-a-job"
          className="mt-4 inline-block rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 transition shadow-sm"
        >
          Contact Us
        </Link>
      </section>
    </div>
  );
}
