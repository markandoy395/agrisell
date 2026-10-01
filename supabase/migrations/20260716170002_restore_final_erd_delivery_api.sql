begin;
create or replace function public.current_rider_deliveries(
  include_available boolean default true
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    to_jsonb(delivery) || jsonb_build_object(
      'assigned_to_current_rider', assignment.rider_id is not null
    ) order by delivery.created_at desc
  ), '[]'::jsonb)
  from public.deliveries as delivery
  left join private.rider_delivery_assignments as assignment
    on assignment.delivery_id = delivery.delivery_id
      and assignment.rider_id = private.current_rider_id()
  where assignment.rider_id is not null or (
    include_available
    and not exists (
      select 1 from private.rider_delivery_assignments as claimed
      where claimed.delivery_id = delivery.delivery_id
    )
    and delivery.delivery_status in ('pending','available','ready_for_pickup')
  )
$$;
create or replace function public.accept_delivery(
  p_delivery_id bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_rider uuid := private.current_rider_id();
  target public.deliveries%rowtype;
begin
  if current_rider is null then raise exception 'Rider identity required'; end if;
  if not exists (
    select 1 from public.riders where rider_id = current_rider
      and employment_status = 'active' and availability_status = 'online'
  ) then raise exception 'Rider is not eligible and available' using errcode = '22023'; end if;
  select * into target from public.deliveries
  where delivery_id = p_delivery_id for update;
  if not found then raise exception 'Delivery not found'; end if;
  if exists (
    select 1 from private.rider_delivery_assignments
    where delivery_id = p_delivery_id and rider_id <> current_rider
  ) then raise exception 'Delivery is no longer available' using errcode = '40001'; end if;
  insert into private.rider_delivery_assignments (delivery_id, rider_id, assigned_at)
  values (p_delivery_id, current_rider, now())
  on conflict (delivery_id) do nothing;
  update public.deliveries set delivery_status = 'accepted'
  where delivery_id = p_delivery_id returning * into target;
  update public.riders set availability_status = 'busy'
  where rider_id = current_rider;
  return to_jsonb(target) || jsonb_build_object(
    'assigned_to_current_rider', true, 'idempotency_key', p_idempotency_key
  );
end;
$$;
create or replace function public.update_delivery_status(
  p_delivery_id bigint, p_previous_status text, p_new_status text,
  p_idempotency_key text, p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.deliveries%rowtype;
  changed_at timestamptz := now();
begin
  if not exists (
    select 1 from private.rider_delivery_assignments
    where delivery_id = p_delivery_id and rider_id = private.current_rider_id()
  ) then raise exception 'Assigned Rider required'; end if;
  update public.deliveries set
    delivery_status = p_new_status,
    actual_delivery_time = case
      when p_new_status in ('completed','delivered') then changed_at
      else actual_delivery_time end
  where delivery_id = p_delivery_id and delivery_status = p_previous_status
  returning * into target;
  if not found then raise exception 'Delivery status changed' using errcode = '40001'; end if;
  if p_new_status in ('completed','delivered','cancelled','failed') then
    update public.riders set availability_status = 'online'
    where rider_id = private.current_rider_id();
  end if;
  return jsonb_build_object(
    'delivery', to_jsonb(target),
    'history', jsonb_build_object(
      'status_history_id', p_idempotency_key,
      'delivery_id', p_delivery_id,
      'previous_status', p_previous_status,
      'new_status', p_new_status,
      'remarks', p_remarks, 'latitude', p_latitude, 'longitude', p_longitude,
      'changed_at', changed_at, 'created_at', changed_at
    )
  );
end;
$$;
create or replace function private.sync_rider_employment_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.users as app_user set
    account_status = case new.employment_status
      when 'active' then 'active' when 'suspended' then 'suspended'
      else 'pending' end,
    updated_at = now()
  from private.auth_identities as identity
  where identity.rider_id = new.rider_id and app_user.user_id = identity.user_id;
  return new;
end;
$$;
drop trigger if exists riders_sync_employment_status on public.riders;
create trigger riders_sync_employment_status
after update of employment_status on public.riders
for each row when (old.employment_status is distinct from new.employment_status)
execute function private.sync_rider_employment_status();
revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_id() to authenticated;
grant execute on function private.current_buyer_user_id() to authenticated;
grant execute on function private.current_farmer_user_id() to authenticated;
grant execute on function private.current_rider_id() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.owns_farm(bigint) to authenticated;
grant execute on function private.owns_category(bigint,bigint) to authenticated;
grant execute on function private.owns_cart(bigint) to authenticated;
grant execute on function private.owns_order(bigint) to authenticated;
grant execute on function private.can_access_delivery(bigint) to authenticated;
grant execute on function private.can_access_payment(bigint) to authenticated;
revoke all on function public.current_application_role() from public;
revoke all on function public.provision_current_user_role(text) from public;
revoke all on function public.create_current_rider_registration(jsonb) from public;
revoke all on function public.current_rider_deliveries(boolean) from public;
revoke all on function public.accept_delivery(bigint,uuid) from public;
revoke all on function public.update_delivery_status(
  bigint,text,text,text,text,double precision,double precision
) from public;
grant execute on function public.current_application_role() to authenticated;
grant execute on function public.provision_current_user_role(text) to authenticated;
grant execute on function public.create_current_rider_registration(jsonb) to authenticated;
grant execute on function public.current_rider_deliveries(boolean) to authenticated;
grant execute on function public.accept_delivery(bigint,uuid) to authenticated;
grant execute on function public.update_delivery_status(
  bigint,text,text,text,text,double precision,double precision
) to authenticated;
revoke all on public.users from anon, authenticated;
grant select (
  user_id,first_name,middle_name,last_name,extension_name,email,contact_number,
  profile_photo_url,account_status,created_at,updated_at,gender,date_of_birth,
  e_wallet_details
) on public.users to authenticated;
grant update (
  first_name,middle_name,last_name,extension_name,contact_number,
  profile_photo_url,gender,date_of_birth,e_wallet_details
) on public.users to authenticated;
grant select on public.riders, public.deliveries, public.payments to authenticated;
grant update (
  license_number,full_name,vehicle_type,vehicle_plate_number,
  availability_status,first_name,last_name,contact_number,email,gps_lat,gps_long,
  profile_photo_url
) on public.riders to authenticated;
drop policy if exists riders_own_read on public.riders;
drop policy if exists riders_own_insert on public.riders;
drop policy if exists riders_own_update on public.riders;
create policy riders_own_read on public.riders for select to authenticated
  using (rider_id = private.current_rider_id());
create policy riders_own_update on public.riders for update to authenticated
  using (rider_id = private.current_rider_id())
  with check (rider_id = private.current_rider_id());
drop policy if exists deliveries_access_read on public.deliveries;
create policy deliveries_access_read on public.deliveries for select to authenticated
  using (private.can_access_delivery(delivery_id) or (
    private.current_rider_id() is not null
    and delivery_status in ('pending','available','ready_for_pickup')
    and not exists (
      select 1 from private.rider_delivery_assignments as assignment
      where assignment.delivery_id = deliveries.delivery_id
    )
  ));
drop policy if exists payments_access_read on public.payments;
create policy payments_access_read on public.payments for select to authenticated
  using (private.can_access_payment(payment_id));
commit;
