import Link from "next/link";

export const metadata = {
  title: "Terms of service — Outback Connections",
  description:
    "Platform terms covering user content, indemnities, defamation handling, liability cap, and dispute resolution.",
};

const POLICY_VERSION = "v4-2026-04-26-legal-hardening-draft";
const LAST_UPDATED = "26 April 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Terms of service</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Version: <span className="font-mono">{POLICY_VERSION}</span> · Last
        updated {LAST_UPDATED} ·{" "}
        <Link href="/legal/archive" className="underline">
          previous versions
        </Link>
      </p>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>
          <span className="font-semibold">Working draft.</span> A lawyer
          will review these terms before public launch. If you spot
          something wrong or unclear, email{" "}
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
        <h2 className="text-xl font-bold">1. What this is</h2>
        <p className="text-neutral-800">
          Outback Connections is a free online noticeboard. We publish
          listings posted by users (jobs, freight needs, services on
          offer, services wanted) and let signed-in users see contact
          details. We are <strong>not</strong> a broker, an agent, an
          employer, a recruiter, or a payment processor. We don&apos;t
          take a cut. We don&apos;t verify the content of listings, the
          identity of posters beyond email, or the work that may follow.
        </p>
        <p className="text-neutral-800">
          By using this site, including by posting or browsing, you agree
          to these terms. If you don&apos;t agree, don&apos;t use the site.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">2. Who we are</h2>
        <p className="text-neutral-800">
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong>{" "}
          (ABN 76 674 671 820), 76 Astill Drive, Orange NSW 2800. Contact:{" "}
          <a
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">3. Your account</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            You must be <strong>18 or over</strong> to use this site.
          </li>
          <li>You must give accurate information at signup.</li>
          <li>
            <strong>One account per person.</strong> Don&apos;t use
            multiple accounts to circumvent posting limits, flagging
            limits, or moderation.
          </li>
          <li>
            You&apos;re responsible for keeping access to your sign-in
            email secure. We send magic links to that address.
          </li>
          <li>
            We can suspend or terminate any account that breaches these
            terms, without notice or refund (the service is free anyway).
          </li>
          <li>
            You can close your account any time via{" "}
            <Link href="/dashboard/settings" className="underline">
              Account settings
            </Link>
            .
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          4. Acceptable use
        </h2>
        <p className="text-neutral-800">
          See the full{" "}
          <Link href="/acceptable-use" className="underline">
            Acceptable Use Policy
          </Link>
          . In short, you must not:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>Post anything illegal, fraudulent, or scam-like.</li>
          <li>
            Defame anyone — don&apos;t make false statements that damage
            another person&apos;s or business&apos;s reputation.
          </li>
          <li>
            Harass, bully, threaten, or stalk anyone via the platform.
          </li>
          <li>Post sexually explicit content, hate speech, or content that incites violence.</li>
          <li>
            Infringe someone else&apos;s intellectual property — don&apos;t
            copy text, images, or branding you don&apos;t own.
          </li>
          <li>
            Doxx — don&apos;t post anyone&apos;s personal information
            without their consent.
          </li>
          <li>
            Harvest contact details from listings for spam, marketing, or
            any bulk outreach. Each contact must be specific to the listing.
          </li>
          <li>
            Run scrapers or bots against the site without our written
            permission.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          5. Your content licence to us
        </h2>
        <p className="text-neutral-800">
          <strong>You keep ownership of everything you post.</strong> By
          posting, you grant Outback Fencing &amp; Steel Supplies Pty Ltd a
          worldwide, non-exclusive, royalty-free, sublicensable licence to
          host, display, distribute, copy, and create technical derivatives
          of your content for the purpose of operating Outback Connections,
          for the duration of the listing and for <strong>60 days after
          expiry or deletion</strong> (so that browser caches, backups, and
          search-engine indices can clear).
        </p>
        <p className="text-neutral-800">
          In addition, you grant us a <strong>perpetual, irrevocable
          licence</strong> to retain a copy of your content for{" "}
          <strong>legal, audit, regulatory, and dispute-resolution
          purposes</strong> only — for example, to evidence what was on the
          platform at a given point in time if a defamation, copyright, or
          law-enforcement matter arises. This retention copy is not
          republished and is not searchable; it sits in restricted backups
          accessible only to admin staff and our legal advisors.
        </p>
        <p className="text-neutral-800">
          You confirm that you have the right to post the content and to
          grant these licences (i.e. it&apos;s your content, or you have
          permission to use it).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          6. Your indemnity to us
        </h2>
        <p className="text-neutral-800">
          You indemnify Outback Fencing &amp; Steel Supplies Pty Ltd, its
          officers, employees, and agents against any claim, loss,
          liability, damage, cost, or expense (including legal fees on a
          full-indemnity basis) arising out of or in connection with:
        </p>
        <ul className="list-disc space-y-1 pl-6 text-neutral-800">
          <li>your content posted on the platform;</li>
          <li>your conduct on or in connection with the platform;</li>
          <li>your breach of these terms or applicable law;</li>
          <li>
            any dispute between you and another user (including disputes
            about work performed, payment, or quality).
          </li>
        </ul>
        <p className="text-neutral-800">
          This indemnity survives termination of your account.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          7. Defamation and complaints
        </h2>
        <p className="text-neutral-800">
          If you believe a listing defames you or a business you represent,
          email{" "}
          <a
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          (subject: &ldquo;Defamation complaint&rdquo;), or use the{" "}
          <em>Report a legal concern</em> link on the listing detail page.
        </p>
        <p className="text-neutral-800">
          We&apos;ll respond within <strong>5 business days</strong>. If
          the complaint reasonably suggests serious harm, we&apos;ll hide
          the listing pending review and notify the original poster, who
          has <strong>7 days</strong> to give a right of reply. We&apos;ll
          then either restore, edit, or permanently remove the listing. We
          may follow the &ldquo;concerns notice&rdquo; process under the
          Defamation Act 2005 (NSW). Our internal procedure is documented
          in <span className="font-mono text-xs">docs/DEFAMATION-COMPLAINT-PROCEDURE.md</span>.
        </p>
        <p className="text-neutral-800">
          We don&apos;t investigate or adjudicate the truth of statements;
          we make moderation decisions about whether content should remain
          on our platform.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          8. We&apos;re not the publisher
        </h2>
        <p className="text-neutral-800">
          Outback Connections is a digital intermediary. Listings are
          authored, edited, and submitted by users. We don&apos;t solicit,
          encourage, or curate the content of listings beyond providing
          forms with category and field structure. We rely on the safe
          harbours available to digital intermediaries under Australian
          law, including (without limitation) section 31A of the Defamation
          Act 2005 (NSW) where applicable.
        </p>
        <p className="text-neutral-800">
          Users are solely responsible for the content they post and for
          its accuracy, lawfulness, and compliance with the rights of
          third parties.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          9. No warranties
        </h2>
        <p className="text-neutral-800">
          We provide the site on an &ldquo;as is&rdquo; basis. We
          don&apos;t verify listings, identities (beyond email), the
          quality of work performed by users, or any other matter that
          users may rely on.
        </p>
        <p className="text-neutral-800">
          To the maximum extent permitted by law, we exclude all express
          and implied warranties — except those guaranteed by the
          Australian Consumer Law, which cannot be excluded.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          10. Liability cap
        </h2>
        <p className="text-neutral-800">
          To the maximum extent permitted by law, our total aggregate
          liability to you for any and all claims relating to your use of
          the site is capped at <strong>AUD $100</strong>. We&apos;re not
          liable for indirect, consequential, special, or incidental
          losses, loss of profits, loss of business, loss of data, or
          loss of opportunity.
        </p>
        <p className="text-neutral-800">
          Nothing in these terms limits or excludes any liability that
          can&apos;t be limited or excluded under the Australian Consumer
          Law. Where Australian Consumer Law applies and we&apos;re liable
          for a breach of a consumer guarantee, our liability is limited
          (where permitted) to re-supply of the service or payment of the
          cost of re-supply.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          10A. What we are <em>not</em>
        </h2>
        <p className="text-neutral-800">
          Outback Connections is a free public noticeboard. So that there
          is no confusion about the nature of the service:
        </p>
        <ul className="list-disc space-y-1 pl-6 text-neutral-800">
          <li>
            <strong>We are not lawyers, accountants, or financial advisors.</strong>{" "}
            Nothing on the site, in our emails, or in our responses to
            complaints constitutes legal, accounting, taxation, financial,
            or professional advice. If you need advice, get it from a
            qualified professional.
          </li>
          <li>
            <strong>We do not vet, verify, accredit, or warrant any
            person, business, listing, qualification, licence, ABN, or
            insurance.</strong> Email verification proves only that someone
            owns an inbox.
          </li>
          <li>
            <strong>We are not a broker, agent, employer, recruiter,
            employment agency, freight forwarder, contractor, or licensed
            trade body.</strong>
          </li>
          <li>
            <strong>We do not mediate, arbitrate, broker, or guarantee
            any transaction</strong> made between users on or through the
            platform. We don&apos;t hold money in escrow or process
            payments.
          </li>
          <li>
            <strong>We are not responsible for the outcomes</strong> of
            any conversation, contract, transaction, work performed, or
            interaction that arises from contact made via the platform.
          </li>
        </ul>
        <p className="text-neutral-800">
          Nothing in this section limits any rights you have under the
          Australian Consumer Law that cannot be excluded.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          10B. What you do at your own risk
        </h2>
        <p className="text-neutral-800">
          When you contact someone through Outback Connections, you do so
          directly and at your own risk. In particular, you are
          responsible for:
        </p>
        <ul className="list-disc space-y-1 pl-6 text-neutral-800">
          <li>
            <strong>Verifying any contractor, tradie, or service
            provider</strong> — checking licences, insurance, ABN
            registration, references, and prior work — before engaging
            them.
          </li>
          <li>
            <strong>Verifying any job poster</strong> — checking the
            business is real and the offer legitimate — before accepting
            work, travelling, or providing personal details.
          </li>
          <li>
            <strong>Anyone you meet in person.</strong> Meeting at a
            property, station, depot, or job site is between you and
            them. Tell someone where you&apos;re going. Trust your gut.
          </li>
          <li>
            <strong>Money you pay or receive.</strong> Outback Connections
            does not hold funds, escrow, guarantee payment, or recover
            funds in any dispute.
          </li>
          <li>
            <strong>Any work performed</strong> that arises from contact
            made via the platform — quality, delivery, damage, injury,
            and consumer rights are between the parties.
          </li>
        </ul>
        <p className="text-neutral-800">
          We are not liable for any loss, harm, injury, or cost arising
          from a user&apos;s decision to contact, transact with, employ,
          engage, hire, or meet another user, except to the limited
          extent the Australian Consumer Law applies and cannot be
          excluded.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          10C. Prohibited content (zero-tolerance)
        </h2>
        <p className="text-neutral-800">
          The following content is prohibited on Outback Connections.
          Posting any of it can result in <strong>immediate listing
          removal and account termination</strong> without notice or
          refund. We may also{" "}
          <strong>report illegal content to police, the OAIC, the
          ACCC, or other relevant authorities</strong> without notifying
          you, and we may preserve evidence for that purpose.
        </p>
        <ul className="list-disc space-y-1 pl-6 text-neutral-800">
          <li>
            Content that is unlawful, fraudulent, or scam-like (including
            phishing, money-mule recruitment, fake job offers,
            advance-fee scams).
          </li>
          <li>
            Content that defames, harasses, threatens, stalks, doxes, or
            intimidates any person or business.
          </li>
          <li>
            Sexual content, pornography, escort services, sexual
            services, and content depicting or facilitating the sexual
            exploitation of any person.
          </li>
          <li>
            Content depicting, encouraging, or facilitating violence,
            self-harm, suicide, or terrorism.
          </li>
          <li>
            Hate speech and content vilifying any person or group on the
            basis of race, ethnicity, religion, sex, gender, sexual
            orientation, disability, or other protected attribute.
          </li>
          <li>
            Content that infringes copyright, trademark, design, or other
            intellectual property rights.
          </li>
          <li>
            Content offering or soliciting the sale of regulated or
            illegal goods or services without proper authorisation —
            including firearms, explosives, prescription drugs,
            controlled substances, live native wildlife, stolen goods.
          </li>
          <li>
            Content offering employment that breaches Fair Work Australia
            laws, modern slavery laws, or workplace safety laws — for
            example, sub-minimum-wage offers, unpaid &ldquo;trial&rdquo;
            arrangements that are really unpaid work, dangerous work
            without PPE, or coerced labour.
          </li>
          <li>
            Content harvesting personal information for spam, marketing,
            data brokering, or training of large-language models without
            explicit consent.
          </li>
          <li>
            Anything else that breaches the{" "}
            <Link href="/acceptable-use" className="underline">
              Acceptable Use Policy
            </Link>
            .
          </li>
        </ul>
        <p className="text-neutral-800">
          Where required by law (for example child safety material,
          serious imminent threats), we will <strong>preserve evidence
          and refer the matter to police or eSafety</strong> immediately
          and without prior notice to the account holder.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          11. Disputes between users
        </h2>
        <p className="text-neutral-800">
          We don&apos;t mediate, adjudicate, or get involved in disputes
          between users. If you have a problem with someone you contacted
          through the site — about quality of work, payment, behaviour, or
          anything else — that&apos;s between you. Try Fair Trading,
          Rural Financial Counselling, or your state&apos;s Small Business
          Commissioner if you need help.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          12. Contact-info gating ≠ vetting
        </h2>
        <p className="text-neutral-800">
          We hide listing contact details from non-signed-in users to
          discourage scraping. <strong>This is a spam-control feature
          only.</strong> It is <em>not</em> a vetting, verification, or
          endorsement process. We don&apos;t warrant that signed-in users
          are trustworthy, lawful, or reputable. Always do your own due
          diligence before engaging another user.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          13. We can change these terms
        </h2>
        <p className="text-neutral-800">
          We can update these terms. For material changes, we&apos;ll
          give at least <strong>14 days&apos; notice</strong> via on-site
          banner and (for opted-in users) email. Continued use after the
          notice period means you accept the new terms.
        </p>
        <p className="text-neutral-800">
          The version stamp at the top is what was current when you
          posted or signed up.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">14. Termination</h2>
        <p className="text-neutral-800">
          You can terminate any time by deleting your account in{" "}
          <Link href="/dashboard/settings" className="underline">
            Account settings
          </Link>
          . We can suspend or terminate any account, with or without
          notice, for any breach of these terms or applicable law, or if
          we reasonably believe an account is being used for scams,
          fraud, or harassment. Termination doesn&apos;t affect rights or
          obligations that have already accrued (including the indemnity
          in section 6).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          15. Governing law and jurisdiction
        </h2>
        <p className="text-neutral-800">
          These terms are governed by the law of New South Wales,
          Australia. The courts of New South Wales have <strong>exclusive
          jurisdiction</strong> for any disputes arising under these
          terms.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">
          16. Severability and entire agreement
        </h2>
        <p className="text-neutral-800">
          If any part of these terms is found to be unenforceable, the
          rest of them keep working. These terms — together with the{" "}
          <Link href="/privacy" className="underline">
            Privacy notice
          </Link>{" "}
          and{" "}
          <Link href="/acceptable-use" className="underline">
            Acceptable Use Policy
          </Link>{" "}
          — are the entire agreement between you and us about the site,
          and they supersede any prior representations or understandings.
        </p>
      </section>

      <hr className="my-10 border-neutral-200" />

      <p className="text-xs text-neutral-600">
        Outback Connections is run by Outback Fencing &amp; Steel Supplies
        Pty Ltd (ABN 76 674 671 820). Australian Consumer Law preserved.
        NSW law applies.
      </p>

      <div className="mt-4">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
