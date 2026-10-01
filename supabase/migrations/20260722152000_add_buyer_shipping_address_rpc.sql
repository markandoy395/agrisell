begin;
create or replace function private.set_current_buyer_shipping_address(
  address_value text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  normalized_address text := nullif(btrim(address_value), '');
  target_buyer_id bigint;
begin
  if normalized_address is null then
    raise exception 'Shipping address is required';
  end if;

  select identity.buyer_user_id into target_buyer_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid());

  if target_buyer_id is null then
    raise exception 'An authenticated buyer account is required';
  end if;

  update public.buyers
  set shipping_address = normalized_address
  where buyer_user_id = target_buyer_id;

  return normalized_address;
end;
$$;
create or replace function public.set_current_buyer_shipping_address(
  address_value text
) returns text language sql security invoker set search_path = '' as $$
  select private.set_current_buyer_shipping_address(address_value)
$$;
revoke all on function private.set_current_buyer_shipping_address(text)
  from public, anon;
grant execute on function private.set_current_buyer_shipping_address(text)
  to authenticated;
revoke all on function public.set_current_buyer_shipping_address(text)
  from public, anon;
grant execute on function public.set_current_buyer_shipping_address(text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
