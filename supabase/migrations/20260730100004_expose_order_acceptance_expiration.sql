begin;
create or replace function private.current_account_expiration_snapshots()
returns jsonb language sql stable security definer set search_path = '' as $$
  with snapshots as (
    select order_record.client_order_id,
      min(order_record.acceptance_expires_at) as acceptance_expires_at,
      max(order_record.acceptance_expired_at) as acceptance_expired_at
    from public.orders as order_record
    where private.owns_order(order_record.order_id)
    group by order_record.client_order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', client_order_id,
    'acceptanceExpiresAt', acceptance_expires_at,
    'acceptanceExpiredAt', acceptance_expired_at
  )), '[]'::jsonb) from snapshots
$$;
create or replace function public.current_account_expiration_snapshots()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.current_account_expiration_snapshots()
$$;
revoke all on function private.current_account_expiration_snapshots()
  from public, anon;
grant execute on function private.current_account_expiration_snapshots()
  to authenticated;
revoke all on function public.current_account_expiration_snapshots()
  from public, anon;
grant execute on function public.current_account_expiration_snapshots()
  to authenticated;
notify pgrst, 'reload schema';
commit;
