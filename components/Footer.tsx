// components/Footer.tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/40">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Critical disclosures. First, prominent, on every page. */}
        <div className="space-y-2 border-l-4 border-amber-400 pl-4 text-sm text-neutral-700">
          <p>
            <span className="font-semibold">Information, not advice.</span>{" "}
            We&apos;re not lawyers, accountants, or licensed advisors. What
            we share is a starting point, not a judgment. If the stakes are
            high, get proper advice alongside ours.
          </p>
          <p>
            <span className="font-semibold">Conflict of interest.</span>{" "}
            Outback Connections is run by Outback Fencing &amp; Steel
            Supplies Pty Ltd, a rural fencing manufacturer. We disclose this
            everywhere.
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">
              The service
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700">
              <li>
                <Link href="/help" className="hover:text-neutral-900">
                  Get help
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-neutral-900">
                  About us
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-neutral-900">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-neutral-900">
                  Terms
                </Link>
              </li>
            </ul>
          </div>

          <div>
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

          <div>
            <h3 className="text-sm font-semibold text-neutral-900">
              Contact
            </h3>
            <p className="mt-3 text-sm text-neutral-700">
              <a
                href="mailto:support@outbackfencingsupplies.com.au"
                className="hover:text-neutral-900"
              >
                support@outbackfencingsupplies.com.au
              </a>
              <br />
              <a
                href="https://outbackfencing.com.au"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-neutral-900"
              >
                outbackfencing.com.au
              </a>
            </p>
          </div>
        </div>

        <p className="mt-10 text-xs text-neutral-500">
          &copy; {new Date().getFullYear()} Outback Connections · a free
          service for rural Australians.
        </p>
      </div>
    </footer>
  );
}
