-- ============================================================
-- Migration: preview_scraped_import_fn  (Phase 1 ingestion 1A — admin preview)
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ADDITIVE — 1 read-only function. No writes, no schema change.
-- Depends : businesses (M1+source key), listings (M2), categories (M5),
--           ingest_scraped_business().
--
-- Purpose : Dry-run for the admin Import Preview. Given an array of normalised
--           import records (the ImportRecord format — see
--           docs/INGEST-IMPORT-FORMAT.md), returns, per row, exactly what WOULD
--           happen on import — validation, resolved category, would-be
--           create/update (deduped on the place_id source key), and the computed
--           listing fields — WITHOUT writing anything.
--
-- Read-only by construction: only SELECTs. It mirrors the resolution + dedupe
-- rules of ingest_scraped_business() — KEEP THE TWO IN SYNC. Because this is
-- read-only, any drift can only make the preview slightly inaccurate, never
-- cause a bad write.
--
-- Access: service_role only (the admin Import page calls it via the service
-- client after an app-level is_admin check). No anon/authenticated execute.
-- ============================================================

create or replace function public.preview_scraped_import(p_records jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $fn$
declare
  v_country text := 'AU';
  rec       jsonb;
  v_vertical text; v_pillar text; v_slug text; v_name text; v_postcode text;
  v_cat_id uuid; v_cat_label text; v_cat_resolved text;
  v_biz_id uuid; v_lst_id uuid; v_lst_slug text;
  v_biz_action text; v_lst_action text;
  v_errors   text[]; v_warnings text[];
  v_seen     jsonb := '{}'::jsonb;
  v_key      text;
  v_rows     jsonb := '[]'::jsonb;
  v_total int := 0; v_valid int := 0; v_invalid int := 0;
  v_create int := 0; v_update int := 0; v_dupes int := 0;
begin
  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'preview_scraped_import: p_records must be a JSON array';
  end if;

  for rec in select value from jsonb_array_elements(p_records)
  loop
    v_total := v_total + 1;
    v_errors := array[]::text[];
    v_warnings := array[]::text[];
    v_vertical := rec->>'vertical';
    v_name     := rec->>'name';
    v_postcode := rec->>'postcode';

    -- validation (mirrors ingest_scraped_business preconditions + trust guards)
    if v_vertical is null or v_vertical not in ('job','freight') then
      v_errors := array_append(v_errors, 'vertical must be job or freight');
    end if;
    if coalesce(v_name,'') = '' then
      v_errors := array_append(v_errors, 'name required');
    end if;
    if v_postcode is null or v_postcode !~ '^[0-9]{4}$' then
      v_errors := array_append(v_errors, 'postcode must be 4 digits');
    end if;
    if coalesce(rec->>'source_external_id','') = '' then
      v_errors := array_append(v_errors, 'source_external_id (place_id) required');
    end if;
    if coalesce(rec->>'source_url','') = '' then
      v_errors := array_append(v_errors, 'source_url required (scraped trust guard)');
    end if;
    if coalesce(rec->>'source_platform','') = '' then
      v_errors := array_append(v_errors, 'source_platform required (scraped trust guard)');
    end if;

    -- intra-batch duplicate (non-fatal: ingest is idempotent, but flag it)
    v_key := coalesce(rec->>'source_platform','') || '|' || coalesce(rec->>'source_external_id','');
    if rec->>'source_external_id' is not null and v_seen ? v_key then
      v_warnings := array_append(v_warnings, 'duplicate place_id within this batch — would resolve to one row');
      v_dupes := v_dupes + 1;
    elsif rec->>'source_external_id' is not null then
      v_seen := v_seen || jsonb_build_object(v_key, true);
    end if;

    v_cat_resolved := null; v_cat_label := null;
    v_biz_action := null; v_lst_action := null; v_lst_slug := null;

    if v_vertical in ('job','freight') then
      v_pillar := case when v_vertical='job' then 'jobs' else 'freight' end;
      v_slug   := rec->>'category_slug';
      select id, label into v_cat_id, v_cat_label from public.categories
        where country_code=v_country and pillar=v_pillar and slug=v_slug and active=true limit 1;
      if v_cat_id is null then
        v_slug := case when v_vertical='job' then 'jobs-other' else 'freight-other' end;
        select id, label into v_cat_id, v_cat_label from public.categories
          where country_code=v_country and pillar=v_pillar and slug=v_slug limit 1;
        if (rec->>'category_slug') is not null and (rec->>'category_slug') <> v_slug then
          v_warnings := array_append(v_warnings,
            format('category "%s" not found — fell back to %s', rec->>'category_slug', v_slug));
        end if;
      end if;
      v_cat_resolved := v_slug;

      -- dedupe lookups (READ-ONLY)
      select id into v_biz_id from public.businesses
        where source_platform=rec->>'source_platform' and source_external_id=rec->>'source_external_id' limit 1;
      v_biz_action := case when v_biz_id is null then 'would_create' else 'would_update' end;

      select id, slug into v_lst_id, v_lst_slug from public.listings
        where source_platform=rec->>'source_platform' and source_external_id=rec->>'source_external_id' limit 1;
      v_lst_action := case when v_lst_id is null then 'would_create' else 'would_update' end;
    end if;

    if array_length(v_errors,1) is null then
      v_valid := v_valid + 1;
      if v_lst_action = 'would_create' then v_create := v_create + 1; else v_update := v_update + 1; end if;
    else
      v_invalid := v_invalid + 1;
    end if;

    v_rows := v_rows || jsonb_build_object(
      'name', v_name,
      'vertical', v_vertical,
      'side', case when v_vertical='job' then 'demand' when v_vertical='freight' then 'supply' else null end,
      'kind', v_vertical,
      'postcode', v_postcode,
      'suburb', rec->>'suburb',
      'state', rec->>'state',
      'source_platform', rec->>'source_platform',
      'source_external_id', rec->>'source_external_id',
      'source_url', rec->>'source_url',
      'category_input', rec->>'category_slug',
      'category_resolved', v_cat_resolved,
      'category_label', v_cat_label,
      'data_source', 'scraped',
      'claim_status', 'unclaimed',
      'business_action', v_biz_action,
      'listing_action', v_lst_action,
      'existing_listing_slug', v_lst_slug,
      'expires_in_days', 45,
      'valid', (array_length(v_errors,1) is null),
      'errors', to_jsonb(v_errors),
      'warnings', to_jsonb(v_warnings)
    );
  end loop;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'total', v_total,
      'valid', v_valid,
      'invalid', v_invalid,
      'would_create', v_create,
      'would_update', v_update,
      'intra_batch_duplicates', v_dupes
    ),
    'rows', v_rows
  );
end;
$fn$;

revoke all on function public.preview_scraped_import(jsonb) from public;
grant execute on function public.preview_scraped_import(jsonb) to service_role;

-- ============================================================
-- ROLLBACK (manual):
--   drop function if exists public.preview_scraped_import(jsonb);
-- ============================================================
