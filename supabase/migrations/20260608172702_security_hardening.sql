-- ============================================================
-- Migration: security_hardening
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : Function search_path pins + close a confirmed latent view leak.
--           No table data touched. Reviewed + cleared before applying.
-- Promoted from supabase/migrations/_drafts/security_hardening.sql.
--
-- 1. Pin search_path on the 6 functions that lacked it. gen_short_id keeps
--    `extensions` (it calls gen_random_bytes, which lives there); the rest are
--    public-only. The 3 SECURITY DEFINER incidents_* are the priority (definer
--    + mutable search_path is a privilege-escalation vector).
-- 2. admin_duplicate_accounts_by_ip was a SECURITY DEFINER view with SELECT
--    granted to anon (confirmed via an anon-role test) — it bypassed
--    user_profiles RLS, a latent creation_ip/user_ids leak (0 rows today). The
--    admin page reads it via the service role, so switching to invoker +
--    revoking the api-role grants closes the hole without breaking the page.
-- 3. user_profiles_public is left SECURITY DEFINER by design (exposes only the
--    public display_name). Leaked-password protection is a separate Supabase
--    Auth dashboard toggle.
-- ============================================================

alter function public.gen_short_id(text)                    set search_path = public, extensions;
alter function public.set_updated_at()                      set search_path = public;
alter function public.derive_listing_state()                set search_path = public;
alter function public.incidents_from_help_request()         set search_path = public;
alter function public.incidents_from_complaint()            set search_path = public;
alter function public.incidents_cleanup_on_source_delete()  set search_path = public;

alter view public.admin_duplicate_accounts_by_ip set (security_invoker = true);
revoke select on public.admin_duplicate_accounts_by_ip from anon, authenticated;

-- ============================================================
-- ROLLBACK (manual):
--   alter view public.admin_duplicate_accounts_by_ip set (security_invoker = false);
--   grant select on public.admin_duplicate_accounts_by_ip to anon, authenticated;
--   (the function search_path pins are harmless to leave in place.)
-- ============================================================
