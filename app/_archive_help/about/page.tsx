import Link from "next/link";

export const metadata = {
  title: "About — Outback Connections",
  description:
    "Who runs Outback Connections, what we do, what we don't, and how it's funded. Plain English, no spin.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">About us</h1>
      <p className="mt-3 text-neutral-800">
        Outback Connections is a free help service for rural Australians
        who&apos;ve been ripped off, stuck mid-project, or aren&apos;t sure
        what to do about a quote. If a contractor has mucked you about,
        we&apos;ll try to point you somewhere useful.
      </p>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">Who runs it</h2>
        <p className="text-neutral-800">
          This is run by{" "}
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong> (ABN
          76 674 671 820) out of Orange, NSW — a rural fencing and steel
          manufacturer. Josh and Jess personally read every message that
          comes in. No help desk, no chatbot, no call centre.
        </p>
        <p className="text-neutral-800">
          We&apos;re telling you up front because we know fencing customers
          who get in touch might wonder if this is a sales funnel dressed up
          as consumer help. It isn&apos;t — but you deserve to make that
          call yourself, with the facts visible.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">What we do</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>Read every message within 48 hours.</strong> Not a bot.
            Us.
          </li>
          <li>
            <strong>Point you somewhere useful.</strong> Fair Trading, Rural
            Financial Counselling, the Small Business Ombudsman, or a
            contractor we know to be straight.
          </li>
          <li>
            <strong>Keep a private record</strong> so we can spot patterns —
            which categories of work are going wrong, where, and how often.
            Names stay private. We don&apos;t publish anything that
            identifies a contractor.
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">What we don&apos;t do</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>We&apos;re not lawyers.</strong> If you need legal advice
            — contracts, disputes, debt recovery — we&apos;ll point you at
            the right specialist, but we can&apos;t give you the advice
            itself.
          </li>
          <li>
            <strong>We&apos;re not accountants or financial counsellors.</strong>{" "}
            Same deal — we&apos;ll refer you to Rural Financial Counselling,
            which is free and genuinely independent.
          </li>
          <li>
            <strong>We&apos;re not a mediator.</strong> We don&apos;t run
            dispute resolution between you and a contractor. If that&apos;s
            what you need, state Fair Trading offices and the Small Business
            Ombudsman do it properly.
          </li>
          <li>
            <strong>We don&apos;t publish contractor names.</strong> Not for
            complaints, not for anything — until we have a lawyer-reviewed
            right-of-reply process and insurance in place. If you want
            someone publicly called out, we&apos;re not the right place for
            that right now.
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">How we&apos;re funded</h2>
        <p className="text-neutral-800">
          We&apos;re not, really. This is unpaid work. Outback Fencing &amp;
          Steel Supplies covers the costs — domain, hosting, email, database
          — because we think rural customers deserve somewhere to turn. No
          grants, no sponsors, no ads. We&apos;ll tell you if that ever
          changes.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">We&apos;re new</h2>
        <p className="text-neutral-800">
          We launched this in April 2026. We don&apos;t have hundreds of
          cases yet, and we don&apos;t have testimonials. We&apos;d rather
          earn the trust than fake it. If the service is worth your time,
          word will get around.
        </p>
        <p className="text-neutral-800">
          If you&apos;ve got questions, want to check we&apos;re legit
          before sending us something, or spot a mistake on the site — email{" "}
          <a
            href="mailto:support@outbackfencingsupplies.com.au"
            className="underline"
          >
            support@outbackfencingsupplies.com.au
          </a>{" "}
          and a real person will reply.
        </p>
      </section>

      <section className="mt-12 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Ready to send us a message?</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Takes a few minutes. No account needed. We&apos;ll read it within
          48 hours.
        </p>
        <Link
          href="/help"
          className="mt-4 inline-block rounded-xl bg-green-700 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Get Help
        </Link>
      </section>

      <div className="mt-10">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
