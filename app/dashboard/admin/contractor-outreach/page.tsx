import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listingHref } from "@/lib/format";
import OutreachRowActions, {
  OUTREACH_STATUSES,
  type OutreachStatus,
} from "./OutreachRowActions";

export const metadata = {
  title: "Contractor outreach — Outback Connections",
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
      `business_name.ilike.%${searchPattern}%,suburb.ilike.%${searchPattern}%,contact_email.ilike.%${searchPattern}%,contact_phone.ilike.%${searchPattern}%`
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

  const [prospectResult, countResult, categoryResult, assigneeResult] =
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
  const assignees = Array.from(
    new Set([
      "Ali",
      ...(assigneeResult.data ?? [])
        .map((row) => row.assigned_name?.trim())
        .filter((value): value is string => !!value),
    ])
  ).sort((a, b) => a.localeCompare(b, "en-AU"));

  return (
    <PageShell>
      <p className="mt-2 max-w-3xl text-sm text-neutral-700">
        Work through Australian fencing contractors, record each contact, and
        schedule the next step. Invitation buttons only copy text or open your
        phone/email app — this page never sends a bulk message.
      </p>

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
          {total.toLocaleString("en-AU")} contractor{total === 1 ? "" : "s"}
          {hasFilters(filters) ? " match these filters" : ""}
        </p>
        <p className="text-xs text-neutral-500">50 per page</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-700">
          No contractors match these filters. Try resetting one or two filters.
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

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Contractor outreach</h1>
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
    ["Total", counts.total, "border-neutral-200"],
    ["Not contacted", counts.not_contacted, "border-slate-200"],
    ["Contacted", counts.contacted, "border-blue-200"],
    ["Interested", counts.interested, "border-emerald-200"],
    ["Invited", counts.invite_sent, "border-violet-200"],
    ["Joined", counts.joined, "border-green-300"],
    ["Follow-ups due", counts.follow_ups_due, "border-amber-300"],
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
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
      className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <FilterInput
          label="Search"
          name="q"
          value={filters.q}
          placeholder="Business, email or phone"
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
        <FilterSelect label="Outreach status" name="status" value={filters.status}>
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
          <option value="claimed">Claimed / joined</option>
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
        <FilterSelect label="Assigned person" name="assigned" value={filters.assigned}>
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
      <table className="min-w-[1250px] w-full divide-y divide-neutral-200 text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
          <tr>
            <th className="px-3 py-2">Business</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Contact</th>
            <th className="px-3 py-2">Profile / source</th>
            <th className="px-3 py-2">Outreach</th>
            <th className="px-3 py-2">Fast actions</th>
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
            const contactBlocked = status === "do_not_contact" || status === "invalid_duplicate";
            const websiteHref = safeHttpUrl(row.website_url);
            const sourceHref = safeHttpUrl(row.source_url);
            return (
              <tr key={row.business_id} className={isDue(row) ? "bg-amber-50/50" : undefined}>
                <td className="max-w-[260px] px-3 py-3">
                  <p className="font-semibold text-neutral-900">{row.business_name}</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    {row.category_label || "Fencing contractor"}
                  </p>
                  {row.latest_note && (
                    <p className="mt-2 line-clamp-3 text-xs text-neutral-600" title={row.latest_note}>
                      <span className="font-medium">Latest note:</span> {row.latest_note}
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
                <td className="min-w-[200px] px-3 py-3 text-xs text-neutral-700">
                  <StatusBadge status={status} />
                  <dl className="mt-2 space-y-1">
                    <div>
                      <dt className="inline text-neutral-500">Assigned: </dt>
                      <dd className="inline font-medium">{row.assigned_name || "Unassigned"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-neutral-500">Last contact: </dt>
                      <dd className="inline">{formatDateTime(row.last_contacted_at)}</dd>
                    </div>
                    <div className={isDue(row) ? "font-semibold text-amber-900" : undefined}>
                      <dt className="inline text-neutral-500">Next: </dt>
                      <dd className="inline">{formatDateTime(row.next_follow_up_at)}</dd>
                    </div>
                  </dl>
                </td>
                <td className="min-w-[330px] px-3 py-3">
                  <OutreachRowActions
                    businessId={row.business_id}
                    businessName={row.business_name}
                    email={row.contact_email}
                    phone={row.contact_phone}
                    invitationUrl={invitationUrl}
                    hasClaimableListing={row.claim_status === "unclaimed"}
                    status={status}
                    assignedTo={row.assigned_to}
                    assignedName={row.assigned_name}
                    nextFollowUpAt={row.next_follow_up_at}
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

function StatusBadge({ status }: { status: OutreachStatus }) {
  const label = OUTREACH_STATUSES.find((item) => item.value === status)?.label || humanise(status);
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
