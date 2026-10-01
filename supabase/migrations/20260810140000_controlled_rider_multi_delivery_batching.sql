begin;
-- Existing Riders remain limited to one delivery until an authorized manager
-- explicitly raises either an individual or vehicle-type configuration.
alter table public.riders
  add column if not exists maximum_active_deliveries integer not null default 1,
  add column if not exists capacity_kg numeric(12,3),
  add column if not exists handling_capability_keys text[] not null
    default '{}'::text[];
alter table public.riders drop constraint if exists
  riders_active_delivery_limit_check;
alter table public.riders add constraint riders_active_delivery_limit_check
  check (maximum_active_deliveries between 1 and 100);
create table if not exists private.rider_delivery_limit_configuration (
  vehicle_type text primary key,
  recommended_limit integer not null check (recommended_limit between 1 and 100),
  configured_limit integer not null default 1
    check (configured_limit between 1 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into private.rider_delivery_limit_configuration (
  vehicle_type, recommended_limit, configured_limit
) values
  ('motorcycle', 3, 1),
  ('tricycle', 5, 1),
  ('car', 5, 1),
  ('van', 10, 1),
  ('truck', 20, 1)
on conflict (vehicle_type) do nothing;
revoke all on private.rider_delivery_limit_configuration
  from public, anon, authenticated;
create or replace function private.can_manage_rider_delivery_limit(
  target_company_id bigint
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from private.auth_identities as identity
    join public.admins as administrator
      on administrator.user_id = identity.user_id
    where identity.auth_user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.logistics_companies as company
    where company.logistics_company_id = target_company_id
      and lower(company.email) = lower(coalesce(
        (select auth.jwt() ->> 'email'), ''
      ))
      and lower(coalesce(company.status, 'active')) = 'active'
  )
$$;
create or replace function public.configure_rider_delivery_limit(
  p_maximum_active_deliveries integer,
  p_rider_id uuid default null,
  p_vehicle_type text default null,
  p_logistics_company_id bigint default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  target_company_id bigint;
  affected integer;
  normalized_vehicle text := lower(replace(btrim(p_vehicle_type), '-', ''));
begin
  if p_maximum_active_deliveries not between 1 and 100 then
    raise exception 'invalid_active_delivery_limit' using errcode = '22023';
  end if;
  if (p_rider_id is null) = (nullif(normalized_vehicle, '') is null) then
    raise exception 'Specify exactly one Rider or vehicle type'
      using errcode = '22023';
  end if;

  if p_rider_id is not null then
    select rider.logistics_company_id into target_company_id
    from public.riders as rider where rider.rider_id = p_rider_id;
  else
    target_company_id := p_logistics_company_id;
  end if;
  if not private.can_manage_rider_delivery_limit(target_company_id) then
    raise exception 'Delivery limit manager authorization required'
      using errcode = '42501';
  end if;

  if p_rider_id is not null then
    update public.riders set
      maximum_active_deliveries = p_maximum_active_deliveries
    where rider_id = p_rider_id;
  else
    insert into private.rider_delivery_limit_configuration (
      vehicle_type, recommended_limit, configured_limit, updated_at, updated_by
    ) values (
      normalized_vehicle, p_maximum_active_deliveries,
      p_maximum_active_deliveries, now(), (select auth.uid())
    ) on conflict (vehicle_type) do update set
      configured_limit = excluded.configured_limit,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
    update public.riders set
      maximum_active_deliveries = p_maximum_active_deliveries
    where lower(replace(vehicle_type, '-', '')) = normalized_vehicle
      and (p_logistics_company_id is null
        or logistics_company_id = p_logistics_company_id);
  end if;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
-- Locks the Rider row for the duration of acceptance. Concurrent requests for
-- the same Rider serialize here, so each request sees the previous commit.
create or replace function private.validate_delivery_batch_acceptance(
  p_delivery_id bigint,
  p_rider_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  rider_record public.riders%rowtype;
  target_delivery public.deliveries%rowtype;
  target_fulfillment private.order_delivery_fulfillments%rowtype;
  target_request public.rider_assignment_requests%rowtype;
  active_count integer;
  active_weight numeric;
  active_minutes integer;
  target_payment_method text;
begin
  select * into rider_record from public.riders
  where rider_id = p_rider_id for update;
  if not found then
    raise exception 'Rider profile not found' using errcode = '22023';
  end if;
  select * into target_delivery from public.deliveries
  where delivery_id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found' using errcode = '22023';
  end if;
  if exists (
    select 1 from private.rider_delivery_assignments
    where delivery_id = p_delivery_id and rider_id = p_rider_id
  ) then
    return;
  end if;

  select * into target_fulfillment
  from private.order_delivery_fulfillments
  where delivery_id = p_delivery_id;
  select * into target_request
  from public.rider_assignment_requests
  where delivery_id = p_delivery_id and rider_id = p_rider_id
    and status in ('pending', 'accepted')
  order by requested_at desc limit 1;

  select count(*), coalesce(sum(fulfillment.total_weight_kg), 0),
    coalesce(ceil(sum(greatest(
      coalesce(delivery.distance_km, 0) / 25 * 60, 0
    )))::integer, 0)
  into active_count, active_weight, active_minutes
  from private.rider_delivery_assignments as assignment
  join public.deliveries as delivery
    on delivery.delivery_id = assignment.delivery_id
  left join private.order_delivery_fulfillments as fulfillment
    on fulfillment.delivery_id = delivery.delivery_id
  where assignment.rider_id = p_rider_id
    and delivery.delivery_status in (
      'accepted', 'going_to_pickup', 'arrived_at_pickup', 'picked_up',
      'going_to_delivery', 'arrived_at_delivery'
    );

  if active_count >= greatest(rider_record.maximum_active_deliveries, 1) then
    raise exception 'active_delivery_limit_reached' using errcode = '22023';
  end if;
  if active_count > 0 and (
    rider_record.capacity_kg is null
    or active_weight + target_fulfillment.total_weight_kg
      > rider_record.capacity_kg
  ) then
    raise exception 'capacity_conflict' using errcode = '22023';
  end if;
  if target_fulfillment.required_vehicle_type is not null
      and lower(replace(target_fulfillment.required_vehicle_type, '-', ''))
        <> lower(replace(rider_record.vehicle_type, '-', '')) then
    raise exception 'vehicle_type_conflict' using errcode = '22023';
  end if;
  if target_request.expires_at <= now()
      or target_request.requested_schedule <= now()
      or (target_delivery.estimated_delivery_time is not null
        and target_delivery.estimated_delivery_time <= now()) then
    raise exception 'deadline_conflict' using errcode = '22023';
  end if;
  if active_count > 0 and target_request.requested_schedule is not null
      and now() + make_interval(mins => active_minutes + 10)
        > target_request.requested_schedule then
    raise exception 'route_incompatible' using errcode = '22023';
  end if;
  if active_count > 0 and coalesce(target_delivery.cold_chain_available, false)
      and not ('temperatureSensitive' = any(
        rider_record.handling_capability_keys
      )) then
    raise exception 'product_handling_conflict' using errcode = '22023';
  end if;

  select order_record.payment_method into target_payment_method
  from public.orders as order_record
  where order_record.client_order_id = target_fulfillment.seller_order_id
  order by order_record.order_id limit 1;
  if lower(coalesce(target_payment_method, '')) in (
      'cod', 'cash on delivery', 'cash_on_delivery'
    ) and not exists (
      select 1 from public.logistics_companies as company
      where company.logistics_company_id = rider_record.logistics_company_id
        and coalesce(company.cod_available, false)
    ) then
    raise exception 'cod_responsibility_unavailable' using errcode = '22023';
  end if;
end;
$$;
-- A busy Rider remains requestable only while the configured batch still has
-- room. Registered service coverage remains independent from live GPS.
create or replace function private.rider_is_eligible_for_delivery(
  target_delivery_id bigint,
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.riders as rider
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.delivery_id = target_delivery_id
    cross join lateral private.seller_order_current_delivery_location(
      fulfillment.seller_order_id
    ) as destination
    where rider.rider_id = target_rider_id
      and rider.availability_status in ('online', 'busy')
      and (
        rider.availability_status = 'online'
        or (
          select count(*)
          from private.rider_delivery_assignments as assignment
          join public.deliveries as active_delivery
            on active_delivery.delivery_id = assignment.delivery_id
          where assignment.rider_id = rider.rider_id
            and active_delivery.delivery_status in (
              'accepted', 'going_to_pickup', 'arrived_at_pickup', 'picked_up',
              'going_to_delivery', 'arrived_at_delivery'
            )
        ) < greatest(rider.maximum_active_deliveries, 1)
      )
      and private.rider_registered_location_is_available(rider.rider_id)
      and private.rider_is_visible_for_delivery(
        target_delivery_id, rider.rider_id
      )
      and private.rider_registered_service_area_contains(
        fulfillment.pickup_lat::double precision,
        fulfillment.pickup_long::double precision,
        rider.rider_id
      )
      and private.rider_registered_service_area_contains(
        destination.latitude::double precision,
        destination.longitude::double precision,
        rider.rider_id
      )
  )
$$;
create or replace function public.accept_delivery(
  p_delivery_id bigint,
  p_idempotency_key uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
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
revoke update (maximum_active_deliveries) on public.riders
  from authenticated;
revoke all on function private.can_manage_rider_delivery_limit(bigint),
  private.validate_delivery_batch_acceptance(bigint, uuid),
  private.rider_is_eligible_for_delivery(bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.configure_rider_delivery_limit(
  integer, uuid, text, bigint
) from public, anon;
grant execute on function public.configure_rider_delivery_limit(
  integer, uuid, text, bigint
) to authenticated;
grant execute on function public.accept_delivery(bigint, uuid)
  to authenticated;
notify pgrst, 'reload schema';
commit;
