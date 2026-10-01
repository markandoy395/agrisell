begin;
-- An available Rider remains requestable for five minutes after the last
-- valid location heartbeat. This grace period covers brief app switches while
-- preventing a Rider who closed the app from remaining online indefinitely.
create or replace function private.rider_current_location_is_fresh(
  target_rider_id uuid
) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  has_fresh_location boolean;
begin
  if pg_catalog.to_regclass('public.rider_locations') is null then
    return false;
  end if;

  select exists (
    select 1
    from public.rider_locations as current_location
    where current_location.rider_id = target_rider_id
      and current_location.latitude between -90 and 90
      and current_location.longitude between -180 and 180
      and current_location.location_updated_at >= now() - interval '5 minutes'
      and (
        current_location.accuracy_meters is null
        or current_location.accuracy_meters <= 100
      )
  ) into has_fresh_location;

  return coalesce(has_fresh_location, false);
end
$$;
create or replace function private.expire_stale_rider_availability()
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  expired_count integer;
begin
  update public.riders as rider
  set availability_status = 'offline'
  where rider.availability_status = 'online'
    and rider.employment_status = 'active'
    and not private.rider_current_location_is_fresh(rider.rider_id)
    and not exists (
      select 1
      from private.rider_delivery_assignments as assignment
      join public.deliveries as delivery
        on delivery.delivery_id = assignment.delivery_id
      where assignment.rider_id = rider.rider_id
        and delivery.delivery_status not in (
          'completed', 'delivered', 'cancelled', 'failed', 'returned'
        )
    );

  get diagnostics expired_count = row_count;
  return expired_count;
end
$$;
revoke all on function private.rider_current_location_is_fresh(uuid),
  private.expire_stale_rider_availability()
  from public, anon, authenticated;
create extension if not exists pg_cron;
select cron.schedule(
  'agrisell-stale-rider-availability',
  '* * * * *',
  'select private.expire_stale_rider_availability()'
);
notify pgrst, 'reload schema';
commit;
