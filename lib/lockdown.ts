// lib/lockdown.ts
// Site-wide lockdown flag, fetched from app_settings via the anon client
// and cached for 30 seconds so the read isn't on the critical path of
// every server-render. When active, signups + new posts are blocked and
// a banner appears across the site.
import { unstable_cache } from "next/cache";
import { createAnonClient } from "./supabase/anon";

export type LockdownState = {
  active: boolean;
  reason: string | null;
  activated_at: string | null;
};

async function fetchLockdown(): Promise<LockdownState> {
  const supabase = createAnonClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "lockdown")
    .maybeSingle();
  const v = (data?.value ?? null) as null | {
    active?: boolean;
    reason?: string | null;
    activated_at?: string | null;
  };
  return {
    active: !!v?.active,
    reason: v?.reason ?? null,
    activated_at: v?.activated_at ?? null,
  };
}

export const getLockdownState = unstable_cache(
  fetchLockdown,
  ["lockdown-state-v1"],
  { revalidate: 30, tags: ["lockdown"] }
);
