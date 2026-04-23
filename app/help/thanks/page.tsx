import Link from "next/link";

export const metadata = {
  title: "Message received — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: { case?: string | string[] };
};

export default function HelpThanksPage({ searchParams }: Props) {
  const raw = searchParams.case;
  const caseId = Array.isArray(raw) ? raw[0] : raw;
  const looksValid = !!caseId && /^HR-[A-Z0-9]{8}$/.test(caseId);
  const isDev = caseId === "HR-DEVMODE";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">
        We got your message.
      </h1>

      {looksValid ? (
        <p className="mt-3 text-neutral-800">
          Your case number is{" "}
          <span className="inline-block rounded-md border bg-neutral-50 px-2 py-1 font-mono text-base font-semibold">
            {caseId}
          </span>
          . Keep it handy — you&apos;ll see it in our reply.
        </p>
      ) : isDev ? (
        <p className="mt-3 text-neutral-800">
          <strong>Dev mode:</strong> the database isn&apos;t wired yet so
          nothing was stored. Your submission was logged to the server
          console.
        </p>
      ) : (
        <p className="mt-3 text-neutral-800">
          Thanks for getting in touch. Check your email for a confirmation —
          it has your case number in it.
        </p>
      )}

      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">What happens next</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-neutral-800">
          <li>
            We read every message within <strong>48 hours</strong>. Jess or
            Josh will get back to you personally.
          </li>
          <li>
            We&apos;ll point you somewhere useful — Fair Trading, Rural
            Financial Counselling, or someone who can actually do the work
            properly.
          </li>
          <li>
            If you gave us an email, a confirmation is on its way with direct
            links to those services.
          </li>
        </ol>
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">In the meantime</h2>
        <ul className="mt-3 space-y-2 text-sm text-neutral-800">
          <li>
            <strong>Rural Financial Counselling Service</strong> — call{" "}
            <a href="tel:1800686175" className="underline">
              1800 686 175
            </a>{" "}
            (free, independent).
          </li>
          <li>
            <strong>Your state&apos;s Fair Trading office</strong> — search
            &quot;fair trading [your state]&quot; for the direct line.
          </li>
          <li>
            <strong>Small Business &amp; Family Enterprise Ombudsman</strong>{" "}
            —{" "}
            <a
              className="underline"
              href="https://www.asbfeo.gov.au/"
              target="_blank"
              rel="noopener noreferrer"
            >
              asbfeo.gov.au
            </a>
          </li>
        </ul>
      </section>

      <p className="mt-8 text-xs text-neutral-600">
        Information, not advice. Outback Connections is run by Outback
        Fencing &amp; Steel Supplies.
      </p>

      <div className="mt-6 flex flex-wrap gap-4">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
        <Link href="/help" className="text-sm underline">
          Send another message
        </Link>
      </div>
    </div>
  );
}
