begin;
alter table public.rider_assignment_requests
  drop constraint if exists rider_assignment_requests_max_booking_window;
alter table public.rider_assignment_requests
  add constraint rider_assignment_requests_max_booking_window check (
    expires_at <= requested_at + interval '60 minutes'
  );
-- Offline Riders may receive and accept a manual booking when every
-- non-presence eligibility rule still passes.
create or replace function private.rider_can_receive_manual_request(
  target_delivery_id bigint,
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select private.rider_is_eligible_for_delivery(
    target_delivery_id, target_rider_id
  ) or exists (
    select 1
    from public.riders as rider
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.delivery_id = target_delivery_id
    cross join lateral private.seller_order_current_delivery_location(
      fulfillment.seller_order_id
    ) as destination
    where rider.rider_id = target_rider_id
      and rider.availability_status = 'offline'
      and rider.employment_status = 'active'
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
create or replace function private.rider_assignment_request_timeout(
  target_rider_id uuid
) returns interval language sql stable security definer set search_path = '' as $$
  select case when rider.availability_status = 'offline'
    then interval '45 minutes'
    else interval '15 minutes'
  end
  from public.riders as rider
  where rider.rider_id = target_rider_id
$$;
-- Going offline does not release or replace a pending booking. Structural
-- deactivation still fails the request immediately; ordinary offline requests
-- remain pending until acceptance, decline, cancellation, or expiration.
create or replace function private.fail_rider_requests_when_unavailable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.employment_status, '') <> 'active' then
    update public.rider_assignment_requests
    set status = 'failed', responded_at = now(),
      failure_reason = 'Rider account became inactive'
    where rider_id = new.rider_id and status = 'pending';
  end if;
  return new;
end;
$$;
do $$
declare
  selection_definition text;
  request_definition text;
  acceptance_definition text;
begin
  select pg_get_functiondef(
    'public.eligible_riders_for_current_farmer_order(text)'::regprocedure
  ) into selection_definition;
  if selection_definition is null then
    raise exception 'Rider directory function is missing';
  end if;
  selection_definition := replace(
    selection_definition,
    'private.rider_is_eligible_for_delivery(',
    'private.rider_can_receive_manual_request('
  );
  selection_definition := replace(
    selection_definition,
    'rider.availability_status in (''online'', ''busy'')',
    'rider.availability_status in (''online'', ''busy'', ''offline'')'
  );
  if selection_definition not like
      '%private.rider_can_receive_manual_request(%'
      or selection_definition not like
      '%''online'', ''busy'', ''offline''%' then
    raise exception 'Offline Rider directory support was not installed';
  end if;
  execute selection_definition;

  select pg_get_functiondef(
    'public.request_current_farmer_rider(text,uuid,timestamp with time zone,numeric)'::regprocedure
  ) into request_definition;
  if request_definition is null then
    raise exception 'Rider request function is missing';
  end if;
  request_definition := replace(
    request_definition,
    'private.rider_is_eligible_for_delivery(',
    'private.rider_can_receive_manual_request('
  );
  request_definition := replace(
    request_definition,
    'now() + interval ''15 minutes''',
    'now() + private.rider_assignment_request_timeout(p_rider_id)'
  );
  request_definition := replace(
    request_definition,
    'now() + ''00:15:00''::interval',
    'now() + private.rider_assignment_request_timeout(p_rider_id)'
  );
  if request_definition not like
      '%private.rider_can_receive_manual_request(%'
      or request_definition not like
      '%private.rider_assignment_request_timeout(p_rider_id)%' then
    raise exception 'Offline Rider request expiration was not installed';
  end if;
  execute request_definition;

  select pg_get_functiondef(
    'private.accept_delivery(bigint,uuid)'::regprocedure
  ) into acceptance_definition;
  if acceptance_definition is null then
    raise exception 'Rider acceptance function is missing';
  end if;
  acceptance_definition := replace(
    acceptance_definition,
    'private.rider_is_eligible_for_delivery(',
    'private.rider_can_receive_manual_request('
  );
  if acceptance_definition not like
      '%private.rider_can_receive_manual_request(%' then
    raise exception 'Offline Rider acceptance support was not installed';
  end if;
  execute acceptance_definition;
end
$$;
-- Only pending rows expire. Accepted requests therefore stop participating in
-- the timer while their delivery assignment remains intact.
create or replace function private.process_rider_assignment_expirations()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare expired_count integer;
begin
  update public.rider_assignment_requests
  set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now();
  get diagnostics expired_count = row_count;
  return jsonb_build_object('expired', expired_count);
end;
$$;
do $$
declare existing_job_id bigint;
begin
  for existing_job_id in
    select jobid from cron.job
    where jobname = 'agrisell-rider-assignment-expiration'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end
$$;
select cron.schedule(
  'agrisell-rider-assignment-expiration',
  '* * * * *',
  'select private.process_rider_assignment_expirations()'
);
revoke all on function private.rider_can_receive_manual_request(bigint, uuid),
  private.rider_assignment_request_timeout(uuid),
  private.fail_rider_requests_when_unavailable(),
  private.process_rider_assignment_expirations()
  from public, anon, authenticated;
grant execute on function public.eligible_riders_for_current_farmer_order(text),
  public.request_current_farmer_rider(text, uuid, timestamptz, numeric)
  to authenticated;
notify pgrst, 'reload schema';
commit;
