begin;
-- Complete the Rider/Delivery ERD contract after the additive normalization
-- migrations. Existing commerce identifiers remain bigint; Rider-owned
-- entities keep the UUID identifiers introduced by the Rider migration.

alter table public.riders
  add column logistics_company_id bigint,
  add column employment_status text not null default 'inactive';
update public.riders
set employment_status = case verification_status
  when 'verified' then 'active'
  when 'suspended' then 'suspended'
  else 'inactive'
end;
alter table public.riders
  add constraint riders_logistics_company_fk
    foreign key (logistics_company_id)
    references public.logistics_companies (logistics_company_id)
    on update restrict on delete set null,
  add constraint riders_employment_status_check check (
    employment_status in ('active','inactive','suspended')
  );
alter table public.deliveries
  add column logistics_company_id bigint;
-- The legacy ERD placed delivery_id on logistics_companies. Retain every
-- company row and move the ownership reference to the many-side. If malformed
-- legacy data associates several company records with one delivery, the oldest
-- company identifier is selected deterministically.
with legacy_owner as (
  select distinct on (company.delivery_id)
    company.delivery_id, company.logistics_company_id
  from public.logistics_companies as company
  order by company.delivery_id, company.logistics_company_id
)
update public.deliveries as delivery
set logistics_company_id = owner.logistics_company_id
from legacy_owner as owner
where owner.delivery_id = delivery.delivery_id
  and delivery.logistics_company_id is null;
alter table public.deliveries
  add constraint deliveries_logistics_company_fk
    foreign key (logistics_company_id)
    references public.logistics_companies (logistics_company_id)
    on update restrict on delete set null;
alter table public.logistics_companies
  drop constraint if exists logistics_companies_deliveries_fk,
  drop column if exists delivery_id;
alter table public.rider_vehicles
  drop constraint if exists rider_vehicles_one_per_rider;
alter table public.rider_documents
  rename column file_url to file_path;
alter table public.riders
  drop constraint if exists riders_delivery_status_check;
update public.riders
set delivery_status = 'going_to_delivery'
where delivery_status = 'going_to_buyer';
alter table public.riders
  add constraint riders_delivery_status_check check (
    delivery_status in (
      'waiting','assigned','going_to_pickup','arrived_at_pickup','picked_up',
      'going_to_delivery','arrived_at_delivery','completed'
    )
  );
create or replace function private.rider_delivery_transition_allowed(
  previous_status text,
  next_status text
) returns boolean language sql immutable set search_path = '' as $$
  select previous_status = next_status or (previous_status, next_status) in (
    ('waiting','assigned'), ('assigned','waiting'),
    ('assigned','going_to_pickup'),
    ('going_to_pickup','arrived_at_pickup'),
    ('arrived_at_pickup','picked_up'),
    ('picked_up','going_to_delivery'),
    ('going_to_delivery','arrived_at_delivery'),
    ('arrived_at_delivery','completed'),
    ('completed','waiting'), ('completed','assigned')
  )
$$;
create or replace function private.sync_rider_account_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.riders
  set employment_status = case new.verification_status
    when 'verified' then 'active'
    when 'suspended' then 'suspended'
    else 'inactive'
  end
  where rider_id = new.rider_id
    and employment_status is distinct from case new.verification_status
      when 'verified' then 'active'
      when 'suspended' then 'suspended'
      else 'inactive'
    end;
  update public.users as app_user
  set account_status = case new.verification_status
      when 'verified' then 'active'
      when 'rejected' then 'rejected'
      when 'suspended' then 'suspended'
      else 'pending'
    end,
    updated_at = now()
  from private.auth_identities as identity
  where identity.auth_user_id = new.auth_id
    and app_user.user_id = identity.user_id;
  return new;
end;
$$;
alter table public.delivery_payment
  rename to delivery_payments;
alter table public.delivery_payments
  rename column payment_id to delivery_payment_id;
create index riders_logistics_company_id_idx
  on public.riders (logistics_company_id);
create index riders_employment_status_idx
  on public.riders (employment_status);
create index rider_vehicles_rider_id_idx
  on public.rider_vehicles (rider_id);
create index deliveries_logistics_company_id_idx
  on public.deliveries (logistics_company_id);
create index delivery_locations_delivery_id_idx
  on public.delivery_locations (delivery_id);
create index delivery_proofs_delivery_id_idx
  on public.delivery_proofs (delivery_id);
