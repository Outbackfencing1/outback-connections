-- ============================================================
-- DRAFT — DO NOT APPLY WITHOUT REVIEW.  (item 10: security hardening)
-- Kept in _drafts/ so it is NOT part of the apply chain.
-- Audited 2026-06-08 on project csisezoohgfrpjrhkmls.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pin search_path on the 6 functions that lack it.
--    The 3 incidents_* are SECURITY DEFINER + mutable path = the priority
--    (definer + unpinned search_path is a privilege-escalation vector).
--    gen_short_id MUST include `extensions` (it calls gen_random_bytes, which
--    lives in the extensions schema) — pinning it to `public` alone would break
--    every insert that defaults an anonymised_id. The others touch public only.
-- ------------------------------------------------------------
alter function public.gen_short_id(text)                    set search_path = public, extensions;
alter function public.set_updated_at()                      set search_path = public;
alter function public.derive_listing_state()                set search_path = public;
alter function public.incidents_from_help_request()         set search_path = public;
alter function public.incidents_from_complaint()            set search_path = public;
alter function public.incidents_cleanup_on_source_delete()  set search_path = public;

-- ------------------------------------------------------------
-- 2. SECURITY DEFINER views.
--
-- admin_duplicate_accounts_by_ip — CONFIRMED latent leak: anon currently has
--   SELECT and the view is SECURITY DEFINER, so it bypasses user_profiles RLS.
--   It returns 0 rows today (only 1 user), but once 3+ accounts share an IP it
--   would expose creation_ip + user_ids to anyone via PostgREST. The admin page
--   already reads it via the SERVICE ROLE (createAdminClient), so closing the
--   anon/authenticated door does NOT break it. Switch to invoker (RLS applies;
--   service_role still sees all via its "Service role manages profiles" policy)
--   AND revoke the api-role grants.
alter view public.admin_duplicate_accounts_by_ip set (security_invoker = true);
revoke select on public.admin_duplicate_accounts_by_ip from anon, authenticated;

-- user_profiles_public — SECURITY DEFINER + anon-readable, but JUSTIFIED: it
--   exposes only (user_id, display_name), which is intentionally public (the
--   listing author name). Converting it to invoker would hide display_name from
--   anon (user_profiles RLS) and break author display. LEAVE AS-IS; the advisor
--   "security_definer_view" ERROR on it is an accepted, reviewed false-positive.
--   (no change)

-- ------------------------------------------------------------
-- 3. NOT SQL — leaked-password protection is a Supabase Auth dashboard setting
--    for Josh: Authentication -> Policies -> enable "Leaked password protection"
--    (checks new passwords against HaveIBeenPwned). Passwords are in use, so
--    turn it on.
-- ============================================================
-- ROLLBACK (manual): re-grant select to anon/authenticated + set
--   security_invoker=false on the view; functions can keep pinned search_path.
-- ============================================================
