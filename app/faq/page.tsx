import Link from "next/link";

export const metadata = {
  title: "FAQ — Outback Connections",
  description:
    "How to get a quote from a fencing contractor, where the listings come from, and how a business claims, fixes or removes its entry. Plain answers.",
  alternates: { canonical: "/faq" },
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
        <Q q="How do I get a quote?">
          Find a contractor near you (search by{" "}
          <Link href="/services/fencing-contractor" className="underline">
            postcode or region
          </Link>
          ), open their entry and press <strong>Get a quote</strong>. No
          account needed: say what needs doing and how to reach you. If the
          business has claimed its listing, your request goes straight to
          them. If not, a person on our team passes it on. You get a
          reference number either way.
        </Q>

        <Q q="Is it really free?">
          Yes. Free to browse, free to ask for quotes, free to post. No lead
          fees, no paid placement, no premium tiers.
        </Q>

        <Q q="Where do the listings come from?">
          Most entries were found online: on Facebook, Yellow Pages,
          TrueLocal, Google Maps or the business&apos;s own website. They
          carry an Unclaimed badge and say where we found them, because the
          business didn&apos;t post them. We never publish the phone numbers
          or emails we found. Other listings are posted by their owners.
        </Q>

        <Q q="I'm a contractor. Is my business on here?">
          Search{" "}
          <Link href="/services/fencing-contractor" className="underline">
            the directory
          </Link>{" "}
          for your business. If you&apos;re there, press <strong>Claim it
          free</strong> on your entry: create an account, then we check the
          claim and hand the listing over. Add your contact details to it
          and quote requests come straight to you. Want it changed or taken
          down instead? Email{" "}
          <a
            href="mailto:help@outbackconnections.com.au?subject=Fix%20or%20remove%20my%20business%20listing"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          and we&apos;ll fix or remove it. If you&apos;re not listed,{" "}
          <Link href="/post" className="underline">
            post your business
          </Link>
          .
        </Q>

        <Q q="How do I post?">
          Sign up with your email and confirm it. Farmers can post a job
          they need done straight away; business listings can go up once
          your account is 24 hours old. Go to{" "}
          <Link href="/post" className="underline">
            Post a listing
          </Link>{" "}
          and pick the kind. Listings stay up for 30 days, then expire
          unless you renew them.
        </Q>

        <Q q="Why the 24-hour wait before posting a business listing?">
          To stop drive-by scammers. Most scam signups are bots that
          don&apos;t stick around a day.
        </Q>

        <Q q="How do I contact someone directly?">
          On listings posted by their owners, sign in and the
          poster&apos;s email and phone appear at the bottom. Reach out
          directly; we&apos;re not in the conversation and don&apos;t take
          a cut. Unclaimed entries have no contact details on our site:
          use Get a quote, or the link to where we found them.
        </Q>

        <Q q="Why no reviews?">
          Reviews on a small directory are easy to fake, easy to weaponise,
          and need a trust-and-safety team we don&apos;t have. Maybe later,
          properly, with a lawyer and a right-of-reply process.
        </Q>

        <Q q="What do the badges mean?">
          <strong>Unclaimed</strong>: we found the business online and it
          hasn&apos;t confirmed the details. <strong>Claimed by the
          owner</strong>: the business has claimed its entry.{" "}
          <strong>ABN verified</strong>: we matched its ABN on the
          Australian Business Register. None of them is a guarantee of
          quality: ask for references, check ABNs at{" "}
          <a
            href="https://abr.business.gov.au/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            abr.business.gov.au
          </a>
          , get quotes in writing, and for big jobs sign a contract.
        </Q>

        <Q q="What if I see a scam listing?">
          Sign in, open it, scroll to the bottom and click &quot;Flag this
          listing&quot;. We review every flag by hand. Something else wrong?{" "}
          <Link href="/report" className="underline">
            Report it
          </Link>
          .
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
