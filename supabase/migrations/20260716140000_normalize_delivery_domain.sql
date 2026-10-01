begin;
create extension if not exists pgcrypto with schema extensions;
-- Parent identifiers remain bigint because orders, riders, auth identities,
-- logistics companies, and existing deliveries already use bigint keys.
-- New child records use UUID primary keys without rewriting those parents.
alter table public.deliveries
  add column if not exists rider_id bigint,
  add column if not exists vehicle_type text,
  add column if not exists estimated_delivery_at timestamptz,
  add column if not exists actual_delivery_at timestamptz,
  add column if not exists accepted_at timestamptz;
update public.deliveries delivery
set rider_id = assignment.rider_id
from private.rider_delivery_assignments assignment
where assignment.delivery_id = delivery.delivery_id
  and delivery.rider_id is null;
update public.deliveries
set workflow_state = jsonb_build_object(
      'legacy_delivery_status', delivery_status
    ) || coalesce(workflow_state, '{}'::jsonb),
  delivery_status = case lower(coalesce(delivery_status, 'pending'))
    when 'ready_for_pickup' then 'available'
    when 'reserved' then 'available'
    when 'waiting_for_product' then 'arrived_at_pickup'
    when 'pickup_confirmation_required' then 'arrived_at_pickup'
    when 'product_picked_up' then 'picked_up'
    when 'going_to_buyer' then 'going_to_delivery'
    when 'waiting_for_buyer' then 'arrived_at_delivery'
    when 'delivery_confirmation_required' then 'arrived_at_delivery'
    when 'product_delivered' then 'completed'
    when 'delivery_completed' then 'completed'
    when 'delivered' then 'completed'
    when 'returned' then 'failed'
    when 'reassigned' then 'failed'
    when 'disputed' then 'failed'
    else case
      when lower(coalesce(delivery_status, 'pending')) in (
        'pending','available','accepted','going_to_pickup',
        'arrived_at_pickup','picked_up','going_to_delivery',
        'arrived_at_delivery','completed','cancelled','failed'
      ) then lower(coalesce(delivery_status, 'pending'))
      else 'pending'
    end
  end,
  priority = case lower(coalesce(priority, 'normal'))
    when 'urgent' then 'urgent'
    when 'high' then 'high'
    when 'priority' then 'high'
    when 'same_day' then 'high'
    else 'normal'
  end,
  total_weight_kg = greatest(coalesce(total_weight_kg, 0), 0),
  vehicle_type = coalesce(vehicle_type, vehicle_types),
  estimated_delivery_at = coalesce(
    estimated_delivery_at,
    estimated_delivery_time
  ),
  actual_delivery_at = coalesce(actual_delivery_at, actual_delivery_time),
  updated_at = coalesce(updated_at, now());
alter table public.deliveries
  alter column delivery_status set default 'pending',
  alter column delivery_status set not null,
  alter column priority set default 'normal',
  alter column priority set not null,
  alter column total_weight_kg set default 0,
  alter column total_weight_kg set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_rider_fk'
  ) then
    alter table public.deliveries add constraint deliveries_rider_fk
      foreign key (rider_id) references public.riders (rider_id)
      on update restrict on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_status_check'
  ) then
    alter table public.deliveries add constraint deliveries_status_check check (
      delivery_status in (
        'pending','available','accepted','going_to_pickup',
        'arrived_at_pickup','picked_up','going_to_delivery',
        'arrived_at_delivery','completed','cancelled','failed'
      )
    );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_priority_check'
  ) then
    alter table public.deliveries add constraint deliveries_priority_check
      check (priority in ('normal','urgent','high'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_weight_check'
  ) then
    alter table public.deliveries add constraint deliveries_weight_check
      check (
        total_weight_kg >= 0
        and (required_capacity_kg is null or required_capacity_kg > 0)
        and (distance_km is null or distance_km >= 0)
        and (
          estimated_travel_minutes is null
          or estimated_travel_minutes >= 0
        )
      );
  end if;
end;
$$;
create index if not exists deliveries_rider_id_idx
  on public.deliveries (rider_id);
create index if not exists deliveries_available_idx
  on public.deliveries (delivery_status, available_at, expires_at)
  where rider_id is null;
create table if not exists public.delivery_locations (
  location_id uuid primary key default extensions.gen_random_uuid(),
  delivery_id bigint not null references public.deliveries (delivery_id)
    on delete cascade,
  location_type text not null check (location_type in ('pickup','dropoff')),
  address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  contact_name text,
  contact_number text,
  instructions text,
  sequence_number integer not null default 1 check (sequence_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_id, location_type, sequence_number)
);
create table if not exists public.delivery_requirements (
  requirement_id uuid primary key default extensions.gen_random_uuid(),
  delivery_id bigint not null unique references public.deliveries (delivery_id)
    on delete cascade,
  required_vehicle_type text,
  minimum_capacity_kg numeric,
  package_length_cm numeric,
  package_width_cm numeric,
  package_height_cm numeric,
  requires_cooling boolean not null default false,
  requires_fragile_handling boolean not null default false,
  requires_waterproof_cover boolean not null default false,
  requires_special_handling boolean not null default false,
  handling_notes text,
  cancellation_conditions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_capacity_kg is null or minimum_capacity_kg > 0),
  check (package_length_cm is null or package_length_cm > 0),
  check (package_width_cm is null or package_width_cm > 0),
  check (package_height_cm is null or package_height_cm > 0)
);
create table if not exists public.delivery_status_history (
  status_history_id uuid primary key default extensions.gen_random_uuid(),
  delivery_id bigint not null references public.deliveries (delivery_id)
    on delete cascade,
  previous_status text,
  new_status text not null,
  remarks text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    previous_status is null or previous_status in (
      'pending','available','accepted','going_to_pickup',
      'arrived_at_pickup','picked_up','going_to_delivery',
      'arrived_at_delivery','completed','cancelled','failed'
    )
  ),
  check (new_status in (
    'pending','available','accepted','going_to_pickup',
    'arrived_at_pickup','picked_up','going_to_delivery',
    'arrived_at_delivery','completed','cancelled','failed'
  ))
);
create index if not exists delivery_status_history_delivery_changed_idx
  on public.delivery_status_history (delivery_id, changed_at desc);
