begin;
-- The final ERD cleanup removed this operational table, but Rider location
-- publishing and Farmer matching both depend on one current row per Rider.
create table if not exists public.rider_locations (
  location_id uuid primary key default extensions.gen_random_uuid(),
  rider_id uuid not null unique
    references public.riders (rider_id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision
    check (accuracy_meters is null or accuracy_meters >= 0),
  heading double precision check (heading is null or heading between 0 and 360),
  speed_kph double precision check (speed_kph is null or speed_kph >= 0),
  location_updated_at timestamptz not null default now()
);
create index if not exists rider_locations_updated_at_idx
  on public.rider_locations (location_updated_at);
insert into public.rider_locations (
  rider_id, latitude, longitude, accuracy_meters, location_updated_at
)
select rider.rider_id, rider.gps_lat::double precision,
  rider.gps_long::double precision, rider.gps_accuracy_meters::double precision,
  coalesce(rider.location_captured_at, now() - interval '6 minutes')
from public.riders as rider
where rider.gps_lat between -90 and 90
  and rider.gps_long between -180 and 180
on conflict (rider_id) do nothing;
alter table public.rider_locations enable row level security;
drop policy if exists rider_locations_own_read on public.rider_locations;
create policy rider_locations_own_read on public.rider_locations
for select to authenticated using (
  exists (
    select 1 from private.auth_identities as identity
    where identity.rider_id = rider_locations.rider_id
      and identity.auth_user_id = (select auth.uid())
  )
);
drop policy if exists rider_locations_own_insert on public.rider_locations;
create policy rider_locations_own_insert on public.rider_locations
for insert to authenticated with check (
  exists (
    select 1 from private.auth_identities as identity
    where identity.rider_id = rider_locations.rider_id
      and identity.auth_user_id = (select auth.uid())
  )
);
drop policy if exists rider_locations_own_update on public.rider_locations;
create policy rider_locations_own_update on public.rider_locations
for update to authenticated using (
  exists (
    select 1 from private.auth_identities as identity
    where identity.rider_id = rider_locations.rider_id
      and identity.auth_user_id = (select auth.uid())
  )
) with check (
  exists (
    select 1 from private.auth_identities as identity
    where identity.rider_id = rider_locations.rider_id
      and identity.auth_user_id = (select auth.uid())
  )
);
revoke all on public.rider_locations from anon, authenticated;
grant select on public.rider_locations to authenticated;
grant insert (
  rider_id, latitude, longitude, accuracy_meters, heading, speed_kph,
  location_updated_at
) on public.rider_locations to authenticated;
grant update (
  latitude, longitude, accuracy_meters, heading, speed_kph,
  location_updated_at
) on public.rider_locations to authenticated;
-- A valid active Rider identity must remain visible even when its legacy
-- public.users row was not provisioned. Existing non-active account rows are
-- still excluded, and vehicle/location/conflict rules remain unchanged.
create or replace function private.rider_is_visible_for_delivery(
  target_delivery_id bigint,
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.riders as rider
    join private.auth_identities as identity
      on identity.rider_id = rider.rider_id
    left join public.users as app_user on app_user.user_id = identity.user_id
    left join public.logistics_companies as company
      on company.logistics_company_id = rider.logistics_company_id
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.delivery_id = target_delivery_id
    join private.seller_order_registry as registry
      on registry.seller_order_id = fulfillment.seller_order_id
    join public.farms as farm on farm.farm_id = registry.seller_farm_id
    where rider.rider_id = target_rider_id
      and (
        app_user.user_id is null
        or app_user.account_status = 'active'
      )
      and rider.employment_status = 'active'
      and nullif(btrim(rider.first_name), '') is not null
      and nullif(btrim(rider.last_name), '') is not null
      and nullif(btrim(rider.contact_number), '') is not null
      and nullif(btrim(rider.vehicle_type), '') is not null
      and nullif(btrim(farm.city_municipality), '') is not null
      and (
        lower(btrim(coalesce(rider.city_municipality, '')))
          = lower(btrim(farm.city_municipality))
        or strpos(lower(coalesce(rider.location_label, '')),
          lower(btrim(farm.city_municipality))) > 0
        or strpos(
          lower(coalesce(array_to_string(company.service_areas, ','), '')),
          lower(btrim(farm.city_municipality))
        ) > 0
        or (
          nullif(btrim(farm.province), '') is not null
          and lower(btrim(coalesce(rider.province, '')))
            = lower(btrim(farm.province))
        )
        or (
          nullif(btrim(farm.province), '') is not null
          and strpos(lower(coalesce(rider.location_label, '')),
            lower(btrim(farm.province))) > 0
        )
        or (
          nullif(btrim(farm.province), '') is not null
          and strpos(
            lower(coalesce(array_to_string(company.service_areas, ','), '')),
            lower(btrim(farm.province))
          ) > 0
        )
      )
      and regexp_replace(lower(rider.vehicle_type), '[^a-z0-9]', '', 'g') =
          regexp_replace(
            lower(fulfillment.required_vehicle_type), '[^a-z0-9]', '', 'g'
          )
      and not exists (
        select 1
        from private.rider_delivery_assignments as assignment
        join public.deliveries as active_delivery
          on active_delivery.delivery_id = assignment.delivery_id
        where assignment.rider_id = rider.rider_id
          and active_delivery.delivery_status not in (
            'completed', 'delivered', 'cancelled', 'failed', 'returned'
          )
      )
  )
$$;
revoke all on function private.rider_is_visible_for_delivery(bigint, uuid)
  from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
