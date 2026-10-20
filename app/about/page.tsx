import Link from "next/link";
import JsonLd from "@/components/seo/JsonLd";
import { faqPageJsonLd } from "@/lib/seo";

export const metadata = {
  alternates: { canonical: "/about" },
  title: "About — Outback Connections",
  description:
    "Who runs Outback Connections, what it is, what it isn't, and how it's funded. Plain English, no spin.",
};

const ABOUT_FAQS = [
  {
    question: "Where do the listings on Outback Connections come from?",
    answer:
      "Some entries were gathered from public contractor directories and business websites and carry an Unclaimed badge until the owner claims them for free. Other listings are posted or claimed directly by their owners.",
  },
  {
    question: "Who runs Outback Connections?",
    answer:
      "Josh Crawford and the team at Outback Fencing & Steel Supplies Pty Ltd (ABN 76 674 671 820), 76 Astill Drive, Orange NSW 2800.",
  },
  {
    question: "Who sees enquiries sent through Outback Connections?",
    answer:
      "Direct phone, SMS, and email links connect you straight to the contractor. Quote forms on claimed listings go directly to that business. Quote forms on unclaimed listings are forwarded by our team in Orange to that specific business only — never sold or broadcast to competing contractors.",
  },
  {
    question: "Why is Outback Connections free?",
    answer:
      "Outback Connections is funded by Outback Fencing & Steel Supplies so rural contractors, farmers, and workers can connect with zero lead fees, zero commission, and no paid placement.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <JsonLd data={faqPageJsonLd(ABOUT_FAQS)} />
      <h1 className="text-3xl font-bold tracking-tight">About Outback Connections</h1>

      {/* Personal Introduction from Josh Crawford */}
      <div className="mt-6 rounded-2xl border border-green-200 bg-green-50/60 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green-800 text-lg font-extrabold text-white shadow-sm">
            JC
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-green-900">
              A note from the operator
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-neutral-900">
              G&apos;day — I&apos;m Josh Crawford
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-800">
              My family and team run{" "}
              <strong>Outback Fencing &amp; Steel Supplies</strong> out of{" "}
              <strong>76 Astill Drive, Orange NSW</strong>. Every week we talk
              to graziers and property owners trying to find a genuine rural
              fencer who is available and willing to reply — and to contractors
              looking for steady local runs without paying $20–$30 per lead on
              city tradie apps.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-800">
              We built Outback Connections as a straightforward rural directory
              and work board. We disclose our relationship on every page so you
              always know who is behind the site.
            </p>
          </div>
        </div>
      </div>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">Who sees your enquiries</h2>
        <p className="text-neutral-800">
          We keep enquiry routing transparent and private:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>1-click Call, SMS &amp; Email buttons:</strong> Go straight
            from your phone or computer to the contractor&apos;s published
            business number or email.
          </li>
          <li>
            <strong>Quote form on an Owner-Confirmed (Claimed) listing:</strong>{" "}
            Sent directly to that business by email, with a delivery reference
            logged so our team can flag failed deliveries or unanswered requests.
          </li>
          <li>
            <strong>Quote form on an Unclaimed directory listing:</strong> Read
            by our small team in Orange and forwarded to{" "}
            <strong>that specific business only</strong>. We never broadcast
            your quote request to rival contractors or sell your details as a
            lead.
          </li>
          <li>
            <strong>Private farm addresses:</strong> Public fencing requests and
            job posts only display your nearest town and 4-digit postcode. Keep
            exact property road numbers private until a contractor replies.
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">Where the listings come from</h2>
        <p className="text-neutral-800">
          Some entries were compiled from public rural directories and the
          business&apos;s own website, and were not posted by the business. Each
          one states where we found it and carries an{" "}
          <strong>Unclaimed listing</strong> badge until the owner confirms it.
        </p>
        <p className="text-neutral-800">
          Every unclaimed listing has three straightforward buttons:{" "}
          <strong>Claim this business</strong>,{" "}
          <strong>Report incorrect details</strong>, and{" "}
          <strong>Remove my listing</strong> — or you can email{" "}
          <a
            href="mailto:help@outbackconnections.com.au?subject=Fix%20or%20remove%20my%20business%20listing"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          any time and a real person in Orange will update or remove it
          immediately.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">
          How trust checks, vouches &amp; reviews work
        </h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>Four separate verification checks:</strong> We separate{" "}
            <em>Owner confirmed</em>, <em>ABN details checked</em>,{" "}
            <em>Insurance self-declared</em>, and{" "}
            <em>Insurance document checked</em> (with dates and expiry). As{" "}
            <a
              href="https://www.scamwatch.gov.au/about-us/news-and-alerts/farm-businesses-warned-as-scams-targeting-agricultural-sector-grow"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Scamwatch warns
            </a>
            , a public ABN alone does not prove someone controls a business.
          </li>
          <li>
            <strong>Neighbour vouches vs completed-work reviews:</strong> A
            quick 1-click neighbour vouch is recorded as a community tag
            endorsement and never inflates 5-star ratings. Star ratings come
            strictly from written reviews describing actual completed work or
            dealings, in line with{" "}
            <a
              href="https://www.accc.gov.au/consumers/advertising-and-promotions/online-reviews-for-product-and-services"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              ACCC online review guidance
            </a>
            , and business owners can reply publicly.
          </li>
          <li>
            <strong>Believable availability:</strong> Profiles show{" "}
            <em>Taking bookings</em>, <em>Booked until [Month]</em>, or{" "}
            <em>Availability not recently confirmed</em> alongside the date the
            owner last updated it.
          </li>
          <li>
            <strong>No paid tiers, no boosted listings:</strong> Funded by
            Outback Fencing &amp; Steel Supplies. Free for contractors,
            farmers, carriers, and rural workers.
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold">Start local, prove it works</h2>
        <p className="text-neutral-800">
          Rather than chasing a giant stale directory, our focus is helping
          landholders around Orange, Bathurst, Central West NSW, and regional
          Australia connect with responsive, owner-confirmed contractors.
        </p>
        <p className="text-neutral-800">
          Questions, ideas, or spot a problem? Email{" "}
          <a
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          — our team in Orange reads every message.
        </p>
      </section>

      <section className="mt-12 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Ready to post or claim your profile?</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Takes a few minutes. Free forever.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/post"
            className="inline-block rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
          >
            Post a listing
          </Link>
          <Link
            href="/profiles"
            className="inline-block rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:border-green-700"
          >
            Browse contractors &amp; profiles
          </Link>
        </div>
      </section>

      <div className="mt-10">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

