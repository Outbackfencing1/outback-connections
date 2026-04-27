import Link from "next/link";

export const metadata = {
  title: "Privacy notice — Outback Connections",
  description:
    "What we collect, why, how long we keep it, and how to delete it. APP-compliant working draft.",
};

const POLICY_VERSION = "v3-2026-04-25-app-compliant-draft";
const LAST_UPDATED = "25 April 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Privacy notice</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Version: <span className="font-mono">{POLICY_VERSION}</span> · Last
        updated {LAST_UPDATED} ·{" "}
        <Link href="/legal/archive" className="underline">
          previous versions
        </Link>
      </p>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>
          <span className="font-semibold">Working draft.</span> This notice
          aims to meet the 13 Australian Privacy Principles (APPs) under
          the Privacy Act 1988 (Cth). A lawyer will review it before public
          launch. If you spot something wrong, email{" "}
          <a
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>
          .
        </p>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Who we are (APP 1)</h2>
        <p className="text-neutral-800">
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong>{" "}
          (ABN 76 674 671 820), 76 Astill Drive, Orange NSW 2800. We run
          Outback Connections — a free rural marketplace.
        </p>
        <p className="text-neutral-800">
          Privacy questions, requests, or complaints go to{" "}
          <a
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>
          . A real person reads it.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Anonymity and pseudonyms (APP 2)</h2>
        <p className="text-neutral-800">
          You can browse listings without giving us any personal
          information. To post or contact a listing you must sign up with
          an email address; we don&apos;t require your real name on the
          public listing (a display name is fine).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          What we collect and why (APPs 3, 5, 6)
        </h2>
        <p className="text-neutral-800">
          <strong>Account information:</strong> email address, sign-in
          timestamps, the version of these terms / this notice you agreed
          to, and (optionally) your home postcode and a display name.
        </p>
        <p className="text-neutral-800">
          <strong>Listings:</strong> what you type into the post forms —
          category, title, description, postcode, contact email or phone
          number, kind-specific fields (pay rate, vehicle type, travel
          willingness, etc.), and the policy version current at posting.
        </p>
        <p className="text-neutral-800">
          <strong>Flags and complaints:</strong> reason and optional note
          when a user flags a listing; the listing identifier, the flagger
          identifier, and timestamps.
        </p>
        <p className="text-neutral-800">
          <strong>Server logs:</strong> IP address, browser user agent,
          request timestamps. Standard infrastructure logging from Vercel.
        </p>
        <p className="text-neutral-800">
          <strong>Cookies:</strong> see <Link href="/cookies" className="underline">our cookies notice</Link> for the full list. Today: auth session
          cookies only — no analytics, no tracking pixels.
        </p>
        <p className="text-neutral-800">
          We use this information to run the marketplace, prevent abuse,
          comply with the law, and (for opt-in users) send occasional
          product updates. We don&apos;t use it for any other purpose.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          Unsolicited information (APP 4)
        </h2>
        <p className="text-neutral-800">
          If we receive information we didn&apos;t ask for and don&apos;t
          need (e.g. a stranger emails us their resume), we&apos;ll delete
          or destroy it within a reasonable time unless we&apos;re required
          to keep it by law.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          Direct marketing (APP 7)
        </h2>
        <p className="text-neutral-800">
          We won&apos;t send you marketing emails unless you tick the
          opt-in box at signup. Even then, every marketing email has a
          one-click unsubscribe link, and you can revoke consent any time
          via{" "}
          <Link href="/dashboard/settings" className="underline">
            Account settings
          </Link>
          .
        </p>
        <p className="text-neutral-800">
          Transactional emails (sign-in links, listing renewal reminders,
          flag notifications about your own listing, account-related
          messages) are not marketing and are sent regardless of opt-in
          status.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          Cross-border disclosure (APP 8)
        </h2>
        <p className="text-neutral-800">
          We don&apos;t intentionally disclose your personal information
          to anyone overseas. Our infrastructure providers may process
          data in their global facilities:
        </p>
        <ul className="list-disc space-y-1 pl-6 text-neutral-800">
          <li>
            <strong>Supabase</strong> (database + auth) — primary region
            ap-southeast-2 (Sydney). Auth metadata may transit US-based
            control planes.
          </li>
          <li>
            <strong>Vercel</strong> (hosting + edge) — primary region
            for our project is iad1 (Washington DC, USA). Static assets
            are served from edge nodes worldwide.
          </li>
          <li>
            <strong>Resend</strong> (transactional email) — US-based,
            email delivery is global.
          </li>
        </ul>
        <p className="text-neutral-800">
          Each of these has its own privacy practices. We choose providers
          with reasonable data protection standards but you should know
          some routing happens outside Australia.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          Government identifiers (APP 9)
        </h2>
        <p className="text-neutral-800">
          We don&apos;t collect Tax File Numbers, Medicare numbers, or
          drivers&apos; licence numbers. ABN is optional for the future
          Verified badge — voluntary, you can leave it blank.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          Quality and security (APPs 10, 11)
        </h2>
        <p className="text-neutral-800">
          We take reasonable steps to keep your information accurate and
          secure: HTTPS everywhere, row-level security on the database,
          service-role access strictly limited, password-less sign-in via
          email magic links.
        </p>
        <p className="text-neutral-800">
          <strong>Storage location:</strong> Supabase Sydney region
          (ap-southeast-2). Backups within the same region.
        </p>
        <p className="text-neutral-800">
          <strong>Data breach response:</strong> if there&apos;s a notifiable
          data breach we&apos;ll tell the OAIC within 72 hours of becoming
          aware, and tell affected users as soon as practicable. Our
          internal procedure is documented at{" "}
          <span className="font-mono text-xs">docs/DATA-BREACH-RESPONSE-PLAN.md</span>{" "}
          in the project repository.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          Right to access (APP 12)
        </h2>
        <p className="text-neutral-800">
          You can request a copy of the personal information we hold about
          you. Email{" "}
          <a
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          with the subject &ldquo;Access request&rdquo;. We&apos;ll respond
          within 30 days. We may need to verify your identity by sending a
          confirmation link to your account email.
        </p>
        <p className="text-neutral-800">
          You can also see most of your data in real time at{" "}
          <Link href="/dashboard" className="underline">
            your dashboard
          </Link>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          Right to correction (APP 13)
        </h2>
        <p className="text-neutral-800">
          If something we hold about you is wrong, edit it via{" "}
          <Link href="/dashboard/settings" className="underline">
            Account settings
          </Link>{" "}
          (for account info) or{" "}
          <Link href="/dashboard/listings" className="underline">
            My listings
          </Link>{" "}
          (for listings). For anything you can&apos;t self-edit, email us
          and we&apos;ll fix it within 30 days.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Right to erasure</h2>
        <p className="text-neutral-800">
          From{" "}
          <Link href="/dashboard/settings" className="underline">
            Account settings
          </Link>
          , click &ldquo;Delete my account&rdquo; and confirm. This deletes
          your account, all your listings, all flags you submitted, and
          your profile, immediately and permanently. It cannot be undone.
        </p>
        <p className="text-neutral-800">
          You can also delete a single listing without closing your
          account.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">How long we keep data</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>Active listings: until expiry (30 days) or you delete.</li>
          <li>
            Expired listings: kept for 60 days after expiry so you can
            renew, then permanently deleted.
          </li>
          <li>Account info: kept until you delete your account.</li>
          <li>Server logs: typically rotated within 30 days.</li>
          <li>
            Flag records: kept while the listing exists; cascade-deleted
            with the listing or the flagger&apos;s account.
          </li>
          <li>
            Defamation complaints: kept for 7 years (limitation period
            under the Defamation Act 2005).
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Under-18s</h2>
        <p className="text-neutral-800">
          Outback Connections is for adults. If you&apos;re under 18,
          please don&apos;t use the site. We don&apos;t knowingly collect
          information from anyone under 18 — if you tell us we have, we&apos;ll
          delete it.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Complaints</h2>
        <p className="text-neutral-800">
          If you think we&apos;ve mishandled your information, email{" "}
          <a
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          first. We&apos;ll respond within 30 days. If we can&apos;t
          resolve it, you can take it to the Office of the Australian
          Information Commissioner (OAIC) at{" "}
          <a
            href="https://www.oaic.gov.au/"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            oaic.gov.au
          </a>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Changes to this notice</h2>
        <p className="text-neutral-800">
          We&apos;ll update this when our practices change or the law
          changes. The version stamp at the top is what was current when
          you last interacted with the site. Material changes get an email
          to opted-in users and a banner on-site for at least 14 days.
        </p>
      </section>

      <hr className="my-10 border-neutral-200" />

      <p className="text-xs text-neutral-600">
        Outback Connections is run by Outback Fencing &amp; Steel Supplies
        Pty Ltd (ABN 76 674 671 820). Australian Privacy Principles apply.
      </p>

      <div className="mt-4">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
