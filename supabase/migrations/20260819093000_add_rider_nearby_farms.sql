begin;
-- Rider map farm discovery exposes only public farm logistics information.
-- Farmer identity/contact fields remain protected by the existing owner RLS.
create or replace function public.current_rider_nearby_farms(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 15,
  p_limit integer default 50
) returns table (
  farm_id bigint,
  farm_name text,
  farm_location text,
  latitude double precision,
  longitude double precision,
  main_crops text[],
  distance_km double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rider_radius_km double precision;
  result_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180
     or p_radius_km is null or p_radius_km <= 0 then
    raise exception 'Valid map search coordinates and radius are required'
      using errcode = '22023';
  end if;

  select least(
    greatest(p_radius_km, 0.5),
    coalesce(rider.service_radius_km::double precision, 15),
    100
  ) into rider_radius_km
  from public.riders as rider
  where rider.rider_id = private.current_rider_id()
    and lower(rider.verification_status) = 'verified';

  if rider_radius_km is null then
    raise exception 'Verified Rider identity required' using errcode = '42501';
  end if;

  return query
  select
    farm.farm_id,
    coalesce(nullif(btrim(farm.farm_name), ''), 'Farm'),
    coalesce(
      nullif(btrim(farm.farm_location), ''),
      concat_ws(', ', nullif(btrim(farm.barangay), ''),
        nullif(btrim(farm.city_municipality), ''),
        nullif(btrim(farm.province), ''))
    ),
    farm.gps_lat::double precision,
    farm.gps_long::double precision,
    coalesce(farm.main_crops, '{}'::text[]),
    private.geo_distance_km(
      p_latitude,
      p_longitude,
      farm.gps_lat::double precision,
      farm.gps_long::double precision
    ) as distance_km
  from public.farms as farm
  join public.farmers as farmer
    on farmer.farmer_user_id = farm.farmer_user_id
  where lower(coalesce(farmer.verification_status, 'pending')) = 'verified'
    and lower(coalesce(farmer.account_status, 'active')) = 'active'
    and farm.gps_lat between -90 and 90
    and farm.gps_long between -180 and 180
    and private.geo_distance_km(
      p_latitude,
      p_longitude,
      farm.gps_lat::double precision,
      farm.gps_long::double precision
    ) <= rider_radius_km
  order by private.geo_distance_km(
    p_latitude,
    p_longitude,
    farm.gps_lat::double precision,
    farm.gps_long::double precision
  ), farm.farm_id
  limit result_limit;
end;
$$;
revoke all on function public.current_rider_nearby_farms(
  double precision, double precision, double precision, integer
) from public, anon;
grant execute on function public.current_rider_nearby_farms(
  double precision, double precision, double precision, integer
) to authenticated;
notify pgrst, 'reload schema';
commit;
