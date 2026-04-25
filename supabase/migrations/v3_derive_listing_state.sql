-- Migration: derive_listing_state_from_regions
-- Applied via Supabase MCP after Fix 1 (regions populate).
-- See commit message for context.

create or replace function public.derive_listing_state()
returns trigger as $$
begin
  if new.postcode is not null then
    select r.state into new.state
    from public.regions r
    where r.postcode = new.postcode;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_derive_listing_state on public.listings;
create trigger trg_derive_listing_state
  before insert or update of postcode on public.listings
  for each row execute function public.derive_listing_state();
