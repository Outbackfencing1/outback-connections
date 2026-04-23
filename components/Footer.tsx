// components/Footer.tsx
// Interim footer for the Step 1 archive commit. Step 4 replaces this with the
// full marketplace footer (three columns, full nav). Kept minimal until then,
// with COI + ABN preserved per the Phase 1 plan.
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/40">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-neutral-700">
          Outback Connections is run by{" "}
          <strong>Outback Fencing &amp; Steel Supplies Pty Ltd</strong>.
          We disclose this everywhere.
        </p>

        <address className="mt-4 text-sm not-italic text-neutral-700">
          Outback Fencing &amp; Steel Supplies Pty Ltd
          <br />
          ABN 76 674 671 820
          <br />
          76 Astill Drive, Orange NSW 2800
          <br />
          <a
            href="mailto:support@outbackfencingsupplies.com.au"
            className="hover:text-neutral-900"
          >
            support@outbackfencingsupplies.com.au
          </a>
        </address>

        <p className="mt-8 text-xs text-neutral-500">
          &copy; {new Date().getFullYear()} Outback Connections ·{" "}
          <Link href="/" className="underline hover:text-neutral-700">
            Home
          </Link>
        </p>
      </div>
    </footer>
  );
}
