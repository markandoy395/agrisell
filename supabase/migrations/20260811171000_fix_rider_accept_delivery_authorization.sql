begin;
-- The batching migration made this wrapper SECURITY INVOKER while revoking
-- authenticated access to its private validator. Run the trusted wrapper as
-- its owner so Riders can call the public RPC without gaining direct access
-- to private validation or assignment functions.
create or replace function public.accept_delivery(
  p_delivery_id bigint,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_rider uuid := private.current_rider_id();
begin
  if current_rider is null then
    raise exception 'Rider identity required' using errcode = '42501';
  end if;

  perform private.validate_delivery_batch_acceptance(
    p_delivery_id, current_rider
  );
  return private.accept_delivery(p_delivery_id, p_idempotency_key);
end;
$$;
revoke all on function public.accept_delivery(bigint, uuid)
  from public, anon;
grant execute on function public.accept_delivery(bigint, uuid)
  to authenticated;
-- These implementation details must remain callable only through the
-- security-definer public wrapper.
revoke all on function private.validate_delivery_batch_acceptance(bigint, uuid),
  private.rider_is_eligible_for_delivery(bigint, uuid)
  from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
