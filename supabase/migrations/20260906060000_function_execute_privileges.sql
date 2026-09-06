-- ============================================================
-- Function EXECUTE privileges: close the default-privilege gap
-- ============================================================
-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon, authenticated and service_role at creation time. Earlier migrations
-- did `revoke all ... from public; grant ... to service_role`, which removes
-- PUBLIC's grant but leaves the explicit anon/authenticated grants in place.
-- So every function below was callable through PostgREST /rest/v1/rpc/ by
-- any visitor. None was exploitable (SECURITY INVOKER functions hit RLS;
-- SECURITY DEFINER admin functions check admin internally) but the intent
-- was never enforced and the advisor list was noise.
--
-- Rule applied:
--   * service-role-only (called from server code with the admin client, or
--     trigger functions): revoke from anon AND authenticated.
--   * admin RPCs called through the signed-in user's client (they check
--     current_user_is_admin() / is_admin internally): revoke from anon only.
--   * current_user_is_admin(): untouched (RLS policies evaluate it as the
--     authenticated user). gen_short_id(): untouched (column defaults).
--
-- Trigger functions do not need the firing user's EXECUTE privilege (checked
-- only at CREATE TRIGGER), so revoking is safe for handle_new_user etc.
--
-- Rollback: grant execute on the listed functions back to anon, authenticated.
-- ============================================================

-- Service-role-only.
revoke execute on function public.ingest_scraped_business(text, text, text, text, text, text, text, text, text, text, numeric, numeric, jsonb, integer) from anon, authenticated;
revoke execute on function public.preview_scraped_import(jsonb) from anon, authenticated;
revoke execute on function public.approve_claim(uuid, uuid) from anon, authenticated;
revoke execute on function public.reject_claim(uuid, uuid, text) from anon, authenticated;
revoke execute on function public.mark_business_abn_verified(uuid, text, text) from anon, authenticated;
revoke execute on function public.admin_analytics_summary() from anon, authenticated;
revoke execute on function public.expire_stale_scraped_listings() from anon, authenticated;
revoke execute on function public.purge_old_auth_events() from anon, authenticated;

-- Trigger functions.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.bump_listing_flag_count() from anon, authenticated;
revoke execute on function public.incidents_from_complaint() from anon, authenticated;
revoke execute on function public.incidents_from_help_request() from anon, authenticated;
revoke execute on function public.incidents_cleanup_on_source_delete() from anon, authenticated;

-- Admin RPCs invoked via the signed-in session (keep authenticated).
revoke execute on function public.admin_clear_flags(uuid) from anon;
revoke execute on function public.admin_hide_listing(uuid) from anon;
revoke execute on function public.admin_set_lockdown(boolean, text) from anon;
revoke execute on function public.admin_contractor_outreach_counts() from anon;
revoke execute on function public.record_contractor_outreach(uuid, text, text, text, text, timestamptz, text) from anon;

-- Stop the gap re-opening for functions created from now on.
alter default privileges in schema public revoke execute on functions from anon;
