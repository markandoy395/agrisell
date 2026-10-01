begin;
alter table public.commodities
  add column if not exists availability_status text not null default 'ready_now';
update public.commodities
set availability_status = case lower(coalesce(production_status, ''))
  when 'growing' then 'pre_order'
  when 'ready for harvest' then 'harvesting_soon'
  else 'ready_now'
end
where availability_status = 'ready_now';
alter table public.commodities
  drop constraint if exists commodities_availability_status_check;
alter table public.commodities
  add constraint commodities_availability_status_check
  check (availability_status in ('ready_now', 'pre_order', 'harvesting_soon'));
grant update (availability_status) on public.commodities to authenticated;
commit;
