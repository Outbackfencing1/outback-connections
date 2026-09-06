// app/dashboard/admin/layout.tsx
// Shared admin nav across every /dashboard/admin/* page. Server-side gated:
// the nav only renders for is_admin users (each page still gates its own
// content). Makes Import / Claims / Analytics reachable, not URL-only.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// staff: true = visible to staff as well as admins.
const ADMIN_LINKS: { href: string; label: string; staff: boolean }[] = [
  { href: "/dashboard/admin/contractor-outreach", label: "Contractor outreach", staff: true },
  { href: "/dashboard/admin/enquiries", label: "Enquiries", staff: true },
  { href: "/dashboard/directory/add", label: "Add directory entry", staff: true },
  { href: "/dashboard/admin/import", label: "Import", staff: true },
  { href: "/dashboard/admin/analytics", label: "Analytics", staff: true },
  { href: "/dashboard/admin/demand", label: "Demand by region", staff: true },
  { href: "/dashboard/admin/sales-upload", label: "Sales upload", staff: true },
  { href: "/dashboard/admin/claims", label: "Claims", staff: false },
  { href: "/dashboard/admin/flags", label: "Flags", staff: false },
  { href: "/dashboard/admin/moderation", label: "Moderation", staff: false },
  { href: "/dashboard/admin/lockdown", label: "Lockdown", staff: false },
  { href: "/dashboard/admin/duplicate-accounts", label: "Duplicate accounts", staff: false },
  { href: "/legal/incidents", label: "Incidents", staff: false },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  let isAdmin = false;
  let isStaff = false;
  if (userData.user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin, is_staff")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    isAdmin = !!profile?.is_admin;
    isStaff = isAdmin || !!profile?.is_staff;
  }
  const links = ADMIN_LINKS.filter((l) => isAdmin || l.staff);

  return (
    <>
      {isStaff && (
        <nav className="border-b border-neutral-200 bg-neutral-50">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
            <span className="font-semibold text-neutral-500">{isAdmin ? "Admin" : "Staff"}</span>
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-neutral-700 underline-offset-2 hover:text-green-800 hover:underline"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
      {children}
    </>
  );
}
