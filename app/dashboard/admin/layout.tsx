// app/dashboard/admin/layout.tsx
// Shared admin nav across every /dashboard/admin/* page. Server-side gated:
// the nav only renders for is_admin users (each page still gates its own
// content). Makes Import / Claims / Analytics reachable, not URL-only.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ADMIN_LINKS: { href: string; label: string }[] = [
  { href: "/dashboard/admin/flags", label: "Flags" },
  { href: "/dashboard/admin/moderation", label: "Moderation" },
  { href: "/dashboard/admin/claims", label: "Claims" },
  { href: "/dashboard/admin/import", label: "Import" },
  { href: "/dashboard/admin/analytics", label: "Analytics" },
  { href: "/dashboard/admin/lockdown", label: "Lockdown" },
  { href: "/dashboard/admin/duplicate-accounts", label: "Duplicate accounts" },
  { href: "/legal/incidents", label: "Incidents" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  let isAdmin = false;
  if (userData.user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    isAdmin = !!profile?.is_admin;
  }

  return (
    <>
      {isAdmin && (
        <nav className="border-b border-neutral-200 bg-neutral-50">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
            <span className="font-semibold text-neutral-500">Admin</span>
            {ADMIN_LINKS.map((l) => (
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
