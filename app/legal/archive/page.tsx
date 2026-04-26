import Link from "next/link";

export const metadata = {
  title: "Legal documents archive — Outback Connections",
  description:
    "Frozen snapshots of every public legal document we've shipped. Each version is preserved so you can verify the wording you agreed to.",
};

const VERSIONS: Array<{
  kind: "Privacy notice" | "Terms" | "Acceptable use" | "Cookies notice";
  version: string;
  effective: string;
  archivePath: string;
  isCurrent: boolean;
}> = [
  {
    kind: "Privacy notice",
    version: "v3-2026-04-25-app-compliant-draft",
    effective: "25 April 2026",
    archivePath: "docs/legal-archive/privacy-v3-2026-04-25-app-compliant-draft.md",
    isCurrent: true,
  },
  {
    kind: "Terms",
    version: "v4-2026-04-26-legal-hardening-draft",
    effective: "26 April 2026",
    archivePath: "docs/legal-archive/terms-v4-2026-04-26-legal-hardening-draft.md",
    isCurrent: true,
  },
  {
    kind: "Terms",
    version: "v3-2026-04-25-defamation-hardened-draft",
    effective: "25 April 2026",
    archivePath: "docs/legal-archive/terms-v3-2026-04-25-defamation-hardened-draft.md",
    isCurrent: false,
  },
  {
    kind: "Acceptable use",
    version: "v4-2026-04-26-legal-hardening-draft",
    effective: "26 April 2026",
    archivePath: "docs/legal-archive/acceptable-use-v4-2026-04-26-legal-hardening-draft.md",
    isCurrent: true,
  },
  {
    kind: "Cookies notice",
    version: "v3-2026-04-25-marketplace-draft",
    effective: "25 April 2026",
    archivePath: "docs/legal-archive/cookies-v3-2026-04-25-marketplace-draft.md",
    isCurrent: true,
  },
];

const REPO_BASE =
  "https://github.com/Outbackfencing1/outback-connections/blob/main/";

export default function LegalArchivePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm">
        <Link href="/" className="text-neutral-600 underline">
          ← Home
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        Legal documents archive
      </h1>
      <p className="mt-2 max-w-prose text-sm text-neutral-700">
        Every published version of our legal documents is preserved here.
        If you signed up under an older version, that text is still
        binding for the period you used the service under it. Each entry
        below links to the frozen markdown snapshot in our public source
        repository.
      </p>

      <ul className="mt-8 space-y-3">
        {VERSIONS.map((v) => (
          <li
            key={v.archivePath}
            className="rounded-xl border border-neutral-200 bg-white p-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-semibold text-neutral-900">{v.kind}</p>
              {v.isCurrent && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  Current
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-xs text-neutral-500">{v.version}</p>
            <p className="mt-1 text-xs text-neutral-700">
              Effective {v.effective}
            </p>
            <p className="mt-2 text-sm">
              <a
                href={`${REPO_BASE}${v.archivePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View frozen snapshot →
              </a>
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-neutral-500">
        Snapshots are stored at{" "}
        <code>docs/legal-archive/</code> in our public source repository.
        The full git history is the authoritative record. The
        <code> policy_versions</code> table in our database pins each
        signup, listing, and consent record to a specific version.
      </p>

      <p className="mt-6 text-sm">
        Live pages:{" "}
        <Link href="/privacy" className="underline">
          Privacy notice
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/acceptable-use" className="underline">
          Acceptable use
        </Link>{" "}
        ·{" "}
        <Link href="/cookies" className="underline">
          Cookies
        </Link>
      </p>
    </div>
  );
}
