begin;
update public.commodities
set production_status = case
  when lower(coalesce(production_status, '')) in
    ('growing', 'pre-order', 'pre_order') then 'growing'
  when lower(coalesce(production_status, '')) in
    ('harvesting_soon', 'harvesting soon', 'ready for harvest')
    or availability_status = 'harvesting_soon' then 'harvesting_soon'
  else 'harvested'
end;
alter table public.commodities
  drop constraint if exists commodities_availability_status_check;
update public.commodities
set availability_status = 'not_accepting_orders'
where availability_status = 'harvesting_soon';
alter table public.commodities
  alter column production_status set default 'harvested',
  alter column production_status set not null;
alter table public.commodities
  add constraint commodities_availability_status_check
  check (
    availability_status in (
      'ready_now',
      'pre_order',
      'not_accepting_orders'
    )
  );
alter table public.commodities
  drop constraint if exists commodities_production_status_check;
alter table public.commodities
  add constraint commodities_production_status_check
  check (production_status in ('growing', 'harvesting_soon', 'harvested'));
alter table public.commodities
  drop constraint if exists commodities_ready_requires_harvested_check;
alter table public.commodities
  add constraint commodities_ready_requires_harvested_check
  check (
    availability_status <> 'ready_now'
    or production_status = 'harvested'
  );
create or replace function private.validate_commodity_availability_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manila_today date := timezone('Asia/Manila', now())::date;
  minimum_days integer := 0;
  maximum_days integer := 0;
  requires_date boolean := false;
begin
  if new.production_status = 'harvesting_soon' then
    requires_date := true;
    minimum_days := 1;
    maximum_days := 14;
  elsif new.production_status = 'growing' then
    requires_date := true;
    minimum_days := 1;
    maximum_days := 90;
  end if;

  if new.availability_status = 'pre_order' then
    requires_date := true;
    minimum_days := greatest(minimum_days, 3);
    maximum_days := case
      when maximum_days = 0 then 90
      else least(maximum_days, 90)
    end;
  end if;

  if requires_date and new.harvest_date is null then
    raise exception 'Expected availability date is required';
  end if;

  if requires_date and (
    new.harvest_date < manila_today + minimum_days
    or new.harvest_date > manila_today + maximum_days
  ) then
    raise exception
      'Expected availability must be % to % days from today',
      minimum_days,
      maximum_days;
  end if;

  return new;
end;
$$;
drop trigger if exists commodities_validate_availability_date
  on public.commodities;
create trigger commodities_validate_availability_date
before insert or update of production_status, availability_status, harvest_date
on public.commodities
for each row execute function private.validate_commodity_availability_date();
revoke all on function private.validate_commodity_availability_date()
  from public, anon, authenticated;
create or replace function private.validate_cart_item_ordering()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  commodity_record public.commodities%rowtype;
begin
  select commodity.* into commodity_record
  from public.commodities as commodity
  where commodity.commodity_id = new.commodity_id;

  if not found
     or lower(coalesce(commodity_record.commodity_status, 'available')) = 'sold'
     or coalesce(commodity_record.available_quantity, 0) <= 0 then
    raise exception 'This product is unavailable';
  end if;

  if commodity_record.availability_status = 'not_accepting_orders' then
    raise exception 'This product is not accepting orders';
  end if;

  if new.quantity > commodity_record.available_quantity then
    raise exception 'The requested quantity exceeds available stock';
  end if;

  if commodity_record.minimum_order_quantity is not null
     and new.quantity < commodity_record.minimum_order_quantity then
    raise exception 'The requested quantity is below the minimum order';
  end if;

  return new;
end;
$$;
drop trigger if exists cart_items_validate_ordering
  on public.cart_items;
create trigger cart_items_validate_ordering
before insert or update of commodity_id, quantity
on public.cart_items
for each row execute function private.validate_cart_item_ordering();
revoke all on function private.validate_cart_item_ordering()
  from public, anon, authenticated;
commit;
