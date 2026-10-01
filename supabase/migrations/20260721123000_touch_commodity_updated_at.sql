begin;
create or replace function public.touch_commodity_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists commodities_set_updated_at on public.commodities;
create trigger commodities_set_updated_at
before update on public.commodities
for each row execute function public.touch_commodity_updated_at();
commit;
