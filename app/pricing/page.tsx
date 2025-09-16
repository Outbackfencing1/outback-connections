import Link from "next/link";

export default function PricingPage() {
  const plans = [
    {
      name: "Starter",
      price: "Free",
      desc: "Start free until you’ve earned $1,000 in completed job value.",
      features: [
        "Leads included",
        "Send quotes & invoices",
        "Profile listed in directory",
      ],
      cta: "Get Started",
      href: "/contractor",
      highlight: "Most popular for new contractors",
    },
    {
      name: "Growth",
      price: "$49 / month",
      desc: "For contractors building steady work.",
      features: [
        "Unlimited leads",
        "In-app messaging",
        "Job milestone tracking",
        "Priority listing in directory",
      ],
      cta: "Choose Growth",
      href: "/contractor",
      highlight: "",
    },
    {
      name: "Pro",
      price: "$99 / month",
      desc: "For established contractors wanting maximum exposure.",
      features: [
        "Everything in Growth",
        "Top-tier profile placement",
        "Early access to high-value jobs",
        "Premium support",
      ],
      cta: "Choose Pro",
      href: "/contractor",
      highlight: "",
    },
    {
      name: "Enterprise",
      price: "Custom",
      desc: "For large teams or regional contractors.",
      features: [
        "Custom pricing",
        "Team logins",
        "API & integrations",
        "Dedicated support rep",
      ],
      cta: "Contact Us",
      href: "/post-a-job", // or /contact later
      highlight: "",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header>
        <h1 className="text-3xl font-extrabold text-green-800">OutbackConnections Pricing</h1>
        <p className="mt-2 text-neutral-700">
          Contractors start free until you reach <strong>$1,000</strong> in completed job value.
          Upgrade anytime to unlock more leads and features.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
                <li key={f}>• {f}</li>
              ))}
            </ul>

            <Link
              href={plan.href}
              className="mt-6 inline-block rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 text-center"
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="text-lg font-extrabold">How “Free Until $1k” Works</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-neutral-700">
          <li>Accept jobs and complete milestones inside OutbackConnections.</li>
          <li>Once your total completed job value hits $1,000, choose a paid plan.</li>
          <li>If you pause work, you can downgrade or cancel anytime.</li>
        </ol>
        <p className="mt-4 text-xs text-neutral-500">
          Note: Threshold can be adjusted later based on market feedback.
        </p>
      </section>
    </div>
  );
}
