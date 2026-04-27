import Link from "next/link";

export const metadata = {
  title: "FAQ — Outback Connections",
  description:
    "Common questions about how the marketplace works. Plain answers.",
};

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">FAQ</h1>
      <p className="mt-2 text-neutral-700">
        Plain answers. If something isn&apos;t covered, email{" "}
        <a href="mailto:help@outbackconnections.com.au" className="underline">
          help@outbackconnections.com.au
        </a>
        .
      </p>

      <div className="mt-8 space-y-8">
        <Q q="Is it really free?">
          Yes. Free to browse, free to post, free to contact people. No lead
          fees. No paid placement. No premium tiers.
        </Q>

        <Q q="How do I post?">
          Sign up with your email, click the link we send you, and your
          account is created. After 7 days you can post. Go to{" "}
          <Link href="/post" className="underline">
            Post a listing
          </Link>{" "}
          and pick the kind. Forms take a few minutes. Listings stay up
          for 30 days then expire unless you re-post.
        </Q>

        <Q q="Why the 7-day waiting period before posting?">
          To kill drive-by scammers. Most scam signups are bots that don&apos;t
          stick around. Real people with patience get through; ad-spam bots
          generally don&apos;t.
        </Q>

        <Q q="How do I contact someone?">
          Open the listing while signed in. The poster&apos;s email and
          phone number appear at the bottom — clickable mailto: and tel:
          links. Reach out directly. We&apos;re not in the conversation
          and don&apos;t take a cut.
        </Q>

        <Q q="Why no messaging system?">
          Messaging systems are how marketplaces tax connections — once
          you&apos;re locked in, they can charge fees, throttle replies,
          and harvest data. We&apos;d rather be useless to scrape and let
          you talk directly.
        </Q>

        <Q q="Why no reviews?">
          Reviews on a small marketplace are easy to fake, easy to weaponise,
          and require a trust-and-safety team we don&apos;t have. Maybe
          later, properly, with a lawyer and a right-of-reply process.
          For now, the only signal is that the poster was willing to put
          their real contact details on the line.
        </Q>

        <Q q="How do I know a poster is legit?">
          You don&apos;t, automatically. Use your own judgment: ask for
          references, check ABNs at{" "}
          <a
            href="https://abr.business.gov.au/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            abr.business.gov.au
          </a>
          , get quotes in writing, and for big jobs sign a contract.
          We&apos;re a noticeboard, not a vetting service.
        </Q>

        <Q q="What's the Verified badge?">
          Coming in Phase 2. It&apos;ll mean: phone number verified, ABN
          verified, account at least 30 days old, no flags. Identity check
          only — not a guarantee of quality.
        </Q>

        <Q q="What if I see a scam listing?">
          Open it, scroll to the bottom, click &quot;Flag this listing&quot;.
          Pick a reason. We get the flag and review it manually. If
          enough flags pile up on one listing or one poster, we hide it
          and may close the account.
        </Q>

        <Q q="How do I delete my account?">
          Go to{" "}
          <Link href="/dashboard/settings" className="underline">
            Account settings
          </Link>
          . Type &quot;delete my account&quot; in the confirmation field
          and click Delete. Your account and all your listings disappear
          immediately. Can&apos;t be undone.
        </Q>

        <Q q="Who runs this?">
          <Link
            href="/about"
            className="underline"
          >
            Outback Fencing &amp; Steel Supplies Pty Ltd
          </Link>
          , a rural fencing manufacturer in Orange, NSW. We disclose this
          everywhere because we list fencing contractors alongside
          everyone else, and you should know who&apos;s running the
          platform.
        </Q>
      </div>

      <p className="mt-12 text-xs text-neutral-500">
        <Link href="/" className="underline">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-neutral-900">{q}</h2>
      <div className="mt-2 text-neutral-800">{children}</div>
    </div>
  );
}
