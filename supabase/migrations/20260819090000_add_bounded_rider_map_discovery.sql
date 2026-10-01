begin;
-- Preserve the established Rider authorization boundary, then apply a
-- geographic bound to map discovery. Assigned deliveries are always retained
-- so an active job cannot disappear when the Rider leaves the search radius.
create or replace function public.current_rider_nearby_deliveries(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 15,
  p_limit integer default 50
) returns jsonb
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
  where rider.rider_id = private.current_rider_id();

  if rider_radius_km is null then
    raise exception 'Rider identity required' using errcode = '42501';
  end if;

  return (
    with source as (
      select item
      from jsonb_array_elements(
        private.current_rider_deliveries(true)
      ) as item
    ), pickup_coordinates as (
      select
        source.item,
        coalesce((source.item ->> 'assigned_to_current_rider')::boolean, false)
          as assigned,
        nullif(pickup.location ->> 'latitude', '')::double precision
          as latitude,
        nullif(pickup.location ->> 'longitude', '')::double precision
          as longitude
      from source
      left join lateral (
        select location
        from jsonb_array_elements(
          coalesce(source.item -> 'locations', '[]'::jsonb)
        ) as location
        where location ->> 'location_type' = 'pickup'
        limit 1
      ) as pickup on true
    ), scored as (
      select
        item,
        assigned,
        case
          when latitude between -90 and 90 and longitude between -180 and 180
          then private.geo_distance_km(
            p_latitude, p_longitude, latitude, longitude
          )
          else null
        end as distance_km
      from pickup_coordinates
    ), bounded as (
      select item, assigned, distance_km
      from scored
      where assigned or distance_km <= rider_radius_km
      order by assigned desc, distance_km asc nulls last
      limit result_limit
    )
    select coalesce(
      jsonb_agg(item order by assigned desc, distance_km asc nulls last),
      '[]'::jsonb
    )
    from bounded
  );
end;
$$;
revoke all on function public.current_rider_nearby_deliveries(
  double precision, double precision, double precision, integer
) from public, anon;
grant execute on function public.current_rider_nearby_deliveries(
  double precision, double precision, double precision, integer
) to authenticated;
notify pgrst, 'reload schema';
commit;
