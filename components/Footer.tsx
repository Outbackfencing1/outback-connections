// components/Footer.tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/40">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* COI at top — visible on every page. */}
        <p className="border-l-4 border-amber-400 pl-4 text-sm text-neutral-700">
          Outback Connections is run by{" "}
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong>.
          We disclose this upfront, on every page.
        </p>

        {/* Single column on mobile with section dividers, 4 columns from md+. */}
        <div className="mt-8 grid gap-0 md:grid-cols-4 md:gap-8">
          <div className="border-t border-neutral-200 py-6 md:border-t-0 md:py-0">
            <h3 className="text-sm font-semibold text-neutral-900">
              Marketplace
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700">
              <li><Link href="/" className="hover:text-neutral-900">Home</Link></li>
              <li><Link href="/services" className="hover:text-neutral-900">Services</Link></li>
              <li><Link href="/jobs" className="hover:text-neutral-900">Jobs</Link></li>
              <li><Link href="/freight" className="hover:text-neutral-900">Freight</Link></li>
              <li><Link href="/post" className="hover:text-neutral-900">Post a listing</Link></li>
              <li><Link href="/about" className="hover:text-neutral-900">About</Link></li>
              <li><Link href="/faq" className="hover:text-neutral-900">FAQ</Link></li>
            </ul>
          </div>

          <div className="border-t border-neutral-200 py-6 md:border-t-0 md:py-0">
            <h3 className="text-sm font-semibold text-neutral-900">
              Legal
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700">
              <li><Link href="/privacy" className="hover:text-neutral-900">Privacy notice</Link></li>
              <li><Link href="/terms" className="hover:text-neutral-900">Terms of service</Link></li>
              <li><Link href="/acceptable-use" className="hover:text-neutral-900">Acceptable use</Link></li>
              <li><Link href="/cookies" className="hover:text-neutral-900">Cookies</Link></li>
            </ul>
          </div>

          <div className="border-t border-neutral-200 py-6 md:border-t-0 md:py-0">
            <h3 className="text-sm font-semibold text-neutral-900">
              Who we are
            </h3>
            <address className="mt-3 text-sm not-italic text-neutral-700">
              Outback Fencing &amp; Steel Supplies Pty Ltd
              <br />
              ABN 76 674 671 820
              <br />
              76 Astill Drive, Orange NSW 2800
            </address>
          </div>

          <div className="border-t border-neutral-200 py-6 md:border-t-0 md:py-0">
            <h3 className="text-sm font-semibold text-neutral-900">
              Contact
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700">
              <li>
                <a
                  href="mailto:support@outbackfencingsupplies.com.au"
                  className="inline-block py-1 hover:text-neutral-900"
                >
                  support@outbackfencingsupplies.com.au
                </a>
              </li>
              <li>
                <a
                  href="https://outbackfencingsupplies.com.au/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block py-1 hover:text-neutral-900"
                >
                  outbackfencingsupplies.com.au
                </a>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-10 text-xs text-neutral-500">
          &copy; {new Date().getFullYear()} Outback Connections · rural
          Australia&apos;s free marketplace.
        </p>
      </div>
    </footer>
  );
}
