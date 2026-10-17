import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ROLE_TAGS,
  availabilityStatusInfo,
  formatAbn,
  insuranceBadgeLabel,
  isValidRoleTag,
  roleTagLabel,
  trustTagLabel,
} from "@/lib/trust";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trusted People, Contractors & Vendors — Outback Connections",
  description:
    "Browse verified rural contractors, truck drivers, header operators, farmers, and livestock & hay vendors with ABN verification and community vouches.",
};

type TrustedProfileItem = {
  profile_id: string;
  user_id: string | null;
  business_id: string | null;
  name: string;
  display_name: string | null;
  trading_name: string | null;
  bio: string | null;
  postcode: string | null;
  state: string | null;
  member_since: string | null;
  email_verified: boolean;
  abn_verified: boolean;
  abn: string | null;
  is_claimed_business: boolean;
  insurances_held: string[];
  role_tags: string[];
  years_in_district: number | null;
  availability_status?: string | null;
  outback_verified?: boolean;
  active_listings_count: number;
  completed_deals_count: number;
  review_count: number;
  avg_rating: number | null;
  recommend_pct: number | null;
  top_tags: Array<{ tag: string; count: number }>;
};

export default async function TrustedProfilesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const roleRaw = typeof sp.role === "string" ? sp.role.trim() : "";
  const role = isValidRoleTag(roleRaw) ? roleRaw : "";
  const postcodeRaw = typeof sp.postcode === "string" ? sp.postcode.trim() : "";
  const postcode = /^\d{4}$/.test(postcodeRaw) ? postcodeRaw : "";
  const abnOnly = sp.abn === "1";

  const supabase = createClient();

  const { data: rpcData } = await supabase.rpc("list_trusted_profiles", {
    p_role: role || null,
    p_postcode: postcode || null,
    p_abn_only: abnOnly,
    p_limit: 48,
  });

  const memberProfiles: TrustedProfileItem[] = Array.isArray(rpcData)
    ? (rpcData as TrustedProfileItem[])
    : [];

  // Also fetch regional businesses so the directory has immediate regional depth
  // while placing claimed/verified members first.
  const seenBusinessIds = new Set(
    memberProfiles.map((p) => p.business_id).filter(Boolean) as string[]
  );

  let bizQuery = supabase
    .from("businesses")
    .select(
      "id, trading_name, legal_name, abn, claim_status, postcode, state_code, created_at, outback_verified"
    )
    .eq("status", "active")
    .order("claim_status", { ascending: true })
    .limit(36);

  if (postcode) {
    bizQuery = bizQuery.eq("postcode", postcode);
  } else {
    bizQuery = bizQuery.gte("postcode", "2300");
  }
  if (abnOnly) {
    bizQuery = bizQuery.in("claim_status", ["abn_verified", "trusted"]);
  }

  const { data: rawBusinesses } = role ? { data: [] } : await bizQuery;

  const directoryProfiles: TrustedProfileItem[] = (rawBusinesses ?? [])
    .filter((b) => !seenBusinessIds.has(b.id))
    .slice(0, 24)
    .map((b) => ({
      profile_id: b.id,
      user_id: null,
      business_id: b.id,
      name: b.trading_name || b.legal_name || "Rural Business",
      display_name: null,
      trading_name: b.trading_name,
      bio: null,
      postcode: b.postcode,
      state: b.state_code,
      member_since: b.created_at,
      email_verified: false,
      abn_verified:
        b.claim_status === "abn_verified" || b.claim_status === "trusted",
      abn: b.abn,
      is_claimed_business: b.claim_status !== "unclaimed",
      insurances_held: [],
      role_tags: [],
      years_in_district: null,
      availability_status: null,
      outback_verified: !!(
        (b as { outback_verified?: boolean }).outback_verified ||
        b.claim_status === "trusted"
      ),
      active_listings_count: 1,
      completed_deals_count: 0,
      review_count: 0,
      avg_rating: null,
      recommend_pct: null,
      top_tags: [],
    }));

  const allProfiles = [...memberProfiles, ...directoryProfiles];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Reputation, Reviews &amp; Verification
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Trusted People, Contractors &amp; Vendors
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-700">
            Find rural contractors, truck drivers, header operators, farmers, and hay/livestock vendors backed by ABN verification, insurance badges, and community vouches.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/settings"
            className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
          >
            Set up your trust profile →
          </Link>
          <Link
            href="/post/job?direction=available_for_work"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
          >
            List your skills
          </Link>
        </div>
      </div>

      {/* Role filter pills */}
      <div className="mt-6 flex flex-wrap gap-1.5">
        <Link
          href={`/profiles${postcode ? `?postcode=${postcode}` : ""}`}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
            !role
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-800 hover:border-green-700"
          }`}
        >
          All people &amp; vendors
        </Link>
        {ROLE_TAGS.map((r) => {
          const active = role === r.slug;
          const q = new URLSearchParams();
          if (!active) q.set("role", r.slug);
          if (postcode) q.set("postcode", postcode);
          if (abnOnly) q.set("abn", "1");
          return (
            <Link
              key={r.slug}
              href={`/profiles${q.toString() ? `?${q.toString()}` : ""}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-green-700 bg-green-700 text-white"
                  : "border-neutral-300 bg-white text-neutral-800 hover:border-green-700"
              }`}
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      {/* Filter form */}
      <form
        method="get"
        action="/profiles"
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
      >
        <div className="min-w-[180px] flex-1">
          <label
            htmlFor="profile-role"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Role / trade
          </label>
          <select
            id="profile-role"
            name="role"
            defaultValue={role}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
          >
            <option value="">All roles &amp; businesses</option>
            {ROLE_TAGS.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-36">
          <label
            htmlFor="profile-postcode"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Postcode
          </label>
          <input
            id="profile-postcode"
            name="postcode"
            type="text"
            inputMode="numeric"
            maxLength={4}
            defaultValue={postcode}
            placeholder="e.g. 2800"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-800">
          <input
            type="checkbox"
            name="abn"
            value="1"
            defaultChecked={abnOnly}
            className="h-4 w-4 rounded border-neutral-300 text-green-700"
          />
          ✓ ABN Verified only
        </label>

        <button
          type="submit"
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        >
          Filter
        </button>
        {(role || postcode || abnOnly) && (
          <Link
            href="/profiles"
            className="px-2 py-2 text-xs font-medium text-neutral-600 underline"
          >
            Reset
          </Link>
        )}
      </form>

      {/* Profiles Grid */}
      {allProfiles.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
          <p className="text-base font-semibold text-neutral-900">
            No profiles match those filters yet
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Be the first in your district to set up your verified trust profile or list your skills.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/settings"
              className="rounded-lg bg-green-700 px-4 py-2 text-xs font-semibold text-white hover:bg-green-800"
            >
              Create your trust profile
            </Link>
            <Link
              href="/profiles"
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800"
            >
              Show all profiles
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allProfiles.map((p) => {
            const formattedAbn = formatAbn(p.abn);
            const avail = p.user_id
              ? availabilityStatusInfo(p.availability_status)
              : null;
            return (
              <Link
                key={p.profile_id}
                href={`/profile/${p.profile_id}`}
                className="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-bold text-neutral-900 [overflow-wrap:anywhere]">
                      {p.name}
                    </h2>
                    {p.review_count > 0 && p.avg_rating !== null ? (
                      <span className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900">
                        ★ {Number(p.avg_rating).toFixed(1)} ({p.review_count})
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs text-neutral-600">
                    {p.postcode
                      ? `${p.postcode}${p.state ? ` ${p.state}` : ""}`
                      : "Regional Australia"}
                    {p.years_in_district
                      ? ` · ${p.years_in_district}+ yrs in district`
                      : ""}
                  </p>

                  {/* Verification & Role Badges */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.outback_verified && (
                      <span className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-950">
                        ★ Outback Verified
                      </span>
                    )}
                    {avail && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${avail.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${avail.dotClass}`} />
                        {avail.shortLabel}
                      </span>
                    )}
                    {p.abn_verified && (
                      <span className="rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-900">
                        ✓ ABN Verified{formattedAbn ? ` · ${formattedAbn}` : ""}
                      </span>
                    )}
                    {p.is_claimed_business ? (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-900">
                        ✓ Claimed
                      </span>
                    ) : !p.user_id ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
                        Unclaimed directory entry
                      </span>
                    ) : null}
                    {p.email_verified && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-900">
                        ✓ Verified Member
                      </span>
                    )}
                    {Array.isArray(p.insurances_held) &&
                      p.insurances_held.slice(0, 2).map((ins) => (
                        <span
                          key={ins}
                          className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900"
                        >
                          🛡 {insuranceBadgeLabel(ins)}
                        </span>
                      ))}
                    {Array.isArray(p.role_tags) &&
                      p.role_tags.slice(0, 2).map((r) => (
                        <span
                          key={r}
                          className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-700"
                        >
                          {roleTagLabel(r)}
                        </span>
                      ))}
                  </div>

                  {p.bio && (
                    <p className="mt-3 line-clamp-2 text-xs text-neutral-700">
                      {p.bio}
                    </p>
                  )}

                  {Array.isArray(p.top_tags) && p.top_tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.top_tags.slice(0, 2).map((t) => (
                        <span
                          key={t.tag}
                          className="rounded-full border border-green-200 bg-green-50/70 px-2 py-0.5 text-[11px] text-green-900"
                        >
                          ✓ {trustTagLabel(t.tag)} ({t.count})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-600">
                  <span>
                    {p.active_listings_count} active listing
                    {p.active_listings_count === 1 ? "" : "s"}
                    {p.completed_deals_count > 0
                      ? ` · ${p.completed_deals_count} completed`
                      : ""}
                  </span>
                  <span className="font-semibold text-green-800">
                    View profile &amp; reviews →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
