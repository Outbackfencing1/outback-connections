import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listingHref } from "@/lib/format";
import OutreachRowActions from "./OutreachRowActions";
import {
  DARYL_HANDOFF_STATES,
  MARKETING_CONSENT_OPTIONS,
  OUTREACH_STATUSES,
  parseSalesMetaFromNote,
  type OutreachStatus,
} from "@/lib/outreach-statuses";

export const metadata = {
  title: "Rural hub directory & relationship queue — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VIEW = "admin_contractor_outreach";
const PAGE_SIZE = 50;
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;
const CONTACT_FILTERS = ["contacted", "not_contacted", "due"] as const;
const CLAIM_FILTERS = ["claimed", "unclaimed"] as const;
const BOOLEAN_FILTERS = ["yes", "no"] as const;
const SORTS = ["follow_up", "not_contacted", "recent", "name"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

type ProspectRow = {
  business_id: string;
  business_name: string;
  suburb: string | null;
  postcode: string | null;
  state_code: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website_url: string | null;
  source_platform: string | null;
  source_url: string | null;
  claim_status: string;
  listing_id: string | null;
  listing_slug: string | null;
  listing_kind: string | null;
  listing_status: string | null;
  category_id: string | null;
  category_slug: string | null;
  category_label: string | null;
  outreach_status: OutreachStatus | null;
  assigned_to: string | null;
  assigned_name: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  latest_note: string | null;
  updated_at: string | null;
};

type Category = {
  id: string;
  slug: string;
  label: string;
  pillar: string;
};

type Counts = {
  total: number | null;
  not_contacted: number | null;
  contacted: number | null;
  interested: number | null;
  invite_sent: number | null;
  joined: number | null;
  follow_ups_due: number | null;
};

type OpenEnquirySummary = {
  id: string;
  name: string;
  status: string;
  postcode: string | null;
  message: string;
  created_at: string;
};

export default async function ContractorOutreachPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/signin?next=/dashboard/admin/contractor-outreach");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!(profile?.is_admin || profile?.is_staff)) {
    return <AdminOnly />;
  }

  const filters = readFilters(resolvedSearchParams);
  let query = supabase
    .from(VIEW)
    .select(
      `business_id, business_name, suburb, postcode, state_code,
       contact_phone, contact_email, website_url, source_platform, source_url,
       claim_status, listing_id, listing_slug, listing_kind, listing_status,
       category_id, category_slug, category_label,
       outreach_status, assigned_to, assigned_name, last_contacted_at, next_follow_up_at,
       latest_note, updated_at`,
      { count: "exact" }
    );

  const searchPattern = safeLikePattern(filters.q);
  if (searchPattern) {
    query = query.or(
      `business_name.ilike.%${searchPattern}%,suburb.ilike.%${searchPattern}%,contact_email.ilike.%${searchPattern}%,contact_phone.ilike.%${searchPattern}%,latest_note.ilike.%${searchPattern}%`
    );
  }
  const townPattern = safeLikePattern(filters.town);
  if (townPattern) query = query.ilike("suburb", `%${townPattern}%`);
  if (filters.state) query = query.eq("state_code", filters.state);
  if (filters.status) query = query.eq("outreach_status", filters.status);
  if (filters.contacted === "contacted") {
    query = query.not("last_contacted_at", "is", null);
  } else if (filters.contacted === "not_contacted") {
    query = query.is("last_contacted_at", null);
  } else if (filters.contacted === "due") {
    query = query.lte("next_follow_up_at", new Date().toISOString());
  }
  if (filters.claim === "unclaimed") {
    query = query.eq("claim_status", "unclaimed");
  } else if (filters.claim === "claimed") {
    query = query.neq("claim_status", "unclaimed");
  }
  if (filters.hasPhone === "yes") query = query.not("contact_phone", "is", null);
  if (filters.hasPhone === "no") query = query.is("contact_phone", null);
  if (filters.hasEmail === "yes") query = query.not("contact_email", "is", null);
  if (filters.hasEmail === "no") query = query.is("contact_email", null);
  if (filters.category) query = query.eq("category_slug", filters.category);
  if (filters.assigned === "__unassigned") {
    query = query.is("assigned_to", null);
  } else if (filters.assigned) {
    query = query.eq("assigned_to", filters.assigned);
  }

  if (filters.sort === "not_contacted") {
    query = query
      .order("last_contacted_at", { ascending: true, nullsFirst: true })
      .order("business_name", { ascending: true });
  } else if (filters.sort === "recent") {
    query = query
      .order("last_contacted_at", { ascending: false, nullsFirst: false })
      .order("business_name", { ascending: true });
  } else if (filters.sort === "name") {
    query = query.order("business_name", { ascending: true });
  } else {
    query = query
      .order("next_follow_up_at", { ascending: true, nullsFirst: false })
      .order("business_name", { ascending: true });
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const [prospectResult, countResult, categoryResult, assigneeResult, enquiryResult] =
    await Promise.all([
      query,
      supabase.rpc("admin_contractor_outreach_counts"),
      supabase
        .from("categories")
        .select("id, slug, label, pillar")
        .eq("active", true)
        .order("pillar")
        .order("sort_order"),
      supabase
        .from(VIEW)
        .select("assigned_to, assigned_name")
        .not("assigned_name", "is", null)
        .limit(1000),
      supabase
        .from("listing_enquiries")
        .select("id, name, status, postcode, message, created_at")
        .in("status", ["new", "forwarded"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  if (prospectResult.error) {
    return (
      <PageShell>
        <ErrorBox
          message={`Couldn't load contractor prospects: ${prospectResult.error.message}`}
        />
      </PageShell>
    );
  }

  const rows = (prospectResult.data ?? []) as ProspectRow[];
  const total = prospectResult.count ?? 0;
  const counts = normaliseCounts(countResult.data);
  const categories = (categoryResult.data ?? []) as Category[];
  const openEnquiries = (enquiryResult.data ?? []) as OpenEnquirySummary[];
  const assignees = Array.from(
    new Set([
      "Ali",
      "Daryl",
      "Joshua",
      ...(assigneeResult.data ?? [])
        .map((row) => row.assigned_name?.trim())
        .filter((value): value is string => !!value),
    ])
  ).sort((a, b) => a.localeCompare(b, "en-AU"));

  return (
    <PageShell>
      <p className="mt-2 max-w-4xl text-sm text-neutral-700">
        <strong>Rural Hub Provider &amp; Claim Support Workspace.</strong> Outback Connections is a free hub for all rural work, jobs, and services. Use this table to help providers across all 24 service and 8 freight categories claim or refresh their listings, and hand genuine Outback Fencing product enquiries once to <strong>Daryl</strong>. Directory inclusion and profile claims are completely separate from product sales.
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
        <Link
          href="/dashboard/admin/hub-queue"
          className="rounded-lg bg-green-800 px-3 py-1.5 text-white hover:bg-green-950"
        >
          ★ Open Ali&apos;s Daily Rural Hub Growth Queue (A01–A06) →
        </Link>
        <Link href="/dashboard/admin/enquiries" className="self-center text-green-800 underline hover:text-green-950">
          Enquiries ({enquiryResult.error ? "read error" : `${openEnquiries.length} open`}) →
        </Link>
        <Link href="/dashboard/directory/add" className="self-center text-green-800 underline hover:text-green-950">
          + Add directory entry →
        </Link>
        <Link href="/dashboard/admin/daily-report" className="self-center text-green-800 underline hover:text-green-950">
          Daily operator report →
        </Link>
        <Link href="/dashboard/admin/flags" className="self-center text-green-800 underline hover:text-green-950">
          Verification &amp; flag queue →
        </Link>
      </div>

      <PriorityFollowUpBanner
        openEnquiries={openEnquiries}
        enquiryReadError={enquiryResult.error?.message ?? null}
        counts={counts}
      />

      <QuickPriorityTabs />

      {countResult.error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Summary counts are temporarily unavailable: {countResult.error.message}
        </div>
      )}

      <CountCards counts={counts} />
      <Filters
        filters={filters}
        categories={categories}
        assignees={assignees}
      />

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-900">
          {total.toLocaleString("en-AU")} business{total === 1 ? "" : "es"}
          {hasFilters(filters) ? " match these filters" : ""}
        </p>
        <p className="text-xs text-neutral-500">50 per page</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-700">
          No businesses match these filters. Try resetting one or two filters.
        </div>
      ) : (
        <ProspectTable rows={rows} assignees={assignees} />
      )}

      <Pagination
        page={filters.page}
        total={total}
        searchParams={resolvedSearchParams}
      />
    </PageShell>
  );
}

function PriorityFollowUpBanner({
  openEnquiries,
  enquiryReadError,
  counts,
}: {
  openEnquiries: OpenEnquirySummary[];
  enquiryReadError: string | null;
  counts: Counts;
}) {
  const tommyMatch = openEnquiries.find(
    (e) =>
      /brettschneider|tommy/i.test(e.name) ||
      /brettschneider|pool/i.test(e.message)
  );

  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold uppercase tracking-wide text-amber-900">
            Priority 1 · Urgent Enquiries, Corrections &amp; Removal Requests
          </p>
          <Link
            href="/dashboard/admin/enquiries?status=open"
            className="rounded bg-amber-900 px-2.5 py-1 font-semibold text-white hover:bg-amber-950"
          >
            Enquiry Queue ({enquiryReadError ? "Unavailable" : openEnquiries.length}) →
          </Link>
        </div>
        {enquiryReadError && (
          <p className="mt-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-900">
            ⚠ Couldn&apos;t read open enquiries ({enquiryReadError}). Do not treat this as zero open enquiries.
          </p>
        )}
        <div className="mt-2.5 rounded-lg border border-amber-200 bg-white p-3">
          <p className="font-semibold text-neutral-900">
            Open Customer Request Check: Tommy Brettschneider (&ldquo;pools to buy&rdquo;)
          </p>
          {tommyMatch ? (
            <p className="mt-1 text-neutral-700">
              Found in open enquiries ({tommyMatch.status}): &ldquo;{tommyMatch.message.slice(0, 140)}&rdquo; —{" "}
              <Link href="/dashboard/admin/enquiries?status=open" className="font-semibold text-green-800 underline">
                Action in Enquiries →
              </Link>
            </p>
          ) : (
            <p className="mt-1 text-neutral-700">
              <strong>Preserve original request wording:</strong> Tommy Brettschneider asked for a link to <strong>pools to buy</strong> (not pool fencing). Do not rewrite his request as pool fencing or forward it blindly to a fencing contractor. Clarify the intended product first and route to Daryl/Joshua if he needs stock tanks/water troughs or rural supplies.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-950">
        <p className="font-bold uppercase tracking-wide text-emerald-900">
          Hub Separation · Directory Claims vs. Daryl Product Handoffs
        </p>
        <ul className="mt-2 space-y-1.5 text-neutral-800">
          <li>
            • <strong>Three Independent Decisions:</strong> (1) Does the business/job belong in the rural hub? (2) Is evidence sufficient? (3) Is there a separate Outback product enquiry? A &ldquo;no&rdquo; to #3 never excludes a useful rural service.
          </li>
          <li>
            • <strong>Product Handoffs to Daryl:</strong>{" "}
            <Link
              href="/dashboard/admin/contractor-outreach?status=interested&sort=follow_up"
              className="font-semibold text-green-800 underline"
            >
              {(counts.interested ?? 0).toLocaleString("en-AU")} active interested / enquiry row(s)
            </Link>{" "}
            — click &ldquo;Hand Product Enquiry to Daryl&rdquo; once; Daryl owns sales follow-up so two people never chase the same customer.
          </li>
          <li>
            • <strong>Due Follow-ups:</strong>{" "}
            <Link
              href="/dashboard/admin/contractor-outreach?contacted=due&sort=follow_up"
              className="font-semibold text-green-800 underline"
            >
              {(counts.follow_ups_due ?? 0).toLocaleString("en-AU")} due
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

function QuickPriorityTabs() {
  const tabs: Array<{ label: string; href: string; tone: string }> = [
    {
      label: "All Directory Records",
      href: "/dashboard/admin/contractor-outreach",
      tone: "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50",
    },
    {
      label: "1. Follow-ups Due Today",
      href: "/dashboard/admin/contractor-outreach?contacted=due&sort=follow_up",
      tone: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
    },
    {
      label: "2. Non-Fencing Services (Under-Covered Categories)",
      href: "/dashboard/admin/contractor-outreach?category=water-bores&sort=not_contacted",
      tone: "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100",
    },
    {
      label: "3. Claim Support / Interested",
      href: "/dashboard/admin/contractor-outreach?status=interested&sort=follow_up",
      tone: "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
    },
    {
      label: "4. Claimed Profiles (Joined)",
      href: "/dashboard/admin/contractor-outreach?status=joined&sort=recent",
      tone: "border-green-300 bg-green-50 text-green-900 hover:bg-green-100",
    },
  ];
  return (
    <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          className={`rounded-lg border px-3 py-1.5 ${tab.tone}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Rural hub directory &amp; relationship queue</h1>
        <Link href="/dashboard" className="text-sm underline">
          ← Dashboard
        </Link>
      </div>
      {children}
    </div>
  );
}

function AdminOnly() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Contractor outreach</h1>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">Admins only</p>
      </div>
      <p className="mt-8 text-sm">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
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

function CountCards({ counts }: { counts: Counts }) {
  const cards: Array<[string, number | null, string]> = [
    ["Total in Directory", counts.total, "border-neutral-200"],
    ["Not Contacted", counts.not_contacted, "border-slate-200"],
    ["Contacted", counts.contacted, "border-blue-200"],
    ["Interested / Enquiry", counts.interested, "border-emerald-200"],
    ["Claim Invite Sent", counts.invite_sent, "border-violet-200"],
    ["Profile Claimed", counts.joined, "border-green-300"],
    ["Follow-ups Due", counts.follow_ups_due, "border-amber-300"],
  ];
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {cards.map(([label, value, border]) => (
        <div key={label} className={`rounded-xl border bg-white p-3 ${border}`}>
          <p className="text-2xl font-bold tabular-nums text-neutral-900">
            {value === null ? "—" : value.toLocaleString("en-AU")}
          </p>
          <p className="mt-1 text-xs text-neutral-600">{label}</p>
        </div>
      ))}
    </div>
  );
}

type FiltersValue = ReturnType<typeof readFilters>;

function Filters({
  filters,
  categories,
  assignees,
}: {
  filters: FiltersValue;
  categories: Category[];
  assignees: string[];
}) {
  return (
    <form
      action="/dashboard/admin/contractor-outreach"
      method="get"
      className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <FilterInput
          label="Search (business, note)"
          name="q"
          value={filters.q}
          placeholder="Business or note"
        />
        <FilterInput
          label="Town / suburb"
          name="town"
          value={filters.town}
          placeholder="Orange"
        />
        <FilterSelect label="State" name="state" value={filters.state}>
          <option value="">All states</option>
          {AU_STATES.map((state) => (
            <option key={state} value={state}>{state}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Directory status" name="status" value={filters.status}>
          <option value="">All statuses</option>
          {OUTREACH_STATUSES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Contacted" name="contacted" value={filters.contacted}>
          <option value="">Any</option>
          <option value="not_contacted">Not contacted</option>
          <option value="contacted">Contacted</option>
          <option value="due">Follow-up due</option>
        </FilterSelect>
        <FilterSelect label="Claimed" name="claim" value={filters.claim}>
          <option value="">Any</option>
          <option value="unclaimed">Unclaimed</option>
          <option value="claimed">Claimed by owner</option>
        </FilterSelect>
        <FilterSelect label="Has phone" name="phone" value={filters.hasPhone}>
          <option value="">Any</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </FilterSelect>
        <FilterSelect label="Has email" name="email" value={filters.hasEmail}>
          <option value="">Any</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </FilterSelect>
        <FilterSelect label="Category / service" name="category" value={filters.category}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.label}{category.pillar === "services" ? "" : ` (${category.pillar})`}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Owner / assigned" name="assigned" value={filters.assigned}>
          <option value="">Anyone</option>
          <option value="__unassigned">Unassigned</option>
          {assignees.map((assignee) => (
            <option key={assignee} value={assignee}>{assignee}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Sort" name="sort" value={filters.sort}>
          <option value="follow_up">Follow-up first</option>
          <option value="not_contacted">Not contacted first</option>
          <option value="recent">Recently contacted</option>
          <option value="name">Business name</option>
        </FilterSelect>
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm">
        <button
          type="submit"
          className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-800"
        >
          Apply filters
        </button>
        <Link href="/dashboard/admin/contractor-outreach" className="text-neutral-700 underline">
          Reset
        </Link>
      </div>
    </form>
  );
}

function FilterInput({
  label,
  name,
  value,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-700">{label}</span>
      <input
        name={name}
        defaultValue={value}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
      />
    </label>
  );
}

function FilterSelect({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-700">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
      >
        {children}
      </select>
    </label>
  );
}

function ProspectTable({ rows, assignees }: { rows: ProspectRow[]; assignees: string[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="min-w-[1320px] w-full divide-y divide-neutral-200 text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
          <tr>
            <th className="px-3 py-2">Business &amp; Hub Role</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Contact &amp; Channel Eligibility</th>
            <th className="px-3 py-2">Profile / Source</th>
            <th className="px-3 py-2">Task State, Directory &amp; Daryl Handoff</th>
            <th className="px-3 py-2">Fast Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 align-top">
          {rows.map((row) => {
            const publicPath = row.listing_slug && row.listing_status === "active"
              ? listingHref(row.listing_kind || "service_offering", row.listing_slug)
              : null;
            const publicUrl = publicPath ? `${BASE_URL}${publicPath}` : null;
            const invitationUrl =
              row.claim_status === "unclaimed"
                ? `${BASE_URL}/claim/${row.business_id}`
                : publicUrl || `${BASE_URL}/dashboard/listings`;
            const status = row.outreach_status || "not_contacted";
            const salesMeta = parseSalesMetaFromNote(row.latest_note, status);
            const consentObj = MARKETING_CONSENT_OPTIONS.find(
              (c) => c.value === salesMeta.consent
            );
            const handoffObj = DARYL_HANDOFF_STATES.find(
              (h) => h.value === salesMeta.darylHandoff
            );
            const contactBlocked =
              salesMeta.consent === "do_not_contact" ||
              status === "do_not_contact" ||
              status === "invalid_duplicate";
            const websiteHref = safeHttpUrl(row.website_url);
            const sourceHref = safeHttpUrl(row.source_url);
            return (
              <tr
                key={row.business_id}
                className={
                  salesMeta.needsJoshua
                    ? "bg-emerald-50/40"
                    : isDue(row)
                      ? "bg-amber-50/50"
                      : undefined
                }
              >
                <td className="max-w-[280px] px-3 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold text-neutral-900">{row.business_name}</p>
                    {salesMeta.darylHandoff !== "none" && (
                      <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-950">
                        {handoffObj?.label ?? salesMeta.darylHandoff}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    {row.category_label || "Rural service"}
                  </p>
                  {salesMeta.customerFit && (
                    <p className="mt-1 text-xs font-medium text-emerald-900">
                      Role: {salesMeta.customerFit}
                    </p>
                  )}
                  {salesMeta.relevantProduct &&
                    salesMeta.relevantProduct !== "None — Free Rural Hub Listing Only" && (
                      <p className="mt-0.5 text-xs text-neutral-700">
                        Product note: {salesMeta.relevantProduct}
                      </p>
                    )}
                  {salesMeta.cleanNote && (
                    <p className="mt-2 line-clamp-3 text-xs text-neutral-600" title={salesMeta.cleanNote}>
                      <span className="font-medium">Note:</span> {salesMeta.cleanNote}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-neutral-700">
                  <p>{row.suburb || "—"}</p>
                  <p className="text-xs text-neutral-500">
                    {[row.state_code, row.postcode].filter(Boolean).join(" ") || "Location missing"}
                  </p>
                </td>
                <td className="max-w-[250px] px-3 py-3 text-xs">
                  <div className="mb-1.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        salesMeta.consent === "opted_in_marketing"
                          ? "bg-green-100 text-green-800"
                          : salesMeta.consent === "do_not_contact"
                            ? "bg-red-100 text-red-800"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {consentObj?.shortBadge ?? "Directory Only"}
                    </span>
                  </div>
                  {row.contact_phone ? (
                    <p>
                      {contactBlocked ? (
                        <span className="font-medium text-neutral-600">{row.contact_phone}</span>
                      ) : (
                        <a href={`tel:${phoneHref(row.contact_phone)}`} className="font-medium text-green-800 underline">
                          {row.contact_phone}
                        </a>
                      )}
                    </p>
                  ) : (
                    <p className="text-neutral-400">No phone</p>
                  )}
                  {row.contact_email ? (
                    <p className="mt-1 break-all">
                      {contactBlocked ? (
                        <span className="text-neutral-600">{row.contact_email}</span>
                      ) : (
                        <a href={`mailto:${row.contact_email}`} className="text-green-800 underline">
                          {row.contact_email}
                        </a>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-neutral-400">No email</p>
                  )}
                  {websiteHref && (
                    <p className="mt-1">
                      <a href={websiteHref} target="_blank" rel="noreferrer" className="text-green-800 underline">
                        Website ↗
                      </a>
                    </p>
                  )}
                </td>
                <td className="max-w-[210px] px-3 py-3 text-xs text-neutral-700">
                  <div className="flex flex-wrap gap-1">
                    <ClaimBadge claimStatus={row.claim_status} />
                    {row.listing_status && (
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-700">
                        listing {humanise(row.listing_status)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {publicPath && (
                      <p>
                        <Link href={publicPath} target="_blank" rel="noreferrer" className="font-medium text-green-800 underline">
                          Open public listing ↗
                        </Link>
                      </p>
                    )}
                    {sourceHref && (
                      <p>
                        <a href={sourceHref} target="_blank" rel="noreferrer" className="text-neutral-700 underline">
                          {prettySource(row.source_platform)} source ↗
                        </a>
                      </p>
                    )}
                  </div>
                </td>
                <td className="min-w-[210px] px-3 py-3 text-xs text-neutral-700">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
                      Task: {salesMeta.taskState}
                    </span>
                    <StatusBadge status={status} stageLabel={salesMeta.stage} />
                  </div>
                  <dl className="mt-2 space-y-1">
                    <div>
                      <dt className="inline text-neutral-500">Owner: </dt>
                      <dd className="inline font-medium">{row.assigned_name || "Ali"}</dd>
                    </div>
                    {salesMeta.darylHandoff !== "none" && (
                      <div>
                        <dt className="inline text-neutral-500">Sales handoff: </dt>
                        <dd className="inline font-semibold text-amber-900">
                          {handoffObj?.label ?? salesMeta.darylHandoff}
                        </dd>
                      </div>
                    )}
                    {salesMeta.nextAction && (
                      <div>
                        <dt className="inline text-neutral-500">Next action: </dt>
                        <dd className="inline font-semibold text-neutral-900">{salesMeta.nextAction}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline text-neutral-500">Last contact: </dt>
                      <dd className="inline">{formatDateTime(row.last_contacted_at)}</dd>
                    </div>
                    <div className={isDue(row) ? "font-semibold text-amber-900" : undefined}>
                      <dt className="inline text-neutral-500">Due date: </dt>
                      <dd className="inline">{formatDateTime(row.next_follow_up_at)}</dd>
                    </div>
                  </dl>
                </td>
                <td className="min-w-[340px] px-3 py-3">
                  <OutreachRowActions
                    businessId={row.business_id}
                    businessName={row.business_name}
                    suburb={row.suburb}
                    email={row.contact_email}
                    phone={row.contact_phone}
                    invitationUrl={invitationUrl}
                    hasClaimableListing={row.claim_status === "unclaimed"}
                    status={status}
                    assignedTo={row.assigned_to}
                    assignedName={row.assigned_name}
                    nextFollowUpAt={row.next_follow_up_at}
                    latestNote={row.latest_note}
                    assignees={assignees}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClaimBadge({ claimStatus }: { claimStatus: string }) {
  const claimed = claimStatus !== "unclaimed";
  return (
    <span className={`rounded px-2 py-0.5 font-medium ${claimed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
      {humanise(claimStatus)}
    </span>
  );
}

function StatusBadge({ status, stageLabel }: { status: OutreachStatus; stageLabel?: string | null }) {
  const label = stageLabel || OUTREACH_STATUSES.find((item) => item.value === status)?.label || humanise(status);
  const colour =
    status === "joined"
      ? "bg-green-100 text-green-800"
      : status === "interested"
        ? "bg-emerald-100 text-emerald-800"
        : status === "invite_sent"
          ? "bg-violet-100 text-violet-800"
          : status === "follow_up"
            ? "bg-amber-100 text-amber-900"
            : status === "do_not_contact" || status === "not_interested"
              ? "bg-red-50 text-red-800"
              : "bg-neutral-100 text-neutral-800";
  return <span className={`inline-block rounded px-2 py-0.5 font-medium ${colour}`}>{label}</span>;
}

function Pagination({
  page,
  total,
  searchParams,
}: {
  page: number;
  total: number;
  searchParams: SearchParams;
}) {
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (lastPage <= 1) return null;
  const href = (target: number) => {
    const qs = new URLSearchParams();
    for (const [key, raw] of Object.entries(searchParams)) {
      if (key === "page") continue;
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value) qs.set(key, value);
    }
    if (target > 1) qs.set("page", String(target));
    const suffix = qs.toString();
    return `/dashboard/admin/contractor-outreach${suffix ? `?${suffix}` : ""}`;
  };
  return (
    <nav aria-label="Contractor pages" className="mt-6 flex items-center justify-between border-t border-neutral-200 pt-4 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-50">
          ← Previous
        </Link>
      ) : <span />}
      <span className="text-neutral-600">Page {page} of {lastPage}</span>
      {page < lastPage ? (
        <Link href={href(page + 1)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-50">
          Next →
        </Link>
      ) : <span />}
    </nav>
  );
}

function readFilters(searchParams: SearchParams) {
  const value = (key: string) => {
    const raw = searchParams[key];
    return (Array.isArray(raw) ? raw[0] : raw || "").trim().slice(0, 120);
  };
  const stateRaw = value("state").toUpperCase();
  const statusRaw = value("status") as OutreachStatus;
  const contactedRaw = value("contacted");
  const claimRaw = value("claim");
  const phoneRaw = value("phone");
  const emailRaw = value("email");
  const sortRaw = value("sort");
  return {
    q: value("q"),
    town: value("town"),
    state: AU_STATES.includes(stateRaw as (typeof AU_STATES)[number]) ? stateRaw : "",
    status: OUTREACH_STATUSES.some((item) => item.value === statusRaw) ? statusRaw : "",
    contacted: CONTACT_FILTERS.includes(contactedRaw as (typeof CONTACT_FILTERS)[number]) ? contactedRaw : "",
    claim: CLAIM_FILTERS.includes(claimRaw as (typeof CLAIM_FILTERS)[number]) ? claimRaw : "",
    hasPhone: BOOLEAN_FILTERS.includes(phoneRaw as (typeof BOOLEAN_FILTERS)[number]) ? phoneRaw : "",
    hasEmail: BOOLEAN_FILTERS.includes(emailRaw as (typeof BOOLEAN_FILTERS)[number]) ? emailRaw : "",
    category: value("category"),
    assigned: value("assigned"),
    sort: SORTS.includes(sortRaw as (typeof SORTS)[number]) ? sortRaw : "follow_up",
    page: Math.max(1, Number.parseInt(value("page") || "1", 10) || 1),
  };
}

function hasFilters(filters: FiltersValue): boolean {
  return !!(
    filters.q || filters.town || filters.state || filters.status || filters.contacted ||
    filters.claim || filters.hasPhone || filters.hasEmail || filters.category || filters.assigned
  );
}

function safeLikePattern(value: string): string {
  return value
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}@+&-]+/gu)
    .filter(Boolean)
    .join("%")
    .slice(0, 120);
}

function normaliseCounts(raw: unknown): Counts {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const read = (...keys: string[]): number | null => {
    for (const key of keys) {
      const candidate = obj[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
      if (typeof candidate === "string" && /^\d+$/.test(candidate)) return Number(candidate);
    }
    return null;
  };
  return {
    total: read("total", "total_fencing_contractors"),
    not_contacted: read("not_contacted"),
    contacted: read("contacted"),
    interested: read("interested"),
    invite_sent: read("invite_sent", "invited"),
    joined: read("joined"),
    follow_ups_due: read("follow_ups_due", "followups_due", "due"),
  };
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(date);
}

function isDue(row: ProspectRow): boolean {
  if (!row.next_follow_up_at) return false;
  if (["joined", "not_interested", "invalid_duplicate", "do_not_contact"].includes(row.outreach_status || "")) {
    return false;
  }
  return new Date(row.next_follow_up_at).getTime() <= Date.now();
}

function humanise(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function prettySource(value: string | null): string {
  if (!value) return "Original";
  if (value === "google_maps") return "Google Maps";
  return humanise(value);
}

function phoneHref(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
