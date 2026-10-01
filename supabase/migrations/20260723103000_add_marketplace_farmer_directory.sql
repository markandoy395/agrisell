begin;
-- Buyers need a directory without direct read access to farmer records.
-- This returns only active, verified farms and public marketplace details.
create or replace function public.marketplace_farmer_directory()
returns table (
  farm_id bigint,
  farmer_name text,
  farm_location text,
  profile_image_url text,
  cover_image_url text,
  rating numeric,
  products jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    farm.farm_id,
    coalesce(
      nullif(btrim(concat_ws(' ', farmer.first_name, farmer.middle_name, farmer.last_name, farmer.suffix)), ''),
      nullif(farm.farm_name, ''),
      'Farmer'
    ),
    coalesce(nullif(farm.farm_location, ''), 'Location unavailable'),
    farmer.profile_image_url,
    farm.farm_images[1],
    0::numeric,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', commodity.commodity_name,
          'is_available', coalesce(commodity.commodity_status, 'available') <> 'sold'
            and coalesce(commodity.available_quantity, 0) > 0
        ) order by commodity.created_at desc
      ) filter (where commodity.commodity_id is not null),
      '[]'::jsonb
    )
  from public.farms as farm
  join public.farmers as farmer on farmer.farmer_user_id = farm.farmer_user_id
  left join public.commodities as commodity on commodity.farm_id = farm.farm_id
  where (select auth.uid()) is not null
    and lower(coalesce(farmer.verification_status, 'pending')) = 'verified'
    and lower(coalesce(farmer.account_status, 'active')) = 'active'
  group by farm.farm_id, farmer.farmer_user_id;
$$;
revoke all on function public.marketplace_farmer_directory() from public;
grant execute on function public.marketplace_farmer_directory() to authenticated;
commit;
