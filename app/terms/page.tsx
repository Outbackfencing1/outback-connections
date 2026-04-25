import Link from "next/link";

export const metadata = {
  title: "Terms of use — Outback Connections",
  description:
    "What we promise, what you promise, and the limits. Plain English terms of use.",
};

const POLICY_VERSION = "v2-2026-04-23-marketplace-draft";
const LAST_UPDATED = "23 April 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Terms of use</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Version: <span className="font-mono">{POLICY_VERSION}</span> · Last
        updated {LAST_UPDATED}
      </p>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>
          <span className="font-semibold">Working draft.</span> Our lawyer
          will review this before we go live. If you spot something wrong,
          email{" "}
          <a
            href="mailto:support@outbackfencingsupplies.com.au"
            className="underline"
          >
            support@outbackfencingsupplies.com.au
          </a>{" "}
          and we&apos;ll fix it.
        </p>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">What this is</h2>
        <p className="text-neutral-800">
          Outback Connections is a free marketplace for rural Australia.
          You can browse without an account. To post a listing, you need
          to sign in with email and your account must be at least 7 days
          old. These terms cover what you can expect from us, and what
          we expect from you.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Who we are</h2>
        <p className="text-neutral-800">
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong>{" "}
          (ABN 76 674 671 820), 76 Astill Drive, Orange NSW 2800.{" "}
          <a
            href="mailto:support@outbackfencingsupplies.com.au"
            className="underline"
          >
            support@outbackfencingsupplies.com.au
          </a>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Your side</h2>
        <p className="text-neutral-800">When you post or contact someone, you agree:</p>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>Your listing is true.</strong> The work, freight, or
            service you describe is what you actually want or offer.
          </li>
          <li>
            <strong>You won&apos;t use the platform to scam, harass, or
            defame.</strong> Repeat offences mean account deletion and
            possible referral to police.
          </li>
          <li>
            <strong>You won&apos;t scrape contact details.</strong>{" "}
            We hide them from the open web; signing in to harvest them in
            bulk is grounds for ban.
          </li>
          <li>
            <strong>You&apos;ll comply with Australian law</strong> when
            posting and when dealing with the people you contact through
            the platform.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Our side</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>Free, forever, for end users.</strong> No lead fees,
            no paid placement, no premium tiers in V1.
          </li>
          <li>
            <strong>No advertising, no data sales, no spam.</strong>
          </li>
          <li>
            <strong>Your listings stay yours.</strong> You can edit or
            delete any time from the dashboard.
          </li>
          <li>
            <strong>We respond to flags.</strong> Any listing flagged by
            a user gets reviewed manually.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No warranties on listings</h2>
        <p className="text-neutral-800">
          Listings are user-generated. We don&apos;t verify the people, the
          work, the prices, the equipment, the licences, or the outcomes.
          Don&apos;t treat a listing as a recommendation.
        </p>
        <p className="text-neutral-800">
          Before you commit money or work, do your own due diligence:
          ask for references, check ABNs, request quotes in writing, and
          for big jobs use a written contract.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No middleman</h2>
        <p className="text-neutral-800">
          Outback Connections doesn&apos;t broker the connection. When
          you contact someone through a listing, that&apos;s a direct
          conversation between the two of you. We&apos;re not party to
          the deal, the contract, the work, or the payment.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Liability</h2>
        <p className="text-neutral-800">
          To the extent the law allows, Outback Connections and Outback
          Fencing &amp; Steel Supplies Pty Ltd aren&apos;t liable for any
          loss or damage arising from listings, contact made through the
          platform, or the work that follows. Australian Consumer Law
          protections still apply — nothing here limits rights that
          can&apos;t be limited.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Termination</h2>
        <p className="text-neutral-800">
          You can delete your account any time from{" "}
          <Link href="/dashboard/settings" className="underline">
            Account settings
          </Link>
          . We can suspend or close accounts that breach these terms or
          that we reasonably believe are being used for scams or abuse.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Changes</h2>
        <p className="text-neutral-800">
          We&apos;ll update these terms as the platform grows. The version
          stamp at the top shows what was current when you posted.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Law</h2>
        <p className="text-neutral-800">
          New South Wales, Australia.
        </p>
      </section>

      <hr className="my-10 border-neutral-200" />

      <p className="text-xs text-neutral-600">
        Outback Connections is run by Outback Fencing &amp; Steel Supplies
        Pty Ltd (ABN 76 674 671 820).
      </p>

      <div className="mt-4">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
