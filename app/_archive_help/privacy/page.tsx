import Link from "next/link";

export const metadata = {
  title: "Privacy notice — Outback Connections",
  description:
    "How we collect, use, share, and delete the information you give us on Outback Connections. Plain English, no legalese.",
};

const POLICY_VERSION = "v1-2026-04-22-draft";
const LAST_UPDATED = "22 April 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Privacy notice</h1>
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
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          and we&apos;ll fix it.
        </p>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Who we are</h2>
        <p className="text-neutral-800">
          Outback Connections is run by{" "}
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong> (ABN
          76 674 671 820), 76 Astill Drive, Orange NSW 2800. When you send us
          a message, we&apos;re the people who get it.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">What we collect</h2>
        <p className="text-neutral-800">
          When you fill in the{" "}
          <Link href="/help" className="underline">
            Get Help
          </Link>{" "}
          form, we store what you type in:
        </p>
        <ul className="list-disc space-y-1 pl-6 text-neutral-800">
          <li>
            The type of problem and the category (fencing, earthworks, bore
            pumps, etc.)
          </li>
          <li>Your postcode</li>
          <li>A rough dollar range and how urgent it is</li>
          <li>A description of what&apos;s happened</li>
          <li>
            The contractor&apos;s name, if you want to tell us — we never
            publish this
          </li>
          <li>Your first name</li>
          <li>Your email and/or phone number</li>
          <li>A good time to call, if you said so</li>
          <li>Which consent boxes you ticked</li>
          <li>The version of this privacy notice you agreed to</li>
        </ul>
        <p className="text-neutral-800">
          We also automatically record your IP address, the browser you used,
          and the time — standard server logs.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Why we collect it</h2>
        <ol className="list-decimal space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>To help you.</strong> We can&apos;t help if we don&apos;t
            know what happened and how to contact you.
          </li>
          <li>
            <strong>To spot patterns.</strong> When the same kind of problem
            turns up in the same postcode or trade, that&apos;s useful. We
            use anonymised versions of your submission (no name, no email,
            no phone, no contractor name) to understand what&apos;s going
            wrong in rural Australia. Raw records stay locked away.
          </li>
        </ol>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Who we share it with</h2>
        <p className="text-neutral-800">
          We don&apos;t sell your data. We don&apos;t share it unless you
          tick a box that says we can.
        </p>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>Outback Fencing &amp; Steel Supplies</strong> — if you
            tick the &quot;let them contact me about this fencing job&quot;
            box <em>and</em> you picked a fencing-related category, we pass
            your submission to them so they can reach out. Otherwise no.
          </li>
          <li>
            <strong>Fair Trading or similar bodies</strong> — if you tick the
            &quot;help me report this&quot; box, we help you lodge it.
            Otherwise no.
          </li>
        </ul>
        <p className="text-neutral-800">
          That&apos;s it. We don&apos;t advertise with your data, we
          don&apos;t sell it to data brokers, we don&apos;t pass it to other
          contractors.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">How long we keep it</h2>
        <p className="text-neutral-800">
          Until you ask us to delete it, or until the information is no
          longer useful for the reasons above. Anonymised aggregates (no
          personal info) we keep indefinitely — they&apos;re how we learn.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">How to delete your record</h2>
        <p className="text-neutral-800">
          Email{" "}
          <a
            href="mailto:help@outbackconnections.com.au?subject=delete"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          with the word <strong>&quot;delete&quot;</strong> and your case
          number (for example{" "}
          <span className="font-mono">HR-A8X2K9P3</span>). We&apos;ll remove
          it and confirm.
        </p>
        <p className="text-neutral-800">
          You can also ask us for a copy of everything we hold about you —
          same address.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Changes to this notice</h2>
        <p className="text-neutral-800">
          We&apos;ll update this when we learn something new, change
          something, or our lawyer tells us to. The version stamp at the top
          shows which version was current when you submitted.
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
