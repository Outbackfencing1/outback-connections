import Link from "next/link";
import { requireDirectoryContributor } from "@/lib/directory-access";

// Staff list other people's businesses. A public post form marks the row as
// posted by the business itself (and, for jobs, gives it JobPosting data),
// so warn staff before they use one for a third party. Admins don't see it.
export default async function StaffPostNotice({ kind }: { kind: "job" | "freight" | "sale" }) {
  const access = await requireDirectoryContributor();
  if (!access.ok || access.isAdmin) return null;
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">You&apos;re signed in as staff</p>
      {kind === "sale" ? (
        <p className="mt-1">
          This form is only for things you or Outback Fencing are selling. Never list someone
          else&apos;s stock or gear here: it would show as posted by them.
        </p>
      ) : (
        <p className="mt-1">
          This form publishes the ad as posted by you or Outback Fencing. For another
          business&apos;s {kind === "job" ? "job" : "freight service"}, use{" "}
          <Link href="/dashboard/directory/add" className="underline">
            Add a directory entry
          </Link>{" "}
          so it&apos;s marked unclaimed with where we found it.
        </p>
      )}
    </div>
  );
}
