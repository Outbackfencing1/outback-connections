-- ============================================================
-- Migration: claim_review_fns  (Gate 1B — claim flow transitions)
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ADDITIVE — 2 functions. No schema change, no destructive op.
-- Depends : M1 (businesses, business_members, claims).
--
-- Purpose : Atomic admin review of claim-this-business requests.
--   approve_claim: claim -> approved; business unclaimed -> claimed (never
--     downgrades abn_verified/trusted); links claimant via business_members.
--   reject_claim:  claim -> rejected.
--
-- The CLAIM REQUEST itself is created by the signed-in user via the user-context
-- RLS policy "Users file own claims" (app action submitClaim) — not here.
--
-- Access: service_role only (admin review actions call these after a server-side
-- requireAdmin() check; p_reviewed_by is the admin's uid for the audit trail).
-- ============================================================

create or replace function public.approve_claim(p_claim_id uuid, p_reviewed_by uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_business uuid;
  v_claimant uuid;
  v_status   text;
  v_biz_claim text;
begin
  select business_id, claimant_user_id, status
    into v_business, v_claimant, v_status
    from public.claims where id = p_claim_id;
  if v_business is null then
    raise exception 'approve_claim: claim % not found', p_claim_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'approve_claim: claim is % (must be pending)', v_status;
  end if;

  update public.claims
     set status = 'approved', reviewed_at = now(), reviewed_by = p_reviewed_by
   where id = p_claim_id;

  -- Promote only unclaimed -> claimed; never downgrade abn_verified / trusted.
  select claim_status into v_biz_claim from public.businesses where id = v_business for update;
  if v_biz_claim = 'unclaimed' then
    update public.businesses
       set claim_status = 'claimed', claimed_by = v_claimant,
           claimed_at = now(), last_verified_at = now()
     where id = v_business;
  end if;

  -- Link the claimant to the business (idempotent).
  insert into public.business_members (business_id, user_id, role)
  values (v_business, v_claimant, 'owner')
  on conflict (business_id, user_id) do nothing;

  return jsonb_build_object(
    'claim_id', p_claim_id,
    'business_id', v_business,
    'business_claim_status', (select claim_status from public.businesses where id = v_business),
    'member_linked', true
  );
end;
$fn$;

create or replace function public.reject_claim(p_claim_id uuid, p_reviewed_by uuid, p_note text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_status text;
begin
  select status into v_status from public.claims where id = p_claim_id;
  if v_status is null then
    raise exception 'reject_claim: claim % not found', p_claim_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'reject_claim: claim is % (must be pending)', v_status;
  end if;
  update public.claims
     set status = 'rejected', reviewed_at = now(), reviewed_by = p_reviewed_by,
         notes = coalesce(p_note, notes)
   where id = p_claim_id;
  return jsonb_build_object('claim_id', p_claim_id, 'status', 'rejected');
end;
$fn$;

revoke all on function public.approve_claim(uuid, uuid) from public;
grant execute on function public.approve_claim(uuid, uuid) to service_role;
revoke all on function public.reject_claim(uuid, uuid, text) from public;
grant execute on function public.reject_claim(uuid, uuid, text) to service_role;

-- ============================================================
-- ROLLBACK (manual):
--   drop function if exists public.approve_claim(uuid, uuid);
--   drop function if exists public.reject_claim(uuid, uuid, text);
-- ============================================================