-- Every mutable entity carrying updated_at uses the shared trigger.
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute function public.set_updated_at();
create trigger delivery_locations_set_updated_at
before update on public.delivery_locations
for each row execute function public.set_updated_at();
create trigger delivery_requirements_set_updated_at
before update on public.delivery_requirements
for each row execute function public.set_updated_at();
create trigger delivery_proofs_set_updated_at
before update on public.delivery_proofs
for each row execute function public.set_updated_at();
create trigger delivery_payments_set_updated_at
before update on public.delivery_payments
for each row execute function public.set_updated_at();
-- Recreate functions whose PL/pgSQL bodies referenced the renamed payment
-- table. Their public signatures remain stable for deployed Flutter clients.
create or replace function public.calculate_delivery_earning(
  p_delivery_id bigint
) returns public.delivery_payments language plpgsql security definer
set search_path = '' as $$
declare payment public.delivery_payments%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Administrator required';
  end if;
  update public.delivery_payments set
    final_earning = greatest(
      delivery_fee + additional_fee - deduction_amount, 0
    ),
    earning_status = 'calculated',
    updated_at = now()
  where delivery_id = p_delivery_id
  returning * into payment;
  return payment;
end;
$$;
create or replace function public.create_delivery(
  p_delivery jsonb,
  p_locations jsonb default '[]'::jsonb,
  p_requirement jsonb default null,
  p_payment jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  created public.deliveries%rowtype;
  fee numeric;
  extra numeric;
  deduction numeric;
  pickup_count integer;
  dropoff_count integer;
begin
  if not private.is_admin() then
    raise exception 'Administrator required';
  end if;
  select count(*) filter (where item ->> 'location_type' = 'pickup'),
    count(*) filter (where item ->> 'location_type' = 'dropoff')
  into pickup_count, dropoff_count
  from jsonb_array_elements(coalesce(p_locations, '[]'::jsonb)) as item;
  if pickup_count < 1 or dropoff_count < 1 then
    raise exception 'A pickup and drop-off location are required'
      using errcode = '22023';
  end if;

  insert into public.deliveries (
    order_id, rider_id, logistics_company_id, delivery_status, priority,
    total_weight_kg, required_capacity_kg, distance_km,
    estimated_travel_minutes, pickup_deadline, delivery_deadline,
    estimated_delivery_at, available_at, expires_at, service_area
  ) values (
    (p_delivery ->> 'order_id')::bigint,
    nullif(p_delivery ->> 'rider_id', '')::uuid,
    nullif(p_delivery ->> 'logistics_company_id', '')::bigint,
    coalesce(p_delivery ->> 'delivery_status', 'pending'),
    coalesce(p_delivery ->> 'priority', 'normal'),
    coalesce((p_delivery ->> 'total_weight_kg')::numeric, 0),
    nullif(p_delivery ->> 'required_capacity_kg', '')::numeric,
    nullif(p_delivery ->> 'distance_km', '')::numeric,
    nullif(p_delivery ->> 'estimated_travel_minutes', '')::integer,
    nullif(p_delivery ->> 'pickup_deadline', '')::timestamptz,
    nullif(p_delivery ->> 'delivery_deadline', '')::timestamptz,
    nullif(p_delivery ->> 'estimated_delivery_at', '')::timestamptz,
    nullif(p_delivery ->> 'available_at', '')::timestamptz,
    nullif(p_delivery ->> 'expires_at', '')::timestamptz,
    p_delivery ->> 'service_area'
  ) returning * into created;

  insert into public.delivery_locations (
    delivery_id, location_type, address, latitude, longitude,
    contact_name, contact_number, instructions, sequence_number
  ) select created.delivery_id, item.location_type, item.address,
    item.latitude, item.longitude, item.contact_name, item.contact_number,
    item.instructions, coalesce(item.sequence_number, 1)
  from jsonb_to_recordset(coalesce(p_locations, '[]'::jsonb)) as item(
    location_type text, address text, latitude double precision,
    longitude double precision, contact_name text, contact_number text,
    instructions text, sequence_number integer
  );

  if p_requirement is not null then
    insert into public.delivery_requirements (
      delivery_id, required_vehicle_type, minimum_capacity_kg,
      package_length_cm, package_width_cm, package_height_cm,
      requires_cooling, requires_fragile_handling,
      requires_waterproof_cover, requires_special_handling,
      handling_notes, cancellation_conditions
    ) values (
      created.delivery_id, p_requirement ->> 'required_vehicle_type',
      nullif(p_requirement ->> 'minimum_capacity_kg', '')::numeric,
      nullif(p_requirement ->> 'package_length_cm', '')::numeric,
      nullif(p_requirement ->> 'package_width_cm', '')::numeric,
      nullif(p_requirement ->> 'package_height_cm', '')::numeric,
      coalesce((p_requirement ->> 'requires_cooling')::boolean, false),
      coalesce(
        (p_requirement ->> 'requires_fragile_handling')::boolean, false
      ),
      coalesce(
        (p_requirement ->> 'requires_waterproof_cover')::boolean, false
      ),
      coalesce(
        (p_requirement ->> 'requires_special_handling')::boolean, false
      ),
      p_requirement ->> 'handling_notes',
      p_requirement ->> 'cancellation_conditions'
    );
  end if;

  fee := greatest(coalesce((p_payment ->> 'delivery_fee')::numeric, 0), 0);
  extra := greatest(
    coalesce((p_payment ->> 'additional_fee')::numeric, 0), 0
  );
  deduction := greatest(
    coalesce((p_payment ->> 'deduction_amount')::numeric, 0), 0
  );
  insert into public.delivery_payments (
    delivery_id, delivery_fee, additional_fee, deduction_amount,
    final_earning
  ) values (
    created.delivery_id, fee, extra, deduction,
    greatest(fee + extra - deduction, 0)
  );
  return to_jsonb(created);
end;
$$;
create or replace function public.accept_delivery(
  p_delivery_id bigint,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_rider uuid := private.current_rider_id();
  delivery public.deliveries%rowtype;
  replay boolean := false;
  active_count integer;
  active_limit integer;
begin
  if current_rider is null then
    raise exception 'Rider identity required';
  end if;
  select * into delivery from public.deliveries
  where delivery_id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found';
  end if;
  if delivery.rider_id = current_rider
     and delivery.delivery_status = 'accepted' then
    replay := true;
  elsif delivery.rider_id is not null
     or delivery.delivery_status <> 'available' then
    raise exception 'Delivery is no longer available' using errcode = '40001';
  elsif delivery.expires_at is not null and delivery.expires_at <= now() then
    raise exception 'Delivery request expired' using errcode = '22023';
  else
    if not exists (
      select 1 from public.riders as rider
      where rider.rider_id = current_rider
        and rider.verification_status = 'verified'
        and rider.employment_status = 'active'
        and rider.availability_status = 'online'
    ) then
      raise exception 'Rider is not eligible and available'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.delivery_requirements as requirement
      where requirement.delivery_id = p_delivery_id
        and not exists (
          select 1
          from public.rider_vehicles as vehicle
          where vehicle.rider_id = current_rider
            and vehicle.verification_status = 'verified'
            and (
              requirement.minimum_capacity_kg is null
              or vehicle.capacity_kg >= requirement.minimum_capacity_kg
            )
            and (
              requirement.required_vehicle_type is null
              or lower(replace(vehicle.vehicle_type, '-', '')) =
                lower(replace(requirement.required_vehicle_type, '-', ''))
            )
        )
    ) then
      raise exception 'No verified Rider vehicle meets delivery requirements'
        using errcode = '22023';
    end if;
    select greatest(maximum_active_deliveries, 1) into active_limit
    from public.riders where rider_id = current_rider;
    select count(*) into active_count from public.deliveries
    where rider_id = current_rider
      and delivery_status not in ('completed','cancelled','failed');
    if active_count >= coalesce(active_limit, 1) then
      raise exception 'Active delivery limit reached' using errcode = '22023';
    end if;
    update public.deliveries set
      rider_id = current_rider,
      delivery_status = 'accepted',
      accepted_at = now()
    where delivery_id = p_delivery_id
    returning * into delivery;
    insert into private.rider_delivery_assignments (
      delivery_id, rider_id, assigned_at
    ) values (p_delivery_id, current_rider, now())
    on conflict (delivery_id) do update set
      rider_id = excluded.rider_id,
      assigned_at = excluded.assigned_at;
    update public.riders set
      availability_status = 'busy',
      delivery_status = 'assigned'
    where rider_id = current_rider;
  end if;
  return to_jsonb(delivery) || jsonb_build_object(
    'is_idempotent_replay', replay,
    'idempotency_key', p_idempotency_key
  );
end;
$$;
-- Removing the one-vehicle constraint requires an idempotent registration
-- function that updates the Rider's initial vehicle explicitly.
create or replace function public.create_current_rider_registration(
  rider_payload jsonb,
  vehicle_payload jsonb,
  location_payload jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  application_user_id bigint := private.current_user_id();
  account_email text;
  target_rider public.riders%rowtype;
  target_vehicle public.rider_vehicles%rowtype;
  target_location public.rider_locations%rowtype;
  normalized_plate text;
begin
  if authenticated_user_id is null or application_user_id is null then
    raise exception 'An authenticated Rider account is required';
  end if;
  if not exists (
    select 1 from public.users
    where user_id = application_user_id and account_role = 'rider'
  ) then
    raise exception 'The authenticated account is not registered as a Rider';
  end if;
  select lower(email) into account_email
  from auth.users where id = authenticated_user_id;
  normalized_plate := upper(
    nullif(btrim(vehicle_payload ->> 'plate_number'), '')
  );
  if normalized_plate is null then
    normalized_plate := 'NO-PLATE-' || upper(substr(
      replace(authenticated_user_id::text, '-', ''), 1, 12
    ));
  end if;

  insert into public.riders (
    rider_id, auth_id, first_name, middle_name, last_name, email,
    contact_number, date_of_birth, gender, profile_photo_url, region,
    province, city_municipality, barangay, complete_address,
    service_radius_km
  ) values (
    authenticated_user_id, authenticated_user_id,
    btrim(rider_payload ->> 'first_name'),
    nullif(btrim(rider_payload ->> 'middle_name'), ''),
    btrim(rider_payload ->> 'last_name'), account_email,
    btrim(rider_payload ->> 'contact_number'),
    (rider_payload ->> 'date_of_birth')::date,
    btrim(rider_payload ->> 'gender'), null,
    btrim(rider_payload ->> 'region'), btrim(rider_payload ->> 'province'),
    btrim(rider_payload ->> 'city_municipality'),
    btrim(rider_payload ->> 'barangay'),
    btrim(rider_payload ->> 'complete_address'),
    (rider_payload ->> 'service_radius_km')::numeric
  ) on conflict (auth_id) do update set
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    contact_number = excluded.contact_number,
    date_of_birth = excluded.date_of_birth,
    gender = excluded.gender,
    region = excluded.region,
    province = excluded.province,
    city_municipality = excluded.city_municipality,
    barangay = excluded.barangay,
    complete_address = excluded.complete_address,
    service_radius_km = excluded.service_radius_km
  returning * into target_rider;

  update private.auth_identities as identity
  set rider_id = target_rider.rider_id
  where identity.auth_user_id = authenticated_user_id;

  select * into target_vehicle
  from public.rider_vehicles
  where rider_id = target_rider.rider_id
  order by created_at, vehicle_id
  limit 1
  for update;

  if target_vehicle.vehicle_id is null then
    insert into public.rider_vehicles (
      rider_id, vehicle_type, vehicle_brand, vehicle_model, vehicle_color,
      plate_number, registration_number, capacity_kg, handling_capability
    ) values (
      target_rider.rider_id, btrim(vehicle_payload ->> 'vehicle_type'),
      nullif(btrim(vehicle_payload ->> 'vehicle_brand'), ''),
      btrim(vehicle_payload ->> 'vehicle_model'),
      btrim(vehicle_payload ->> 'vehicle_color'), normalized_plate,
      nullif(upper(btrim(vehicle_payload ->> 'registration_number')), ''),
      (vehicle_payload ->> 'capacity_kg')::numeric,
      nullif(btrim(vehicle_payload ->> 'handling_capability'), '')
    ) returning * into target_vehicle;
  else
    update public.rider_vehicles set
      vehicle_type = btrim(vehicle_payload ->> 'vehicle_type'),
      vehicle_brand = nullif(btrim(vehicle_payload ->> 'vehicle_brand'), ''),
      vehicle_model = btrim(vehicle_payload ->> 'vehicle_model'),
      vehicle_color = btrim(vehicle_payload ->> 'vehicle_color'),
      plate_number = normalized_plate,
      registration_number = nullif(
        upper(btrim(vehicle_payload ->> 'registration_number')), ''
      ),
      capacity_kg = (vehicle_payload ->> 'capacity_kg')::numeric,
      handling_capability = nullif(
        btrim(vehicle_payload ->> 'handling_capability'), ''
      )
    where vehicle_id = target_vehicle.vehicle_id
    returning * into target_vehicle;
  end if;

  if location_payload is not null
     and jsonb_typeof(location_payload) = 'object'
     and location_payload ? 'latitude'
     and location_payload ? 'longitude' then
    insert into public.rider_locations (
      rider_id, latitude, longitude, accuracy_meters, heading, speed_kph,
      location_updated_at
    ) values (
      target_rider.rider_id,
      (location_payload ->> 'latitude')::double precision,
      (location_payload ->> 'longitude')::double precision,
      (location_payload ->> 'accuracy_meters')::double precision,
      (location_payload ->> 'heading')::double precision,
      (location_payload ->> 'speed_kph')::double precision,
      coalesce(
        (location_payload ->> 'location_updated_at')::timestamptz, now()
      )
    ) on conflict (rider_id) do update set
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      accuracy_meters = excluded.accuracy_meters,
      heading = excluded.heading,
      speed_kph = excluded.speed_kph,
      location_updated_at = excluded.location_updated_at
    returning * into target_location;
  end if;

  update public.users set rider_application = null, updated_at = now()
  where user_id = application_user_id;
  return jsonb_build_object(
    'rider', to_jsonb(target_rider),
    'vehicle', to_jsonb(target_vehicle),
    'location', case when target_location.location_id is null then null
      else to_jsonb(target_location) end
  );
end;
$$;
-- Refuse destructive cleanup until every legacy delivery has its normalized
-- pickup, drop-off, and Rider earning row. This makes deployed data correction
-- explicit while allowing clean/fresh environments to migrate automatically.
do $$
declare
  incomplete_ids bigint[];
begin
  select array_agg(delivery.delivery_id order by delivery.delivery_id)
  into incomplete_ids
  from public.deliveries as delivery
  where not exists (
    select 1 from public.delivery_locations as location
    where location.delivery_id = delivery.delivery_id
      and location.location_type = 'pickup'
  ) or not exists (
    select 1 from public.delivery_locations as location
    where location.delivery_id = delivery.delivery_id
      and location.location_type = 'dropoff'
  ) or not exists (
    select 1 from public.delivery_payments as payment
    where payment.delivery_id = delivery.delivery_id
  );
  if incomplete_ids is not null then
    raise exception
      'Legacy delivery cleanup blocked; normalize deliveries: %',
      incomplete_ids;
  end if;
end;
$$;
alter table public.deliveries
  drop column if exists pickup_location,
  drop column if exists dropoff_location,
  drop column if exists pickup_lat,
  drop column if exists pickup_long,
  drop column if exists dropoff_lat,
  drop column if exists dropoff_long,
  drop column if exists pickup_instructions,
  drop column if exists delivery_instructions,
  drop column if exists required_vehicle_types,
  drop column if exists vehicle_type,
  drop column if exists handling_requirements,
  drop column if exists package_dimensions,
  drop column if exists cancellation_conditions,
  drop column if exists transport_compatibility_group,
  drop column if exists transport_compatibility_groups,
  drop column if exists requires_exclusive_transport,
  drop column if exists route_payload,
  drop column if exists workflow_state,
  drop column if exists proof_references,
  drop column if exists status_history,
  drop column if exists problem_records,
  drop column if exists offline_actions,
  drop column if exists batch_reference,
  drop column if exists pickup_sequence,
  drop column if exists delivery_sequence,
  drop column if exists batch_route,
  drop column if exists delivery_fee,
  drop column if exists estimated_earning,
  drop column if exists final_earning,
  drop column if exists earning_breakdown,
  drop column if exists earning_status,
  drop column if exists payout_status,
  drop column if exists fee_breakdown,
  drop column if exists pickup_to_delivery_distance_km,
  drop column if exists pickup_to_delivery_minutes,
  drop column if exists estimated_delivery_time,
  drop column if exists actual_delivery_time,
  drop column if exists vehicle_types,
  drop column if exists cold_chain_available;
-- Preserve least-privilege grants after the table/column renames.
revoke all on public.delivery_payments from anon, authenticated;
grant select on public.delivery_payments to authenticated;
grant execute on function public.calculate_delivery_earning(bigint)
  to authenticated;
grant execute on function public.accept_delivery(bigint,uuid)
  to authenticated;
grant execute on function public.create_delivery(jsonb,jsonb,jsonb,jsonb)
  to authenticated;
grant execute on function public.create_current_rider_registration(
  jsonb,jsonb,jsonb
) to authenticated;
comment on table public.delivery_payments is
  'Rider earning and payout for a delivery; separate from Buyer order payments.';
comment on column public.rider_documents.file_path is
  'Private rider-documents Storage object path; never a public URL.';
commit;
