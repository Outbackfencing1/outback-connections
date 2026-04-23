import Link from "next/link";

export const metadata = {
  title: "Terms of use — Outback Connections",
  description:
    "What we promise, what you promise, and the limits. Plain English terms of use for Outback Connections.",
};

const POLICY_VERSION = "v1-2026-04-22-draft";
const LAST_UPDATED = "22 April 2026";

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
          will review this before we go live. If you spot something wrong or
          unclear, email{" "}
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
          Outback Connections is a free help service for rural Australians.
          You can use it without an account. These terms cover what you can
          expect from us, and what we expect from you.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Who we are</h2>
        <p className="text-neutral-800">
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong> (ABN
          76 674 671 820), 76 Astill Drive, Orange NSW 2800. You can reach
          us at{" "}
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
        <p className="text-neutral-800">
          When you send us a message, you agree that:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>
              What you tell us is true to the best of your knowledge.
            </strong>{" "}
            If you name a contractor, you&apos;re making a claim about what
            actually happened.
          </li>
          <li>
            <strong>
              You won&apos;t use this service to harass, defame, or threaten
              anyone.
            </strong>{" "}
            If we think a submission crosses that line, we&apos;ll refuse to
            act on it, and we may pass it to the police if the law requires.
          </li>
          <li>
            <strong>
              You accept that what we share is information, not advice.
            </strong>{" "}
            We&apos;re not lawyers, accountants, or licensed advisors. See
            the{" "}
            <Link href="/privacy" className="underline">
              privacy notice
            </Link>{" "}
            for what we do with your details.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Our side</h2>
        <p className="text-neutral-800">
          When you send us a message, we agree to:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>Read it within 48 hours.</strong> Jess or Josh,
            personally.
          </li>
          <li>
            <strong>Get back to you where we can help</strong> — by pointing
            you at Fair Trading, Rural Financial Counselling, the Small
            Business Ombudsman, or a contractor we know.
          </li>
          <li>
            <strong>Keep your details private.</strong> We don&apos;t sell
            them, we don&apos;t advertise with them, and we never publish
            contractor names.
          </li>
          <li>
            <strong>Delete your record on request.</strong> Email{" "}
            <a
              href="mailto:support@outbackfencingsupplies.com.au"
              className="underline"
            >
              support@outbackfencingsupplies.com.au
            </a>{" "}
            with your case number.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">What we don&apos;t promise</h2>
        <p className="text-neutral-800">
          We don&apos;t promise to solve your problem, recover your money,
          or get a contractor to do what they said they&apos;d do. This is a
          free service run by two people — we&apos;ll try, but we can&apos;t
          guarantee outcomes. If the matter is legally serious, get proper
          legal advice.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Liability</h2>
        <p className="text-neutral-800">
          To the extent the law allows, Outback Connections and Outback
          Fencing &amp; Steel Supplies Pty Ltd aren&apos;t responsible for
          losses that come from relying on what we share. Australian
          Consumer Law protections still apply — nothing here limits rights
          that can&apos;t be limited.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Changes</h2>
        <p className="text-neutral-800">
          We&apos;ll update these terms as the service grows. The version
          stamp at the top shows which version was current when you used
          the service.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Law</h2>
        <p className="text-neutral-800">
          These terms are governed by the law of New South Wales, Australia.
        </p>
      </section>

      <hr className="my-10 border-neutral-200" />

      <p className="text-xs text-neutral-600">
        Information, not advice. Outback Connections is run by Outback
        Fencing &amp; Steel Supplies Pty Ltd (ABN 76 674 671 820).
      </p>

      <div className="mt-4">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
