import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestTimestamp } from "@/lib/request-time";
import OutreachWorkspace, {
  type OutreachProspect,
  type OutreachScope,
} from "./OutreachWorkspace";

export const metadata = {
  title: "My outreach work — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VIEW = "admin_contractor_outreach";
const DAILY_LIMIT = 15;
const ACTIVE_STATUSES = [
  "not_contacted",
  "attempted",
  "contacted",
  "interested",
  "invite_sent",
  "follow_up",
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

type StaffRow = {
  user_id: string;
  display_name: string | null;
  is_current_user: boolean;
};

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const nowMs = await requestTimestamp();
  const scope = readScope(params.scope);
  const queryText = readText(params.q, 100);
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    const next = `/dashboard/outreach?scope=${scope}`;
    redirect(`/signin?next=${encodeURIComponent(next)}`);
  }

  const { data: canOutreach, error: permissionError } = await supabase.rpc(
    "current_user_can_outreach"
  );
  if (permissionError) {
    return (
      <PageShell>
        <ErrorBox message="The outreach permission check is temporarily unavailable." />
      </PageShell>
    );
  }
  if (!canOutreach) return <OutreachOnly />;

  let rowQuery = supabase
    .from(VIEW)
    .select(
      `business_id, business_name, suburb, postcode, state_code,
       contact_phone, contact_email, website_url, source_platform, source_url,
       contact_source_url, verification_source_url, contact_verified_at,
       claim_status, listing_id, listing_slug, listing_kind, listing_status,
       category_label, outreach_status, assigned_user_id, assigned_name,
       last_contact_method, last_contacted_at, next_follow_up_at, latest_note,
       suppressed_channels, is_suppressed, email_suppressed, phone_suppressed,
       sms_suppressed, whatsapp_suppressed, queue_priority, queue_sort_at, updated_at`
    )
    .in(
      "outreach_status",
      queryText ? [...ACTIVE_STATUSES, "sequence_complete"] : [...ACTIVE_STATUSES]
    );

  rowQuery =
    scope === "mine"
      ? rowQuery.eq("assigned_user_id", userData.user.id)
      : rowQuery.is("assigned_user_id", null);
  if (!queryText) rowQuery = rowQuery.lt("queue_priority", 90);

  const searchPattern = safeLikePattern(queryText);
  if (searchPattern) {
    rowQuery = rowQuery.or(
      `business_name.ilike.%${searchPattern}%,suburb.ilike.%${searchPattern}%,postcode.ilike.%${searchPattern}%`
    );
  }
  rowQuery = rowQuery
    .order("queue_priority", { ascending: true })
    .order("queue_sort_at", { ascending: true, nullsFirst: false })
    .order("business_id", { ascending: true })
    .limit(DAILY_LIMIT);

  const mineCountQuery = supabase
    .from(VIEW)
    .select("business_id", { count: "exact", head: true })
    .in("outreach_status", [...ACTIVE_STATUSES])
    .lt("queue_priority", 90)
    .eq("assigned_user_id", userData.user.id);
  const unassignedCountQuery = supabase
    .from(VIEW)
    .select("business_id", { count: "exact", head: true })
    .in("outreach_status", [...ACTIVE_STATUSES])
    .lt("queue_priority", 90)
    .is("assigned_user_id", null);
  let dueCountQuery = supabase
    .from(VIEW)
    .select("business_id", { count: "exact", head: true })
    .in("outreach_status", [...ACTIVE_STATUSES])
    .lt("queue_priority", 90)
    .lte("next_follow_up_at", new Date(nowMs).toISOString());
  let firstTouchCountQuery = supabase
    .from(VIEW)
    .select("business_id", { count: "exact", head: true })
    .in("outreach_status", [...ACTIVE_STATUSES])
    .lt("queue_priority", 90)
    .is("last_contacted_at", null)
    .is("next_follow_up_at", null);
  if (scope === "mine") {
    dueCountQuery = dueCountQuery.eq("assigned_user_id", userData.user.id);
    firstTouchCountQuery = firstTouchCountQuery.eq(
      "assigned_user_id",
      userData.user.id
    );
  } else {
    dueCountQuery = dueCountQuery.is("assigned_user_id", null);
    firstTouchCountQuery = firstTouchCountQuery.is("assigned_user_id", null);
  }

  const [
    rowResult,
    mineCountResult,
    unassignedCountResult,
    dueCountResult,
    firstTouchCountResult,
    staffResult,
  ] =
    await Promise.all([
      rowQuery,
      mineCountQuery,
      unassignedCountQuery,
      dueCountQuery,
      firstTouchCountQuery,
      supabase.rpc("outreach_list_assignable_staff"),
    ]);

  if (rowResult.error) {
    console.error("[outreach] queue load failed:", rowResult.error.message);
    return (
      <PageShell>
        <ErrorBox message="The outreach queue could not be loaded. Please try again." />
      </PageShell>
    );
  }

  const rows = (rowResult.data ?? []) as OutreachProspect[];
  const staff = (staffResult.data ?? []) as StaffRow[];
  const currentStaff = staff.find((member) => member.is_current_user);
  const displayName =
    currentStaff?.display_name?.trim() ||
    userData.user.email?.split("@")[0] ||
    "Outreach team member";
  const dueNow = dueCountResult.error ? null : dueCountResult.count;
  const readyForFirstTouch = firstTouchCountResult.error
    ? null
    : firstTouchCountResult.count;

  return (
    <PageShell>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-700">
        Work through one contractor at a time. Email drafts open in your own mail
        app and are never sent or recorded until you confirm the outcome here.
      </p>
      <p className="mt-2 text-xs text-neutral-500">
        Signed in as <span className="font-semibold text-neutral-700">{displayName}</span>
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <SummaryCard
          label="In this queue"
          value={
            scope === "mine"
              ? mineCountResult.error
                ? null
                : mineCountResult.count
              : unassignedCountResult.error
                ? null
                : unassignedCountResult.count
          }
        />
        <SummaryCard label="Due now" value={dueNow} tone={(dueNow ?? 0) > 0 ? "amber" : "plain"} />
        <SummaryCard label="First touch" value={readyForFirstTouch} />
      </div>

      <OutreachWorkspace
        rows={rows}
        scope={scope}
        operator={{ userId: userData.user.id, displayName }}
        counts={{
          mine: mineCountResult.error ? null : mineCountResult.count,
          unassigned: unassignedCountResult.error
            ? null
            : unassignedCountResult.count,
        }}
        baseUrl={safeBaseUrl()}
        query={queryText}
        nowMs={nowMs}
      />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-green-800">
            Outreach workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950">
            My work today
          </h1>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-green-800 underline">
          Back to dashboard
        </Link>
      </div>
      {children}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: number | null;
  tone?: "plain" | "amber";
}) {
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm sm:p-4 ${
        tone === "amber"
          ? "border-amber-200 bg-amber-50"
          : "border-neutral-200 bg-white"
      }`}
    >
      <p className="text-2xl font-bold tabular-nums text-neutral-950">
        {value === null ? "—" : value}
      </p>
      <p className="mt-1 text-xs font-medium text-neutral-600">{label}</p>
    </div>
  );
}

function OutreachOnly() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-neutral-950">
        Outreach workspace
      </h1>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <p className="font-semibold">Outreach access is required</p>
        <p className="mt-1">
          Ask the Outback Connections owner to grant outreach-only access to
          this account.
        </p>
      </div>
      <Link href="/dashboard" className="mt-6 inline-block text-sm text-green-800 underline">
        Back to dashboard
      </Link>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
      <p className="font-semibold">Couldn&apos;t open the outreach workspace</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

function readScope(value: string | string[] | undefined): OutreachScope {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "unassigned" ? "unassigned" : "mine";
}

function readText(value: string | string[] | undefined, maxLength: number): string {
  const first = Array.isArray(value) ? value[0] : value;
  return (first || "").trim().slice(0, maxLength);
}

function safeLikePattern(value: string): string {
  return value
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}@+&-]+/gu)
    .filter(Boolean)
    .join("%")
    .slice(0, 120);
}

function safeBaseUrl(): string {
  const fallback = "https://www.outbackconnections.com.au";
  const configured = process.env.NEXT_PUBLIC_BASE_URL || fallback;
  try {
    return new URL(configured).toString();
  } catch {
    return fallback;
  }
}
