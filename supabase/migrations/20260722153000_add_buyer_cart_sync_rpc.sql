begin;
create or replace function private.replace_current_buyer_cart(
  cart_items jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  target_buyer_id bigint;
  target_cart_id bigint;
begin
  if jsonb_typeof(cart_items) <> 'array' then
    raise exception 'Cart items must be an array';
  end if;

  select identity.buyer_user_id into target_buyer_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid());

  if target_buyer_id is null then
    raise exception 'An authenticated buyer account is required';
  end if;

  select cart.cart_id into target_cart_id
  from public.carts as cart
  where cart.buyer_user_id = target_buyer_id
    and cart.cart_status = 'active'
  order by cart.cart_id desc
  limit 1
  for update;

  if target_cart_id is null then
    insert into public.carts (buyer_user_id, cart_status)
    values (target_buyer_id, 'active')
    returning cart_id into target_cart_id;
  else
    update public.carts
    set updated_at = now()
    where cart_id = target_cart_id;
  end if;

  delete from public.cart_items where cart_id = target_cart_id;

  insert into public.cart_items (cart_id, commodity_id, quantity, price_at_time)
  select
    target_cart_id,
    item.commodity_id,
    item.quantity,
    item.price_at_time
  from jsonb_to_recordset(cart_items) as item(
    commodity_id bigint,
    quantity numeric,
    price_at_time numeric
  )
  where item.commodity_id is not null
    and item.quantity > 0
    and item.price_at_time >= 0;

  return target_cart_id;
end;
$$;
create or replace function public.replace_current_buyer_cart(
  cart_items jsonb
) returns bigint language sql security invoker set search_path = '' as $$
  select private.replace_current_buyer_cart(cart_items)
$$;
revoke all on function private.replace_current_buyer_cart(jsonb)
  from public, anon;
grant execute on function private.replace_current_buyer_cart(jsonb)
  to authenticated;
revoke all on function public.replace_current_buyer_cart(jsonb)
  from public, anon;
grant execute on function public.replace_current_buyer_cart(jsonb)
  to authenticated;
notify pgrst, 'reload schema';
commit;
