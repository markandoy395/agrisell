begin;
-- Migration versions are immutable once applied. Recreate the public entry
-- points in a new migration so projects that already recorded the earlier
-- permission repairs receive the corrected ownership and grants.
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
alter function private.cancel_current_farmer_order(text, text)
  owner to postgres;
alter function private.current_account_cancellation_snapshots()
  owner to postgres;
alter function public.cancel_current_farmer_order(text, text)
  owner to postgres;
alter function public.current_account_cancellation_snapshots()
  owner to postgres;
revoke all on function private.cancel_current_farmer_order(text, text),
  private.current_account_cancellation_snapshots()
  from public, anon, authenticated;
revoke all on function public.cancel_current_farmer_order(text, text),
  public.current_account_cancellation_snapshots()
  from public, anon;
grant execute on function public.cancel_current_farmer_order(text, text),
  public.current_account_cancellation_snapshots()
  to authenticated;
do $$
begin
  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.cancel_current_farmer_order(text,text)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute cancel_current_farmer_order';
  end if;
end
$$;
notify pgrst, 'reload schema';
commit;