create unique index if not exists delivery_status_history_event_idx
  on public.delivery_status_history (
    delivery_id, previous_status, new_status, changed_at
  );
create table if not exists public.delivery_proofs (
  proof_id uuid primary key default extensions.gen_random_uuid(),
  delivery_id bigint not null references public.deliveries (delivery_id)
    on delete cascade,
  proof_stage text not null check (proof_stage in ('pickup','delivery')),
  proof_type text not null
    check (proof_type in ('photo','confirmation_code','signature')),
  file_path text,
  confirmation_code_hash text,
  remarks text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (file_path is not null or confirmation_code_hash is not null)
);
create unique index if not exists delivery_proofs_single_secure_type_idx
  on public.delivery_proofs (delivery_id, proof_stage, proof_type)
  where proof_type in ('confirmation_code','signature');
create unique index if not exists delivery_proofs_file_path_idx
  on public.delivery_proofs (delivery_id, proof_stage, file_path)
  where file_path is not null;
create table if not exists public.delivery_payment (
  payment_id uuid primary key default extensions.gen_random_uuid(),
  delivery_id bigint not null unique references public.deliveries (delivery_id)
    on delete cascade,
  delivery_fee numeric not null check (delivery_fee >= 0),
  additional_fee numeric not null default 0 check (additional_fee >= 0),
  deduction_amount numeric not null default 0 check (deduction_amount >= 0),
  final_earning numeric not null check (final_earning >= 0),
  earning_status text not null default 'pending'
    check (earning_status in ('pending','calculated','approved','cancelled')),
  payout_status text not null default 'unpaid'
    check (payout_status in ('unpaid','processing','paid','failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (final_earning = greatest(delivery_fee + additional_fee - deduction_amount, 0))
);
create or replace function private.delivery_positive_numeric(value text)
returns numeric language plpgsql immutable set search_path = '' as $$
declare parsed numeric;
begin
  if value is null or trim(value) = '' then return null; end if;
  parsed := value::numeric;
  return case when parsed > 0 then parsed else null end;
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end;
$$;
create or replace function private.delivery_canonical_status(value text)
returns text language sql immutable set search_path = '' as $$
  select case lower(coalesce(value, 'pending'))
    when 'ready_for_pickup' then 'available'
    when 'reserved' then 'available'
    when 'waiting_for_product' then 'arrived_at_pickup'
    when 'pickup_confirmation_required' then 'arrived_at_pickup'
    when 'product_picked_up' then 'picked_up'
    when 'going_to_buyer' then 'going_to_delivery'
    when 'waiting_for_buyer' then 'arrived_at_delivery'
    when 'delivery_confirmation_required' then 'arrived_at_delivery'
    when 'product_delivered' then 'completed'
    when 'delivery_completed' then 'completed'
    when 'delivered' then 'completed'
    when 'returned' then 'failed'
    when 'reassigned' then 'failed'
    when 'disputed' then 'failed'
    else case
      when lower(coalesce(value, 'pending')) in (
        'pending','available','accepted','going_to_pickup',
        'arrived_at_pickup','picked_up','going_to_delivery',
        'arrived_at_delivery','completed','cancelled','failed'
      ) then lower(coalesce(value, 'pending'))
      else 'pending'
    end
  end
$$;
create or replace function private.delivery_safe_timestamp(
  value text, fallback_value timestamptz
) returns timestamptz language plpgsql stable set search_path = '' as $$
begin
  if value is null or trim(value) = '' then return fallback_value; end if;
  return value::timestamptz;
exception when invalid_datetime_format or datetime_field_overflow then
  return fallback_value;
end;
$$;
create or replace function private.delivery_safe_coordinate(
  value text, minimum_value double precision,
  maximum_value double precision
) returns double precision language plpgsql immutable set search_path = '' as $$
declare parsed double precision;
begin
  if value is null or trim(value) = '' then return null; end if;
  parsed := value::double precision;
  if parsed < minimum_value or parsed > maximum_value then return null; end if;
  return parsed;
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end;
$$;
-- Backfill only complete, valid locations. Prefer the delivery snapshot, then
-- use the order's related farm/buyer coordinates when the legacy snapshot is
-- incomplete. No coordinates are guessed or geocoded during the migration.
with pickup_candidates as (
  select delivery.delivery_id, 1 as source_priority,
    delivery.pickup_location as address,
    delivery.pickup_lat::double precision as latitude,
    delivery.pickup_long::double precision as longitude,
    delivery.pickup_instructions as instructions
  from public.deliveries as delivery
  where nullif(trim(delivery.pickup_location), '') is not null
    and delivery.pickup_lat between -90 and 90
    and delivery.pickup_long between -180 and 180
  union all
  select delivery.delivery_id, 2,
    farm.farm_location,
    farm.gps_lat::double precision,
    farm.gps_long::double precision,
    delivery.pickup_instructions
  from public.deliveries as delivery
  join public.orders as order_record
    on order_record.order_id = delivery.order_id
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.commodities as commodity
    on commodity.commodity_id = cart_item.commodity_id
  join public.farms as farm on farm.farm_id = commodity.farm_id
  where nullif(trim(farm.farm_location), '') is not null
    and farm.gps_lat between -90 and 90
    and farm.gps_long between -180 and 180
), preferred_pickups as (
  select distinct on (delivery_id)
    delivery_id, address, latitude, longitude, instructions
  from pickup_candidates
  order by delivery_id, source_priority
)
insert into public.delivery_locations (
  delivery_id, location_type, address, latitude, longitude, instructions
)
select delivery_id, 'pickup', address, latitude, longitude, instructions
from preferred_pickups
on conflict (delivery_id, location_type, sequence_number) do nothing;
with dropoff_candidates as (
  select delivery.delivery_id, 1 as source_priority,
    delivery.dropoff_location as address,
    delivery.dropoff_lat::double precision as latitude,
    delivery.dropoff_long::double precision as longitude,
    delivery.delivery_instructions as instructions
  from public.deliveries as delivery
  where nullif(trim(delivery.dropoff_location), '') is not null
    and delivery.dropoff_lat between -90 and 90
    and delivery.dropoff_long between -180 and 180
  union all
  select delivery.delivery_id, 2,
    coalesce(
      nullif(trim(order_record.delivery_address), ''),
      buyer.shipping_address
    ),
    buyer.gps_lat::double precision,
    buyer.gps_long::double precision,
    delivery.delivery_instructions
  from public.deliveries as delivery
  join public.orders as order_record
    on order_record.order_id = delivery.order_id
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  join public.buyers as buyer on buyer.buyer_user_id = cart.buyer_user_id
  where coalesce(
      nullif(trim(order_record.delivery_address), ''),
      nullif(trim(buyer.shipping_address), '')
    ) is not null
    and buyer.gps_lat between -90 and 90
    and buyer.gps_long between -180 and 180
), preferred_dropoffs as (
  select distinct on (delivery_id)
    delivery_id, address, latitude, longitude, instructions
  from dropoff_candidates
  order by delivery_id, source_priority
)
insert into public.delivery_locations (
  delivery_id, location_type, address, latitude, longitude, instructions
)
select delivery_id, 'dropoff', address, latitude, longitude, instructions
from preferred_dropoffs
on conflict (delivery_id, location_type, sequence_number) do nothing;
insert into public.delivery_requirements (
  delivery_id, required_vehicle_type, minimum_capacity_kg,
  package_length_cm, package_width_cm, package_height_cm,
  requires_cooling, requires_fragile_handling,
  requires_waterproof_cover, requires_special_handling,
  handling_notes, cancellation_conditions
)
select delivery_id,
  coalesce(required_vehicle_types[1], vehicle_types),
  case when required_capacity_kg > 0 then required_capacity_kg end,
  private.delivery_positive_numeric(coalesce(
    package_dimensions ->> 'length_cm', package_dimensions ->> 'lengthCm'
  )),
  private.delivery_positive_numeric(coalesce(
    package_dimensions ->> 'width_cm', package_dimensions ->> 'widthCm'
  )),
  private.delivery_positive_numeric(coalesce(
    package_dimensions ->> 'height_cm', package_dimensions ->> 'heightCm'
  )),
  coalesce(cold_chain_available, false),
  handling_requirements::text ilike '%fragile%',
  handling_requirements::text ilike any (array['%keepDry%','%keep_dry%','%waterproof%']),
  handling_requirements <> '[]'::jsonb,
  nullif(handling_requirements::text, '[]'),
  cancellation_conditions
from public.deliveries
on conflict (delivery_id) do nothing;
insert into public.delivery_payment (
  delivery_id, delivery_fee, additional_fee, deduction_amount,
  final_earning, earning_status, payout_status, created_at, updated_at
)
select delivery_id,
  greatest(coalesce(delivery_fee, estimated_earning, 0), 0),
  greatest(
    coalesce(final_earning, estimated_earning, delivery_fee, 0)
      - coalesce(delivery_fee, estimated_earning, 0),
    0
  ),
  greatest(
    coalesce(delivery_fee, estimated_earning, 0)
      - coalesce(final_earning, estimated_earning, delivery_fee, 0),
    0
  ),
  greatest(coalesce(final_earning, estimated_earning, delivery_fee, 0), 0),
  case when earning_status in ('pending','calculated','approved','cancelled')
    then earning_status when earning_status = 'finalized' then 'approved'
    else 'pending' end,
  case when payout_status in ('unpaid','processing','paid','failed')
    then payout_status when payout_status = 'pending' then 'unpaid' else 'unpaid' end,
  created_at,
  updated_at
from public.deliveries
on conflict (delivery_id) do nothing;
insert into public.delivery_status_history (
  delivery_id, previous_status, new_status, remarks,
  latitude, longitude, changed_at, created_at
)
select delivery.delivery_id,
  case when coalesce(event ->> 'previous_status', event ->> 'previousStatus')
      is null then null else private.delivery_canonical_status(
        coalesce(event ->> 'previous_status', event ->> 'previousStatus')
      ) end,
  private.delivery_canonical_status(
    coalesce(event ->> 'new_status', event ->> 'newStatus')
  ),
  coalesce(event ->> 'remarks', event ->> 'note'),
  private.delivery_safe_coordinate(event ->> 'latitude', -90, 90),
  private.delivery_safe_coordinate(event ->> 'longitude', -180, 180),
  private.delivery_safe_timestamp(
    coalesce(event ->> 'changed_at', event ->> 'timestamp'),
    coalesce(delivery.updated_at, delivery.created_at)
  ),
  delivery.created_at
from public.deliveries delivery
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(delivery.status_history) = 'array'
    then delivery.status_history else '[]'::jsonb end
) event
where coalesce(event ->> 'new_status', event ->> 'newStatus') is not null
on conflict do nothing;
insert into public.delivery_status_history (
  delivery_id, previous_status, new_status, remarks, changed_at, created_at
)
select delivery_id, null, delivery_status,
  'Initial history record created during delivery normalization',
  coalesce(updated_at, created_at), created_at
from public.deliveries delivery
where not exists (
  select 1 from public.delivery_status_history history
  where history.delivery_id = delivery.delivery_id
    and history.new_status = delivery.delivery_status
    and history.changed_at = coalesce(delivery.updated_at, delivery.created_at)
);
insert into public.delivery_proofs (
  delivery_id, proof_stage, proof_type, file_path, created_at, updated_at
)
select delivery.delivery_id,
  case when lower(reference.value) like '%pickup%' then 'pickup' else 'delivery' end,
  case when lower(reference.value) like '%signature%' then 'signature'
    else 'photo' end,
  reference.value, delivery.created_at, delivery.updated_at
from public.deliveries delivery
cross join lateral (
  select trim(both '"' from item::text) as value
  from jsonb_array_elements(
    case when jsonb_typeof(delivery.proof_references) = 'array'
      then delivery.proof_references else '[]'::jsonb end
  ) item
) reference
where reference.value <> ''
  and lower(reference.value) not like '%code%'
on conflict do nothing;
create or replace function private.rider_owns_delivery(target_delivery_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deliveries delivery
    where delivery.delivery_id = target_delivery_id
      and delivery.rider_id = private.current_rider_id()
  )
$$;
create or replace function private.rider_can_view_delivery(target_delivery_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deliveries delivery
    where delivery.delivery_id = target_delivery_id
      and (
        delivery.rider_id = private.current_rider_id()
        or (
        delivery.delivery_status = 'available'
          and delivery.rider_id is null
          and private.current_rider_id() is not null
          and (delivery.available_at is null or delivery.available_at <= now())
          and (delivery.expires_at is null or delivery.expires_at > now())
          and exists (
            select 1
            from public.riders rider
            left join public.delivery_requirements requirement
              on requirement.delivery_id = delivery.delivery_id
            where rider.rider_id = private.current_rider_id()
              and rider.employment_status = 'active'
              and (
                nullif(trim(delivery.service_area), '') is null
                or lower(trim(delivery.service_area)) in (
                  lower(trim(coalesce(rider.service_area, ''))),
                  lower(trim(coalesce(rider.city, '')))
                )
              )
              and (
                requirement.minimum_capacity_kg is null
                or requirement.minimum_capacity_kg <= coalesce(rider.capacity_kg, 0)
              )
              and (
                requirement.required_vehicle_type is null
                or lower(replace(requirement.required_vehicle_type, '-', '')) =
                  lower(replace(coalesce(rider.vehicle_type, ''), '-', ''))
              )
          )
        )
      )
  )
$$;
create or replace function private.storage_delivery_id(object_name text)
returns bigint language plpgsql immutable security definer set search_path = '' as $$
declare segment text;
begin
  segment := (storage.foldername(object_name))[2];
  if segment is null or segment !~ '^[0-9]+$' then return null; end if;
  return segment::bigint;
end;
$$;
create or replace function private.delivery_transition_allowed(
  old_status text, requested_status text
) returns boolean language sql immutable set search_path = '' as $$
  select requested_status = case old_status
    when 'pending' then 'available'
    when 'available' then 'accepted'
    when 'accepted' then 'going_to_pickup'
    when 'going_to_pickup' then 'arrived_at_pickup'
    when 'arrived_at_pickup' then 'picked_up'
    when 'picked_up' then 'going_to_delivery'
    when 'going_to_delivery' then 'arrived_at_delivery'
    when 'arrived_at_delivery' then 'completed'
  end or (
    requested_status = 'cancelled'
    and old_status in ('pending','available','accepted','going_to_pickup','arrived_at_pickup')
  ) or (
    requested_status = 'failed'
    and old_status in ('accepted','going_to_pickup','arrived_at_pickup','picked_up','going_to_delivery','arrived_at_delivery')
  )
$$;
create or replace function private.prepare_delivery_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.delivery_status is distinct from old.delivery_status
    and not private.delivery_transition_allowed(
      old.delivery_status, new.delivery_status
    ) then
    raise exception 'Invalid delivery transition from % to %',
      old.delivery_status, new.delivery_status using errcode = '23514';
  end if;
  new.updated_at := now();
  if new.delivery_status = 'accepted' and old.delivery_status <> 'accepted' then
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;
  if new.delivery_status = 'completed' then
    new.actual_delivery_at := coalesce(new.actual_delivery_at, now());
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.delivery_status in ('cancelled','failed') then
    new.closed_at := coalesce(new.closed_at, now());
  end if;
  return new;
end;
$$;
create or replace function private.record_delivery_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.delivery_status is distinct from old.delivery_status then
    insert into public.delivery_status_history (
      delivery_id, previous_status, new_status, remarks, latitude, longitude
    ) values (
      new.delivery_id, old.delivery_status, new.delivery_status,
      nullif(current_setting('app.delivery_remarks', true), ''),
      nullif(current_setting('app.delivery_latitude', true), '')::double precision,
      nullif(current_setting('app.delivery_longitude', true), '')::double precision
    );
  end if;
  return new;
end;
$$;
drop trigger if exists deliveries_prepare_status_change on public.deliveries;
create trigger deliveries_prepare_status_change before update
  on public.deliveries for each row
  execute function private.prepare_delivery_status_change();
drop trigger if exists deliveries_record_status_change on public.deliveries;
create trigger deliveries_record_status_change after update
  on public.deliveries for each row
  execute function private.record_delivery_status_change();
create or replace function private.record_initial_delivery_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.delivery_status_history (
    delivery_id, previous_status, new_status, remarks,
    changed_at, created_at
  ) values (
    new.delivery_id, null, new.delivery_status,
    'Delivery created', new.created_at, new.created_at
  );
  return new;
end;
$$;
drop trigger if exists deliveries_record_initial_status on public.deliveries;
create trigger deliveries_record_initial_status after insert
  on public.deliveries for each row
  execute function private.record_initial_delivery_status();
create or replace function public.create_delivery(
  p_delivery jsonb, p_locations jsonb default '[]'::jsonb,
  p_requirement jsonb default null, p_payment jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare created public.deliveries%rowtype;
declare fee numeric;
declare extra numeric;
declare deduction numeric;
declare pickup_count integer;
declare dropoff_count integer;
begin
  if not private.is_admin() then raise exception 'Administrator required'; end if;
  select count(*) filter (where item ->> 'location_type' = 'pickup'),
    count(*) filter (where item ->> 'location_type' = 'dropoff')
  into pickup_count, dropoff_count
  from jsonb_array_elements(coalesce(p_locations, '[]'::jsonb)) item;
  if pickup_count < 1 or dropoff_count < 1 then
    raise exception 'A pickup and drop-off location are required'
      using errcode = '22023';
  end if;
  insert into public.deliveries (
    order_id, rider_id, delivery_status, priority, vehicle_type,
    total_weight_kg, required_capacity_kg, distance_km,
    estimated_travel_minutes, pickup_deadline, delivery_deadline,
    estimated_delivery_at, available_at, expires_at, service_area
  ) values (
    (p_delivery ->> 'order_id')::bigint,
    nullif(p_delivery ->> 'rider_id', '')::bigint,
    coalesce(p_delivery ->> 'delivery_status', 'pending'),
    coalesce(p_delivery ->> 'priority', 'normal'),
    p_delivery ->> 'vehicle_type',
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
      coalesce((p_requirement ->> 'requires_fragile_handling')::boolean, false),
      coalesce((p_requirement ->> 'requires_waterproof_cover')::boolean, false),
      coalesce((p_requirement ->> 'requires_special_handling')::boolean, false),
      p_requirement ->> 'handling_notes',
      p_requirement ->> 'cancellation_conditions'
    );
  end if;

  fee := greatest(coalesce((p_payment ->> 'delivery_fee')::numeric, 0), 0);
  extra := greatest(coalesce((p_payment ->> 'additional_fee')::numeric, 0), 0);
  deduction := greatest(coalesce((p_payment ->> 'deduction_amount')::numeric, 0), 0);
  insert into public.delivery_payment (
    delivery_id, delivery_fee, additional_fee,
    deduction_amount, final_earning
  ) values (
    created.delivery_id, fee, extra, deduction,
    greatest(fee + extra - deduction, 0)
  );
  return to_jsonb(created);
end;
$$;
create or replace function public.accept_delivery(
  p_delivery_id bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_rider bigint := private.current_rider_id();
declare delivery public.deliveries%rowtype;
declare replay boolean := false;
declare active_count integer;
declare active_limit integer;
begin
  if current_rider is null then raise exception 'Rider identity required'; end if;
  select * into delivery from public.deliveries
    where delivery_id = p_delivery_id for update;
  if not found then raise exception 'Delivery not found'; end if;
  if delivery.rider_id = current_rider and delivery.delivery_status = 'accepted' then
    replay := true;
  elsif delivery.rider_id is not null or delivery.delivery_status <> 'available' then
    raise exception 'Delivery is no longer available' using errcode = '40001';
  elsif delivery.expires_at is not null and delivery.expires_at <= now() then
    raise exception 'Delivery request expired' using errcode = '22023';
  else
    if not private.rider_can_view_delivery(p_delivery_id) then
      raise exception 'Delivery is outside Rider eligibility'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.riders rider
      where rider.rider_id = current_rider
        and rider.employment_status = 'active'
        and rider.availability_status in ('online_available','available')
    ) then
      raise exception 'Rider is not eligible and available'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.delivery_requirements requirement
      join public.riders rider on rider.rider_id = current_rider
      where requirement.delivery_id = p_delivery_id
        and (
          requirement.minimum_capacity_kg > coalesce(rider.capacity_kg, 0)
          or (
            requirement.required_vehicle_type is not null
            and lower(replace(requirement.required_vehicle_type, '-', '')) <>
              lower(replace(coalesce(rider.vehicle_type, ''), '-', ''))
          )
        )
    ) then
      raise exception 'Rider vehicle does not meet delivery requirements'
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
    update public.deliveries set rider_id = current_rider,
      delivery_status = 'accepted', accepted_at = now()
      where delivery_id = p_delivery_id returning * into delivery;
    insert into private.rider_delivery_assignments (
      delivery_id, rider_id, assigned_at
    ) values (p_delivery_id, current_rider, now())
    on conflict (delivery_id) do update set
      rider_id = excluded.rider_id, assigned_at = excluded.assigned_at;
  end if;
  return to_jsonb(delivery) || jsonb_build_object(
    'is_idempotent_replay', replay,
    'idempotency_key', p_idempotency_key
  );
end;
$$;
create or replace function public.update_delivery_status(
  p_delivery_id bigint, p_previous_status text, p_new_status text,
  p_idempotency_key uuid, p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare delivery public.deliveries%rowtype;
declare event jsonb;
begin
  if not private.rider_owns_delivery(p_delivery_id) then
    raise exception 'Delivery is not assigned to this rider';
  end if;
  select * into delivery from public.deliveries
    where delivery_id = p_delivery_id for update;
  if delivery.delivery_status = p_new_status then
    select to_jsonb(history) into event
      from public.delivery_status_history history
      where history.delivery_id = p_delivery_id
        and history.new_status = p_new_status
      order by history.changed_at desc limit 1;
    return to_jsonb(delivery) || jsonb_build_object('history', event, 'is_idempotent_replay', true);
  end if;
  if delivery.delivery_status <> p_previous_status then
    raise exception 'Delivery status changed; refresh and retry'
      using errcode = '40001';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Invalid latitude' using errcode = '22023';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Invalid longitude' using errcode = '22023';
  end if;
  perform set_config('app.delivery_remarks', coalesce(p_remarks, ''), true);
  perform set_config('app.delivery_latitude', coalesce(p_latitude::text, ''), true);
  perform set_config('app.delivery_longitude', coalesce(p_longitude::text, ''), true);
  update public.deliveries set delivery_status = p_new_status
    where delivery_id = p_delivery_id returning * into delivery;
  select to_jsonb(history) into event
    from public.delivery_status_history history
    where history.delivery_id = p_delivery_id
    order by history.changed_at desc limit 1;
  return to_jsonb(delivery) || jsonb_build_object(
    'history', event, 'is_idempotent_replay', false,
    'idempotency_key', p_idempotency_key
  );
end;
$$;
create or replace function public.save_delivery_confirmation_code(
  p_delivery_id bigint, p_stage text, p_code text,
  p_remarks text default null
) returns jsonb language plpgsql security definer
set search_path = '' as $$
declare saved public.delivery_proofs%rowtype;
begin
  if not private.rider_owns_delivery(p_delivery_id) then
    raise exception 'Delivery is not assigned to this rider';
  end if;
  if p_stage not in ('pickup','delivery') or length(trim(p_code)) < 4 then
    raise exception 'Invalid confirmation code';
  end if;
  select * into saved from public.delivery_proofs proof
  where proof.delivery_id = p_delivery_id
    and proof.proof_stage = p_stage
    and proof.proof_type = 'confirmation_code'
  for update;
  if not found or saved.confirmed_at is not null then
    raise exception 'Confirmation code is unavailable or already used'
      using errcode = '22023';
  end if;
  if saved.confirmation_code_hash is distinct from
    encode(extensions.digest(trim(p_code), 'sha256'), 'hex') then
    raise exception 'Invalid confirmation code' using errcode = '22023';
  end if;
  update public.delivery_proofs set remarks = p_remarks,
    confirmed_at = now(), updated_at = now()
  where proof_id = saved.proof_id returning * into saved;
  return to_jsonb(saved) - 'confirmation_code_hash';
end;
$$;
create or replace function public.calculate_delivery_earning(
  p_delivery_id bigint
) returns public.delivery_payment language plpgsql security definer
set search_path = '' as $$
declare payment public.delivery_payment%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrator required'; end if;
  update public.delivery_payment set
    final_earning = greatest(delivery_fee + additional_fee - deduction_amount, 0),
    earning_status = 'calculated', updated_at = now()
  where delivery_id = p_delivery_id returning * into payment;
  return payment;
end;
$$;
alter table public.delivery_locations enable row level security;
alter table public.delivery_requirements enable row level security;
alter table public.delivery_status_history enable row level security;
alter table public.delivery_proofs enable row level security;
alter table public.delivery_payment enable row level security;
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'delivery_locations','delivery_requirements','delivery_status_history',
    'delivery_proofs','delivery_payment'
  ] loop
    execute format('drop policy if exists delivery_admin_access on public.%I', table_name);
    execute format(
      'create policy delivery_admin_access on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())',
      table_name
    );
    execute format('drop policy if exists rider_delivery_child_read on public.%I', table_name);
    execute format(
      'create policy rider_delivery_child_read on public.%I for select to authenticated using (private.rider_can_view_delivery(delivery_id))',
      table_name
    );
  end loop;
end;
$$;
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'delivery_status_history','delivery_proofs','delivery_payment'
  ] loop
    execute format('drop policy if exists rider_delivery_child_read on public.%I', table_name);
    execute format(
      'create policy rider_delivery_child_read on public.%I for select to authenticated using (private.rider_owns_delivery(delivery_id))',
      table_name
    );
  end loop;
