begin;
create or replace function private.save_current_confirmed_location(
  owner_role text,
  address_value text,
  latitude_value double precision,
  longitude_value double precision
) returns void language plpgsql security definer set search_path = '' as $$
declare
  normalized_role text := lower(btrim(owner_role));
  normalized_address text := nullif(btrim(address_value), '');
  target_buyer_id bigint := private.current_buyer_user_id();
  target_farmer_id bigint := private.current_farmer_user_id();
  target_rider_id uuid := private.current_rider_id();
  target_farm_id bigint;
begin
  if latitude_value is null or latitude_value not between -90 and 90
     or longitude_value is null or longitude_value not between -180 and 180 then
    raise exception 'A valid map location is required' using errcode = '22023';
  end if;

  if normalized_role = 'buyer' and target_buyer_id is not null then
    if normalized_address is null then
      raise exception 'A delivery address is required' using errcode = '22023';
    end if;
    update public.buyers set
      shipping_address = normalized_address,
      gps_lat = latitude_value,
      gps_long = longitude_value
    where buyer_user_id = target_buyer_id;
  elsif normalized_role = 'farmer' and target_farmer_id is not null then
    if normalized_address is null then
      raise exception 'A farm pickup address is required' using errcode = '22023';
    end if;
    select farm.farm_id into target_farm_id
    from public.farms as farm
    where farm.farmer_user_id = target_farmer_id
    order by farm.created_at desc, farm.farm_id desc
    limit 1 for update;
    if target_farm_id is null then
      raise exception 'Create the farm profile before saving its location'
        using errcode = '22023';
    end if;
    update public.farms set
      farm_location = normalized_address,
      gps_lat = latitude_value,
      gps_long = longitude_value
    where farm_id = target_farm_id
      and farmer_user_id = target_farmer_id;
  elsif normalized_role = 'rider' and target_rider_id is not null then
    update public.riders set
      gps_lat = latitude_value,
      gps_long = longitude_value
    where rider_id = target_rider_id;
  else
    raise exception 'The authenticated account does not match this location'
      using errcode = '42501';
  end if;
end;
$$;
create or replace function public.save_current_confirmed_location(
  owner_role text,
  address_value text,
  latitude_value double precision,
  longitude_value double precision
) returns void language sql security invoker set search_path = '' as $$
  select private.save_current_confirmed_location(
    owner_role, address_value, latitude_value, longitude_value
  )
$$;
revoke all on function private.save_current_confirmed_location(
  text, text, double precision, double precision
) from public, anon;
grant execute on function private.save_current_confirmed_location(
  text, text, double precision, double precision
) to authenticated;
revoke all on function public.save_current_confirmed_location(
  text, text, double precision, double precision
) from public, anon;
grant execute on function public.save_current_confirmed_location(
  text, text, double precision, double precision
) to authenticated;
notify pgrst, 'reload schema';
commit;
