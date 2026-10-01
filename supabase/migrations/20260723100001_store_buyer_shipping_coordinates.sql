begin;
create or replace function private.set_current_buyer_shipping_address_location(
  address_value text,
  latitude_value numeric,
  longitude_value numeric
) returns text language plpgsql security definer set search_path = '' as $$
declare
  normalized_address text := nullif(btrim(address_value), '');
  target_buyer_id bigint;
begin
  if normalized_address is null then
    raise exception 'Shipping address is required';
  end if;
  if latitude_value is null or latitude_value not between -90 and 90 or
      longitude_value is null or longitude_value not between -180 and 180 then
    raise exception 'A valid delivery map location is required';
  end if;

  select identity.buyer_user_id into target_buyer_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid());
  if target_buyer_id is null then
    raise exception 'An authenticated buyer account is required';
  end if;

  update public.buyers
  set shipping_address = normalized_address,
      gps_lat = latitude_value,
      gps_long = longitude_value
  where buyer_user_id = target_buyer_id;
  return normalized_address;
end;
$$;
create or replace function public.set_current_buyer_shipping_address_location(
  address_value text,
  latitude_value numeric,
  longitude_value numeric
) returns text language sql security invoker set search_path = '' as $$
  select private.set_current_buyer_shipping_address_location(
    address_value, latitude_value, longitude_value
  )
$$;
revoke all on function private.set_current_buyer_shipping_address_location(text, numeric, numeric) from public, anon;
grant execute on function private.set_current_buyer_shipping_address_location(text, numeric, numeric) to authenticated;
revoke all on function public.set_current_buyer_shipping_address_location(text, numeric, numeric) from public, anon;
grant execute on function public.set_current_buyer_shipping_address_location(text, numeric, numeric) to authenticated;
notify pgrst, 'reload schema';
commit;