end;
$$;
drop policy if exists rider_available_or_owned_read on public.deliveries;
create policy rider_available_or_owned_read on public.deliveries
  for select to authenticated
  using (private.rider_can_view_delivery(delivery_id));
drop policy if exists rider_proof_insert on public.delivery_proofs;
create policy rider_proof_insert on public.delivery_proofs
  for insert to authenticated with check (
    private.rider_owns_delivery(delivery_id)
    and proof_type <> 'confirmation_code'
    and confirmation_code_hash is null
  );
drop policy if exists rider_proof_update on public.delivery_proofs;
create policy rider_proof_update on public.delivery_proofs
  for update to authenticated
  using (private.rider_owns_delivery(delivery_id))
  with check (
    private.rider_owns_delivery(delivery_id)
    and proof_type <> 'confirmation_code'
    and confirmation_code_hash is null
  );
revoke all on public.delivery_locations, public.delivery_requirements,
  public.delivery_status_history, public.delivery_proofs,
  public.delivery_payment from anon, authenticated;
grant select on public.delivery_locations, public.delivery_requirements,
  public.delivery_status_history, public.delivery_payment to authenticated;
grant select (
  proof_id, delivery_id, proof_stage, proof_type, file_path, remarks,
  latitude, longitude, confirmed_at, created_at, updated_at
) on public.delivery_proofs to authenticated;
grant insert, update on public.delivery_proofs to authenticated;
grant insert, update on public.delivery_locations,
  public.delivery_requirements to authenticated;
