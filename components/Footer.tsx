// components/Footer.tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-green-700 flex items-center justify-center">
                <span className="text-white font-bold text-xs">OC</span>
              </div>
              <span className="font-bold text-neutral-900">Outback Connections</span>
            </div>
            <p className="text-sm text-neutral-600 max-w-xs">
              Australia&apos;s marketplace for fencing contractors and rural work.
            </p>
            <div className="space-y-0.5">
              <p className="text-xs text-neutral-500">
                Built by Outback Fencing &amp; Steel Supplies Pty Ltd
              </p>
              <p className="text-xs text-neutral-400">ABN 76 674 671 820</p>
            </div>
          </div>

          {/* Links */}
          <div className="flex gap-12">
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Platform
              </h4>
              <nav className="flex flex-col gap-2 text-sm text-neutral-600">
                <Link href="/opportunities" className="hover:text-neutral-900 transition">
                  Opportunities
                </Link>
                <Link href="/post-a-job" className="hover:text-neutral-900 transition">
                  Post a job
                </Link>
                <Link href="/pricing" className="hover:text-neutral-900 transition">
                  Pricing
                </Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Company
              </h4>
              <nav className="flex flex-col gap-2 text-sm text-neutral-600">
                <a
                  href="https://outbackfencing.com.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-neutral-900 transition"
                >
                  Outback Fencing
                </a>
                <Link href="/login" className="hover:text-neutral-900 transition">
                  Sign in
                </Link>
              </nav>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-neutral-100">
          <p className="text-xs text-neutral-400">
            &copy; {new Date().getFullYear()} Outback Connections. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
