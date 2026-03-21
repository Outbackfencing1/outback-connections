// components/Footer.tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          {/* Brand */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-[#2D5016] flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">OC</span>
              </div>
              <span className="font-semibold text-sm text-neutral-900">Outback Connections</span>
            </div>
            <p className="text-xs text-neutral-500">
              Built by Outback Fencing &amp; Steel Supplies Pty Ltd &middot; ABN 76 674 671 820
            </p>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-500">
            <Link href="/opportunities" className="hover:text-neutral-900 transition">Marketplace</Link>
            <Link href="/contractor" className="hover:text-neutral-900 transition">Contractors</Link>
            <Link href="/pricing" className="hover:text-neutral-900 transition">Pricing</Link>
            <a
              href="https://outbackfencing.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-900 transition"
            >
              About
            </a>
            <Link href="/post-a-job" className="hover:text-neutral-900 transition">Contact</Link>
          </nav>
        </div>

        <div className="mt-6 pt-4 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-neutral-400">
            &copy; {new Date().getFullYear()} Outback Connections. All rights reserved.
          </p>
          <div className="flex gap-4 text-xs text-neutral-400">
            <span className="hover:text-neutral-600 cursor-pointer transition">Terms</span>
            <span className="hover:text-neutral-600 cursor-pointer transition">Privacy</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