grant execute on function public.accept_delivery(bigint, uuid) to authenticated;
grant execute on function public.create_delivery(jsonb, jsonb, jsonb, jsonb)
  to authenticated;
grant execute on function public.update_delivery_status(
  bigint, text, text, uuid, text, double precision, double precision
) to authenticated;
grant execute on function public.save_delivery_confirmation_code(
  bigint, text, text, text
) to authenticated;
grant execute on function public.calculate_delivery_earning(bigint)
  to authenticated;
grant execute on function private.rider_owns_delivery(bigint) to authenticated;
grant execute on function private.rider_can_view_delivery(bigint) to authenticated;
revoke all on function private.storage_delivery_id(text) from public, anon, authenticated;
revoke all on function private.delivery_transition_allowed(text, text)
  from public, anon, authenticated;
revoke all on function private.prepare_delivery_status_change()
  from public, anon, authenticated;
revoke all on function private.record_delivery_status_change()
  from public, anon, authenticated;
revoke all on function private.record_initial_delivery_status()
  from public, anon, authenticated;
revoke all on function private.delivery_positive_numeric(text)
  from public, anon, authenticated;
revoke all on function private.delivery_canonical_status(text)
  from public, anon, authenticated;
revoke all on function private.delivery_safe_timestamp(text, timestamptz)
  from public, anon, authenticated;
