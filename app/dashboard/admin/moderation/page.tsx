// /dashboard/admin/moderation — full moderation history audit log.
// Admins only. Read-only view of every hide / clear-flags / restore /
// remove action recorded in moderation_actions.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";

export const metadata = {
  title: "Moderation history — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  anonymised_id: string;
  listing_id: string | null;
  listing_title_snapshot: string | null;
  action: string;
  reason: string | null;
  before_status: string | null;
  after_status: string | null;
  created_at: string;
  actor_user_id: string | null;
};

export default async function ModerationHistoryPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/moderation");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Moderation history</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Admins only</p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/dashboard" className="underline">← Back to dashboard</Link>
        </p>
      </div>
    );
  }

  const { data } = await supabase
    .from("moderation_actions")
    .select(`
      id, anonymised_id, listing_id, listing_title_snapshot,
      action, reason, before_status, after_status, created_at, actor_user_id
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows: Row[] = (data ?? []) as Row[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Moderation history</h1>
        <Link
          href="/dashboard/admin/flags"
          className="text-sm underline"
        >
          ← Flag queue
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Last 200 moderation actions. Read-only audit log.
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-700">
          No moderation actions yet.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-neutral-500">{r.anonymised_id}</span>
                <span className="text-xs text-neutral-600">{relativeTime(r.created_at)}</span>
              </div>
              <p className="mt-1 font-medium text-neutral-900">
                {actionLabel(r.action)}
                {r.listing_title_snapshot && (
                  <>
                    : <span className="font-normal">&ldquo;{r.listing_title_snapshot}&rdquo;</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {r.before_status && r.after_status && r.before_status !== r.after_status
                  ? `${r.before_status} → ${r.after_status}`
                  : r.after_status ?? r.before_status ?? "—"}
                {r.reason && ` · ${r.reason}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard" className="underline">← Back to dashboard</Link>
      </p>
    </div>
  );
}

function actionLabel(a: string): string {
  switch (a) {
    case "hide": return "Hidden";
    case "restore": return "Restored";
    case "clear_flags": return "Flags cleared";
    case "close_admin": return "Closed by admin";
    case "restore_after_review": return "Restored after review";
    case "remove_permanently": return "Removed permanently";
    case "no_action": return "No action";
    default: return a;
  }
}
