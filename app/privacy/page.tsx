import Link from "next/link";

export const metadata = {
  title: "Privacy notice — Outback Connections",
  description:
    "What we collect, why, how long we keep it, and how to delete it. Plain English, no legalese.",
};

const POLICY_VERSION = "v2-2026-04-23-marketplace-draft";
const LAST_UPDATED = "23 April 2026";

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
        <h2 className="text-xl font-bold">Who we are</h2>
        <p className="text-neutral-800">
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong> (ABN
          76 674 671 820), 76 Astill Drive, Orange NSW 2800. We run Outback
          Connections.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">What we collect</h2>
        <p className="text-neutral-800">
          When you create an account, we store your email address. We send
          you a magic link when you sign in. No passwords. We record when
          your account was created and when you last verified your email.
        </p>
        <p className="text-neutral-800">When you post a listing, we store:</p>
        <ul className="list-disc space-y-1 pl-6 text-neutral-800">
          <li>The category, title, description, and postcode you entered</li>
          <li>
            The contact email or phone number you chose to share (only
            visible to signed-in users)
          </li>
          <li>
            The kind-specific details — pay rate for jobs, vehicle type for
            freight, travel willingness for services, and similar
          </li>
          <li>
            The version of this privacy notice that was current when you
            posted (so we can prove what you agreed to)
          </li>
          <li>
            Standard server logs: your IP address, browser type, and
            timestamps
          </li>
        </ul>
        <p className="text-neutral-800">
          When someone flags a listing, we store the reason and any note,
          and the user who flagged it. Flagged listings are reviewed
          manually.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Why we collect it</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>To run the marketplace.</strong> Listings need somewhere
            to live; signed-in users need a way to see contact details.
          </li>
          <li>
            <strong>To prevent abuse.</strong> Server logs and flag data
            help us spot scam listings, repeat offenders, and bot signups.
          </li>
          <li>
            <strong>To comply with the law.</strong> If a court or
            regulator asks for records about a specific listing or
            interaction, we may need to provide them.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Who we share it with</h2>
        <p className="text-neutral-800">
          We don&apos;t sell your data. We don&apos;t share it with third
          parties for marketing. We don&apos;t pass it to other contractors,
          ad networks, or data brokers.
        </p>
        <p className="text-neutral-800">
          The only people who can see your contact details are signed-in
          users who view your listing. The only people who can see your
          private flag history are us (the moderators).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">How long we keep it</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>Active listings:</strong> as long as they&apos;re live
            (auto-expire at 30 days unless you renew).
          </li>
          <li>
            <strong>Expired listings:</strong> kept for up to 60 days after
            expiry so you can renew, then deleted.
          </li>
          <li>
            <strong>Account info:</strong> kept until you delete your
            account.
          </li>
          <li>
            <strong>Server logs:</strong> typically rotated within 30 days.
          </li>
          <li>
            <strong>Flag records:</strong> kept while the listing exists,
            cascade-deleted when the listing or the flagger&apos;s account
            is deleted.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">How to delete your data</h2>
        <p className="text-neutral-800">
          From{" "}
          <Link href="/dashboard/settings" className="underline">
            Account settings
          </Link>
          , click &quot;Delete my account&quot; and confirm. This deletes
          your account and all your listings immediately. It cannot be
          undone.
        </p>
        <p className="text-neutral-800">
          You can also delete a single listing from the dashboard without
          closing your account.
        </p>
        <p className="text-neutral-800">
          If you can&apos;t access your account, email{" "}
          <a
            href="mailto:support@outbackfencingsupplies.com.au"
            className="underline"
          >
            support@outbackfencingsupplies.com.au
          </a>{" "}
          and we&apos;ll handle it manually.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Changes</h2>
        <p className="text-neutral-800">
          We&apos;ll update this notice as the platform grows or the law
          changes. The version stamp at the top is what was current when
          your most recent listing was posted.
        </p>
      </section>

      <hr className="my-10 border-neutral-200" />

      <p className="text-xs text-neutral-600">
        Outback Connections is run by Outback Fencing &amp; Steel Supplies
        Pty Ltd (ABN 76 674 671 820). NSW law applies.
      </p>

      <div className="mt-4">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
