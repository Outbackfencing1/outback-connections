-- ============================================================
-- Function EXECUTE privileges, part 2: baseline functions still granted to PUBLIC
-- ============================================================
-- 20260906060000 revoked anon/authenticated, but the trigger functions and
-- purge_old_auth_events came from the baseline with an EXECUTE grant to
-- PUBLIC, which anon and authenticated inherit. Revoke that too.
-- Trigger firing does not need the caller's EXECUTE privilege.
--
-- Rollback: grant execute on the listed functions to public.
-- ============================================================

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.bump_listing_flag_count() from public;
revoke execute on function public.incidents_from_complaint() from public;
revoke execute on function public.incidents_from_help_request() from public;
revoke execute on function public.incidents_cleanup_on_source_delete() from public;
revoke execute on function public.purge_old_auth_events() from public;

-- Keep the service role able to call the cron-driven one explicitly.
grant execute on function public.purge_old_auth_events() to service_role;
