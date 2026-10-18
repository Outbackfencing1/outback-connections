import Link from "next/link";
import JsonLd from "@/components/seo/JsonLd";
import { faqPageJsonLd } from "@/lib/seo";

export const metadata = {
  title: "FAQ — Outback Connections",
  description:
    "How to get a quote from a fencing contractor, where the listings come from, how to post immediately, and how a business claims, fixes or removes its entry.",
  alternates: { canonical: "/faq" },
};

const FAQ_SCHEMA_ITEMS = [
  {
    question: "How do I get a quote?",
    answer:
      "Find a contractor near you by postcode or region, open their entry and call, SMS, or press Get a quote. No account needed. If the business has claimed its listing, your request goes straight to them; if not, our team passes it on.",
  },
  {
    question: "Is it really free?",
    answer:
      "Yes. Free to browse, free to ask for quotes, free to post. No lead fees, no paid placement, no premium tiers.",
  },
  {
    question: "Where do the listings come from?",
    answer:
      "Entries are either posted directly by business owners and farmers, or compiled from public online business profiles (Facebook, TrueLocal, Google Maps, or the business's own website). Unclaimed profiles carry an Unclaimed Profile badge so owners can claim and manage them for free.",
  },
  {
    question: "How do I post a listing? Do I have to wait 7 days?",
    answer:
      "No waiting period. Sign up and submit your listing immediately. Newly registered users can enter an optional ABN or verified email/phone to publish straight away, or submit directly into our fast verification queue where our team approves genuine rural listings shortly.",
  },
  {
    question: "I'm a contractor. How do I claim my business profile?",
    answer:
      "Open your business profile and click Claim this profile. Verify using your matching business email domain, a 6-digit SMS code to the listed mobile number, or your 11-digit ABN for instant ownership, or request manual team review.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <JsonLd data={faqPageJsonLd(FAQ_SCHEMA_ITEMS)} />
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
          Most entries were found online: on Facebook, TrueLocal, Google Maps
          or the business&apos;s own website. They carry an{" "}
          <strong>Unclaimed Profile</strong> badge and say where we found them,
          because the business didn&apos;t post them. Other listings are posted
          directly by their owners.
        </Q>

        <Q q="I'm a contractor. Is my business on here?">
          Search{" "}
          <Link href="/services/fencing-contractor" className="underline">
            the directory
          </Link>{" "}
          for your business. If you&apos;re there, press{" "}
          <strong>Claim for free</strong> on your entry: verify with your
          matching business email, SMS code, or 11-digit ABN to unlock instant
          editing and photo uploads, or submit for our team to review. Want it
          changed or taken down instead? Email{" "}
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

        <Q q="How do I post? Do I have to wait 7 days?">
          No waiting period — you can fill out and submit{" "}
          <Link href="/post" className="underline">
            Post a listing
          </Link>{" "}
          immediately after creating your account. Verified accounts (or
          listings submitted with a valid Australian Business Number / ABN)
          publish straight away. If your account is brand new and not yet
          verified, your listing is saved immediately into our{" "}
          <strong>Pending Verification</strong> queue and our team approves it
          shortly. Listings stay active for 30 days and can be renewed any time.
        </Q>

        <Q q="Why is there a Pending Verification queue for brand-new unverified accounts?">
          To stop automated spam without making genuine farmers or tradies wait
          days to post urgent work. You fill out your listing once, straight
          away, and either confirm your ABN/email or let our team approve it.
        </Q>

        <Q q="How do I contact someone directly?">
          Where a business has public phone, SMS, email or website details,
          one-click contact buttons appear directly on the listing card and
          profile page. You can also send a direct quote or job enquiry on the
          page with zero lead fees.
        </Q>

        <Q q="What do the badges mean?">
          <strong>Unclaimed Profile</strong>: we found the business online and
          the owner can claim it for free. <strong>Claimed</strong>: the
          business owner manages the profile. <strong>ABN verified</strong>: we
          matched its 11-digit ABN on the Australian Business Register. Always
          check ABNs at{" "}
          <a
            href="https://abr.business.gov.au/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            abr.business.gov.au
          </a>
          , get quotes in writing, and for big jobs sign a clear scope of work.
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
