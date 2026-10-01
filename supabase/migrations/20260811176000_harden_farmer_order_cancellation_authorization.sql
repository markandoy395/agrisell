begin;
-- Use a non-inlineable trusted wrapper and also authorize the authenticated
-- role to enter the validated implementation. The private schema is not
-- exposed by PostgREST, and the implementation independently checks auth.uid,
-- the farmer identity, and ownership of the seller-scoped order.
create or replace function public.cancel_current_farmer_order(
  p_seller_order_id text,
  p_cancellation_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return private.cancel_current_farmer_order(
    p_seller_order_id, p_cancellation_reason
  );
end
$$;
create or replace function public.current_account_cancellation_snapshots()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return private.current_account_cancellation_snapshots();
end
$$;
revoke all on function public.cancel_current_farmer_order(text, text),
  public.current_account_cancellation_snapshots()
  from public, anon;
grant execute on function public.cancel_current_farmer_order(text, text),
  public.current_account_cancellation_snapshots(),
  private.cancel_current_farmer_order(text, text),
  private.current_account_cancellation_snapshots()
  to authenticated;
notify pgrst, 'reload schema';
commit;
