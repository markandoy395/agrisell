begin;
-- Buyer listings need only the farmer's name and farm location. A narrow
-- security-definer function keeps other farm profile fields private.
create or replace function public.marketplace_farm_details(farm_ids bigint[])
returns table (farm_id bigint, farmer_name text, farm_location text)
language sql stable security definer set search_path = '' as $$
  select
    farm.farm_id,
    coalesce(
      nullif(btrim(concat_ws(
        ' ',
        nullif(farmer.first_name, ''),
        nullif(farmer.middle_name, ''),
        nullif(farmer.last_name, ''),
        nullif(farmer.suffix, '')
      )), ''),
      nullif(farm.farm_name, ''),
      'Farmer'
    ),
    farm.farm_location
  from public.farms as farm
  join public.farmers as farmer on farmer.farmer_user_id = farm.farmer_user_id
  where farm.farm_id = any(farm_ids)
    and (select auth.uid()) is not null;
$$;
revoke all on function public.marketplace_farm_details(bigint[]) from public;
grant execute on function public.marketplace_farm_details(bigint[])
  to authenticated;
commit;
