-- Retire the superseded authenticated write path after the scoped outreach
-- workspace is live. The old RPC predates channel suppression, identity
-- assignment and idempotency, so all signed-in users must now use the atomic
-- outcome RPC introduced by 20260814120000.
revoke all on function public.record_contractor_outreach(
  uuid, text, text, text, text, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.record_contractor_outreach(
  uuid, text, text, text, text, timestamptz, text
) to service_role;

notify pgrst, 'reload schema';
