import Link from "next/link";

export const metadata = {
  title: "Acceptable use — Outback Connections",
  description:
    "What you can and can't post on Outback Connections. Plain English, with examples.",
};

export default function AcceptableUsePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Acceptable use</h1>
      <p className="mt-2 text-neutral-700">
        This sits alongside our{" "}
        <Link href="/terms" className="underline">
          Terms of service
        </Link>
        . If you do any of the things below, we&apos;ll remove your
        listing and may close your account.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No illegal content</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            Anything that breaks Australian state or federal law.
            Examples: unlicensed building work where licensing is
            required, drugs, stolen goods, work-for-cash arrangements
            designed to dodge tax, anything involving minors.
          </li>
          <li>
            Misrepresenting your trade qualifications, licences,
            insurance, or ABN.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No defamation</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            Don&apos;t make false statements that damage another
            person&apos;s or business&apos;s reputation.
          </li>
          <li>
            Examples that aren&apos;t okay: &ldquo;Bob&apos;s Bores ripped
            me off, don&apos;t use them&rdquo; in a service request,
            &ldquo;Avoid John Smith Trucking — they&apos;re crooks&rdquo;
            in a freight listing.
          </li>
          <li>
            If you have a genuine complaint about another business or
            tradie, report it to Fair Trading or the relevant licensing
            body — not on a marketplace listing. We will remove
            defamatory content; see section 7 of the{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>
            .
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No scams or fraud</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>No phishing, no fake job ads, no advance-fee schemes.</li>
          <li>
            No &ldquo;send me $X up front and I&apos;ll deliver later&rdquo;
            patterns.
          </li>
          <li>
            No fake escrow, fake invoicing, or pretending to be a
            government department, bank, or known business.
          </li>
          <li>
            No multi-level marketing recruiting disguised as job ads.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No harassment</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            No bullying, threats, stalking, or repeated unwanted contact
            via the platform.
          </li>
          <li>
            No coordinated targeting of specific people or businesses.
          </li>
          <li>No content designed to humiliate or degrade.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No sexual content or hate speech</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>No sexually explicit material. No sex work listings.</li>
          <li>
            No hate speech, slurs, or content targeting people on the
            basis of race, ethnicity, religion, gender, sexuality,
            disability, age, or any other protected characteristic.
          </li>
          <li>No content that incites violence or extremism.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No IP infringement</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            Don&apos;t copy text, photos, branding, or logos that
            aren&apos;t yours.
          </li>
          <li>
            Don&apos;t pass yourself off as another business
            (&ldquo;passing off&rdquo; is unlawful in Australia).
          </li>
          <li>
            If you receive a takedown notice from a copyright owner,
            we&apos;ll act on it.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No doxxing</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            Don&apos;t post other people&apos;s personal details — phone
            number, email, home address, family info — without their
            consent.
          </li>
          <li>
            This includes &ldquo;here&apos;s the dodgy contractor&apos;s
            phone number&rdquo; — that&apos;s not okay even if your
            grievance is real.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">No off-platform harvesting</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            Listing contact details are for contacting the specific
            poster about that specific listing.
          </li>
          <li>
            Don&apos;t bulk-harvest contact info to add to mailing lists,
            sales pipelines, or any other secondary use.
          </li>
          <li>
            No automated scraping. No bots. Programmatic access requires
            our written permission.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">How we enforce this</h2>
        <p className="text-neutral-800">
          We rely on user reports (the flag button on every listing) and
          our own checks. When we find content that breaches this policy
          we&apos;ll usually:
        </p>
        <ol className="list-decimal space-y-2 pl-6 text-neutral-800">
          <li>Hide the listing immediately for serious breaches.</li>
          <li>Email the poster explaining what happened.</li>
          <li>
            Decide whether to restore (with edits), permanently remove,
            or close the account, depending on severity and history.
          </li>
        </ol>
        <p className="text-neutral-800">
          Repeated breaches mean account termination. Some breaches will
          also be reported to police or other authorities — fraud,
          threats of violence, content involving minors.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Reporting a breach</h2>
        <p className="text-neutral-800">
          Use the <strong>Flag this listing</strong> button on the
          listing detail page. For legal concerns (defamation, copyright,
          illegal content), use the <strong>Report a legal concern</strong>{" "}
          link below the flag button — that goes through a different
          process with a 5 business day response.
        </p>
      </section>

      <hr className="my-10 border-neutral-200" />

      <p className="text-xs text-neutral-600">
        Last updated 25 April 2026. Read alongside the{" "}
        <Link href="/terms" className="underline">
          Terms of service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          Privacy notice
        </Link>
        .
      </p>

      <div className="mt-4">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