revoke all on function private.delivery_safe_coordinate(
  text, double precision, double precision
) from public, anon, authenticated;
revoke all on function public.create_delivery(jsonb, jsonb, jsonb, jsonb)
  from public, anon;
revoke all on function public.accept_delivery(bigint, uuid) from public, anon;
revoke all on function public.update_delivery_status(
  bigint, text, text, uuid, text, double precision, double precision
) from public, anon;
revoke all on function public.save_delivery_confirmation_code(
  bigint, text, text, text
) from public, anon;
revoke all on function public.calculate_delivery_earning(bigint)
  from public, anon;
grant execute on function private.storage_delivery_id(text) to authenticated;
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'delivery-proofs', 'delivery-proofs', false, 8388608,
  array['image/jpeg','image/png','image/webp','image/heic']
) on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists rider_delivery_proof_read on storage.objects;
create policy rider_delivery_proof_read on storage.objects
  for select to authenticated using (
    bucket_id = 'delivery-proofs' and (
      private.is_admin() or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and private.rider_owns_delivery(private.storage_delivery_id(name))
      )
    )
  );
drop policy if exists rider_delivery_proof_insert on storage.objects;
create policy rider_delivery_proof_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'delivery-proofs' and (
      private.is_admin() or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and private.rider_owns_delivery(private.storage_delivery_id(name))
      )
    )
  );
drop policy if exists rider_delivery_proof_update on storage.objects;
create policy rider_delivery_proof_update on storage.objects
  for update to authenticated using (
    bucket_id = 'delivery-proofs' and (
      private.is_admin() or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and private.rider_owns_delivery(private.storage_delivery_id(name))
      )
    )
  ) with check (
    bucket_id = 'delivery-proofs' and (
      private.is_admin() or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and private.rider_owns_delivery(private.storage_delivery_id(name))
      )
    )
  );
drop policy if exists rider_delivery_proof_delete on storage.objects;
create policy rider_delivery_proof_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'delivery-proofs' and (
      private.is_admin() or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and private.rider_owns_delivery(private.storage_delivery_id(name))
      )
    )
  );
commit;
