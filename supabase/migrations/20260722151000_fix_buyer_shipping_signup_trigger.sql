begin;
create or replace function private.store_buyer_signup_shipping_address()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  address_value text := nullif(btrim(new.raw_user_meta_data ->> 'shipping_address'), '');
begin
  if lower(new.raw_user_meta_data ->> 'requested_role') <> 'buyer'
     or address_value is null then
    return new;
  end if;

  update public.buyers as buyer
  set shipping_address = address_value
  from private.auth_identities as identity
  where identity.auth_user_id = new.id
    and buyer.buyer_user_id = identity.buyer_user_id;

  return new;
end;
$$;
commit;
