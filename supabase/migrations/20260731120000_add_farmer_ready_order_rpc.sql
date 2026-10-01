begin;
create or replace function public.mark_current_farmer_order_ready(
  seller_order_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_farmer_id bigint;
begin
  target_farmer_id := private.current_farmer_user_id();
  if target_farmer_id is null then
    raise exception 'Only a farmer can mark an order ready'
      using errcode = '42501';
  end if;

  if nullif(btrim(seller_order_id), '') is null then
    raise exception 'An order ID is required'
      using errcode = '22023';
  end if;

  perform private.mark_farmer_order_ready(
    target_farmer_id,
    btrim(seller_order_id)
  );
end;
$$;
revoke all on function public.mark_current_farmer_order_ready(text)
  from public, anon;
grant execute on function public.mark_current_farmer_order_ready(text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
