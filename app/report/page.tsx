import Link from "next/link";

export const metadata = {
  title: "Report — Outback Connections",
  description:
    "Report scams, illegal content, defamation, copyright infringement, or serious safety concerns.",
};

export default function ReportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm">
        <Link href="/" className="text-neutral-600 underline">
          ← Home
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Report something</h1>
      <p className="mt-3 max-w-prose text-sm text-neutral-700">
        Pick the category that fits best. Each route logs the report and
        sends an acknowledgement email with a reference number.
      </p>

      <ul className="mt-8 space-y-4">
        <ReportCard
          href="/legal/concerns-notice"
          title="Defamation, copyright, or illegal content"
          blurb="Use this for a defamation concerns notice under the Defamation Act 2005, copyright infringement, illegal content, or anything you say crosses a legal line. We respond within 5 business days."
        />
        <ReportCard
          href="/legal/concerns-notice"
          title="Privacy breach or doxxing"
          blurb="Personal information of yours that's been published on a listing without your consent. We treat these urgently — usually hidden within hours pending review."
        />
        <ReportCard
          inlineFlag
          title="Scam, fake listing, or rip-off"
          blurb="Open the listing in question and click the small 'Flag this listing' link below the listing body. Reason: 'scam'. Add a note describing what's off."
        />
        <ReportCard
          href="mailto:help@outbackconnections.com.au?subject=Serious%20safety%20concern"
          title="Serious safety concern"
          blurb="Threats, violence, suspected exploitation, or anything that could cause real-world harm. Email us directly so we can act fast — we monitor this inbox during business hours and check it daily otherwise. If immediate police response is needed, call 000."
        />
        <ReportCard
          href="mailto:help@outbackconnections.com.au?subject=General%20report"
          title="Anything else"
          blurb="Bug reports, broken listings, suggestions, or any other concern that doesn't fit the categories above."
        />
      </ul>

      <section className="mt-12 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-800">
        <h2 className="font-semibold text-neutral-900">What we do with reports</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Every report is logged with a reference number.</li>
          <li>
            For defamation, illegal content, and privacy breaches, the
            target listing is hidden pending review and the owner gets
            7 days to respond.
          </li>
          <li>
            For scams: we hide listings on receipt of credible reports
            and may permanently remove the account.
          </li>
          <li>
            We don&apos;t adjudicate workplace disputes, payment
            disputes, or quality complaints — those are between the
            parties (try Fair Trading or the Small Business Commissioner).
          </li>
          <li>
            Aggregate moderation stats are published at{" "}
            <Link href="/transparency" className="underline">
              /transparency
            </Link>
            .
          </li>
        </ul>
      </section>

      <p className="mt-8 text-xs text-neutral-500">
        Postal: Outback Fencing &amp; Steel Supplies Pty Ltd, 76 Astill
        Drive, Orange NSW 2800.
      </p>
    </div>
  );
}

function ReportCard({
  href,
  title,
  blurb,
  inlineFlag,
}: {
  href?: string;
  title: string;
  blurb: string;
  inlineFlag?: boolean;
}) {
  const Inner = (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md">
      <p className="text-base font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-700">{blurb}</p>
      {!inlineFlag && (
        <p className="mt-3 text-sm font-medium text-green-800">Continue →</p>
      )}
    </div>
  );

  if (inlineFlag) {
    return <li>{Inner}</li>;
  }

  if (href?.startsWith("mailto:")) {
    return (
      <li>
        <a href={href} className="block">
          {Inner}
        </a>
      </li>
    );
  }

  return (
    <li>
      <Link href={href ?? "#"} className="block">
        {Inner}
      </Link>
    </li>
  );
}
