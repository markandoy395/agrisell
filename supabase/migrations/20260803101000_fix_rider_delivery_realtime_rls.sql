begin;
-- Keep private assignment data behind a security-definer boundary. The old
-- deliveries policy queried the private table directly as `authenticated`,
-- which made every PostgREST/realtime SELECT fail with SQLSTATE 42501.
create or replace function private.can_access_delivery(
  target_delivery_id bigint
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.deliveries as delivery
    where delivery.delivery_id = target_delivery_id
      and private.owns_order(delivery.order_id)
  ) or exists (
    select 1
    from private.rider_delivery_assignments as assignment
    where assignment.delivery_id = target_delivery_id
      and assignment.rider_id = private.current_rider_id()
  ) or exists (
    select 1
    from public.deliveries as delivery
    where delivery.delivery_id = target_delivery_id
      and private.current_rider_id() is not null
      and delivery.delivery_status in ('pending', 'available', 'ready_for_pickup')
      and not exists (
        select 1
        from private.rider_delivery_assignments as assignment
        where assignment.delivery_id = delivery.delivery_id
      )
  )
$$;
revoke all on function private.can_access_delivery(bigint) from public, anon;
grant execute on function private.can_access_delivery(bigint) to authenticated;
drop policy if exists deliveries_access_read on public.deliveries;
create policy deliveries_access_read
on public.deliveries for select to authenticated
using (private.can_access_delivery(delivery_id));
commit;
