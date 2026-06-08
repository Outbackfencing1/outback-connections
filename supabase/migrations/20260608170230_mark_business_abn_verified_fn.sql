-- ============================================================
-- Migration: mark_business_abn_verified_fn  (trust ladder: claimed -> abn_verified)
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ADDITIVE — 1 function. No schema change, no destructive op.
-- Depends : M1 (businesses).
--
-- Purpose : Record a successful ABR ABN Lookup match — promote the business
--           claimed -> abn_verified, store the ABR status. The HTTP call + parse
--           live in lib/abr.ts (app); this function only persists the verified
--           result so the transition is testable independently of the ABR.
--
-- Guard: only claimed (or already abn_verified — idempotent) may be promoted.
--        Never verifies an unclaimed business; never downgrades trusted.
--
-- Access: service_role only (called by the admin verifyBusinessAbn action).
-- ============================================================

create or replace function public.mark_business_abn_verified(
  p_business_id uuid,
  p_abr_status  text,
  p_entity_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_claim text;
begin
  select claim_status into v_claim from public.businesses where id = p_business_id for update;
  if v_claim is null then
    raise exception 'mark_business_abn_verified: business % not found', p_business_id;
  end if;
  if v_claim not in ('claimed', 'abn_verified') then
    raise exception 'mark_business_abn_verified: business is % (must be claimed first)', v_claim;
  end if;

  update public.businesses
     set claim_status     = 'abn_verified',
         abr_status       = p_abr_status,
         legal_name       = coalesce(legal_name, p_entity_name),
         last_verified_at = now()
   where id = p_business_id;

  return jsonb_build_object(
    'business_id', p_business_id,
    'claim_status', 'abn_verified',
    'abr_status', p_abr_status
  );
end;
$fn$;

revoke all on function public.mark_business_abn_verified(uuid, text, text) from public;
grant execute on function public.mark_business_abn_verified(uuid, text, text) to service_role;

-- ============================================================
-- ROLLBACK (manual):
--   drop function if exists public.mark_business_abn_verified(uuid, text, text);
-- ============================================================
