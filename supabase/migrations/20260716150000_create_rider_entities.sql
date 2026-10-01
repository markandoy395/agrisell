begin;
-- The previous Rider table was an unused ERD placeholder with a bigint key
-- and vehicle/location columns embedded in the profile. The Flutter app only
-- submitted Rider applications to users.rider_application, so replacing that
-- empty placeholder is safe. Refuse to discard legacy rows if a deployed
-- environment has started using it; those rows require an explicit data and
-- document migration before this migration can continue.
do $$
begin
  if exists (select 1 from public.riders limit 1)
     or exists (
       select 1 from private.auth_identities where rider_id is not null limit 1
     )
     or exists (select 1 from private.rider_delivery_assignments limit 1)
     or exists (
       select 1 from public.deliveries where rider_id is not null limit 1
     ) then
    raise exception using
      message = 'Legacy Rider rows exist and require an explicit UUID/document migration',
      hint = 'Back up the database and migrate legacy Rider documents before retrying.';
  end if;
end $$;
drop policy if exists payments_access_read on public.payments;
drop policy if exists deliveries_access_read on public.deliveries;
drop function if exists private.can_access_payment(bigint);
drop function if exists private.can_access_delivery(bigint);
drop function if exists private.current_rider_id() cascade;
drop table public.riders cascade;
alter table private.auth_identities
  alter column rider_id type uuid using null::uuid;
alter table private.rider_delivery_assignments
  alter column rider_id type uuid using null::uuid;
alter table public.deliveries
  alter column rider_id type uuid using null::uuid;
create table public.riders (
  rider_id uuid primary key default extensions.gen_random_uuid(),
  auth_id uuid not null unique references auth.users (id) on delete cascade,
  first_name text not null,
  middle_name text,
  last_name text not null,
  email text not null unique,
  contact_number text not null unique,
  date_of_birth date not null,
  gender text not null,
  profile_photo_url text,
  region text not null,
  province text not null,
  city_municipality text not null,
  barangay text not null,
  complete_address text not null,
  service_radius_km numeric(10,2) not null,
  verification_status text not null default 'pending',
  availability_status text not null default 'offline',
  delivery_status text not null default 'waiting',
  maximum_active_deliveries integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint riders_names_not_blank check (
    btrim(first_name) <> '' and btrim(last_name) <> ''
  ),
  constraint riders_email_format_check check (
    email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint riders_philippine_contact_check check (
    regexp_replace(contact_number, '[[:space:]()-]', '', 'g')
      ~ '^(09[0-9]{9}|[+]639[0-9]{9})$'
  ),
  constraint riders_minimum_age_check check (
    date_of_birth <= current_date - interval '18 years'
  ),
  constraint riders_service_radius_check check (service_radius_km > 0),
  constraint riders_verification_status_check check (
    verification_status in ('pending','verified','rejected','suspended')
  ),
  constraint riders_availability_status_check check (
    availability_status in ('offline','online','busy')
  ),
  constraint riders_delivery_status_check check (
    delivery_status in (
      'waiting','assigned','going_to_pickup','arrived_at_pickup','picked_up',
      'going_to_buyer','arrived_at_delivery','completed'
    )
  ),
  constraint riders_active_delivery_limit_check check (
    maximum_active_deliveries > 0
  ),
  constraint riders_profile_path_check check (
    profile_photo_url is null or profile_photo_url !~* '^https?://'
  )
);
alter table private.auth_identities
  add constraint auth_identities_rider_id_fkey foreign key (rider_id)
  references public.riders (rider_id) on delete set null;
alter table private.rider_delivery_assignments
  add constraint rider_delivery_assignments_rider_id_fkey foreign key (rider_id)
  references public.riders (rider_id) on delete restrict;
alter table public.deliveries
  add constraint deliveries_rider_fk foreign key (rider_id)
  references public.riders (rider_id) on delete set null;
create table public.rider_vehicles (
  vehicle_id uuid primary key default extensions.gen_random_uuid(),
  rider_id uuid not null references public.riders (rider_id) on delete cascade,
  vehicle_type text not null,
  vehicle_brand text,
  vehicle_model text not null,
  vehicle_color text not null,
  plate_number text not null unique,
  registration_number text,
  capacity_kg numeric(12,3) not null,
  handling_capability text,
  verification_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_vehicles_one_per_rider unique (rider_id),
  constraint rider_vehicles_identity_unique unique (vehicle_id, rider_id),
  constraint rider_vehicles_required_text_check check (
    btrim(vehicle_type) <> '' and btrim(vehicle_model) <> ''
      and btrim(vehicle_color) <> '' and btrim(plate_number) <> ''
  ),
  constraint rider_vehicles_capacity_check check (capacity_kg > 0),
  constraint rider_vehicles_verification_check check (
    verification_status in ('pending','verified','rejected')
  )
);
create table public.rider_documents (
  document_id uuid primary key default extensions.gen_random_uuid(),
  rider_id uuid not null references public.riders (rider_id) on delete cascade,
  vehicle_id uuid,
  document_type text not null,
  document_number text,
  file_url text not null,
  verification_status text not null default 'pending',
  rejection_reason text,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_documents_vehicle_owner_fk foreign key (vehicle_id, rider_id)
    references public.rider_vehicles (vehicle_id, rider_id) on delete cascade,
  constraint rider_documents_type_check check (
    document_type in (
      'drivers_license','valid_id','profile_selfie',
      'vehicle_or','vehicle_cr','vehicle_photo'
    )
  ),
  constraint rider_documents_owner_type_check check (
    (document_type in ('drivers_license','valid_id','profile_selfie')
      and vehicle_id is null)
    or
    (document_type in ('vehicle_or','vehicle_cr','vehicle_photo')
      and vehicle_id is not null)
  ),
  constraint rider_documents_verification_check check (
    verification_status in ('pending','verified','rejected')
  ),
  constraint rider_documents_file_path_check check (
    btrim(file_url) <> '' and file_url !~* '^https?://'
  ),
  constraint rider_documents_expiry_check check (
    expiry_date is null or expiry_date >= current_date
  )
);
create unique index rider_documents_personal_type_uidx
  on public.rider_documents (rider_id, document_type)
  where vehicle_id is null;
create unique index rider_documents_vehicle_type_uidx
  on public.rider_documents (vehicle_id, document_type)
  where vehicle_id is not null;
create table public.rider_locations (
  location_id uuid primary key default extensions.gen_random_uuid(),
  rider_id uuid not null unique
    references public.riders (rider_id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters double precision,
  heading double precision,
  speed_kph double precision,
  location_updated_at timestamptz not null default now(),
  constraint rider_locations_latitude_check check (
    latitude between -90 and 90
  ),
  constraint rider_locations_longitude_check check (
    longitude between -180 and 180
  ),
  constraint rider_locations_accuracy_check check (
    accuracy_meters is null or accuracy_meters >= 0
  ),
  constraint rider_locations_heading_check check (
    heading is null or heading between 0 and 360
  ),
  constraint rider_locations_speed_check check (
    speed_kph is null or speed_kph >= 0
  )
);
create index riders_verification_status_idx
  on public.riders (verification_status);
create index riders_availability_status_idx
  on public.riders (availability_status);
create index riders_delivery_status_idx on public.riders (delivery_status);
create index rider_documents_rider_id_idx
  on public.rider_documents (rider_id);
create index rider_documents_vehicle_id_idx
  on public.rider_documents (vehicle_id);
create index rider_locations_updated_at_idx
  on public.rider_locations (location_updated_at);
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger riders_set_updated_at before update on public.riders
for each row execute function public.set_updated_at();
create trigger rider_vehicles_set_updated_at
before update on public.rider_vehicles
for each row execute function public.set_updated_at();
create trigger rider_documents_set_updated_at
before update on public.rider_documents
for each row execute function public.set_updated_at();
create function private.current_rider_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select identity.rider_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid())
$$;
create function private.can_access_delivery(target_delivery_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deliveries as delivery
    where delivery.delivery_id = target_delivery_id
      and private.owns_order(delivery.order_id)
  ) or exists (
    select 1 from private.rider_delivery_assignments as assignment
    where assignment.delivery_id = target_delivery_id
      and assignment.rider_id = private.current_rider_id()
  )
$$;
create function private.can_access_payment(target_payment_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payments as payment
    where payment.payment_id = target_payment_id
      and private.owns_order(payment.order_id)
  ) or exists (
    select 1 from public.payments as payment
    join public.deliveries as delivery on delivery.order_id = payment.order_id
    join private.rider_delivery_assignments as assignment
      on assignment.delivery_id = delivery.delivery_id
    where payment.payment_id = target_payment_id
      and assignment.rider_id = private.current_rider_id()
  )
$$;
create or replace function private.rider_owns_delivery(
  target_delivery_id bigint
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deliveries as delivery
    where delivery.delivery_id = target_delivery_id
      and delivery.rider_id = private.current_rider_id()
  )
$$;
create or replace function private.rider_can_view_delivery(
  target_delivery_id bigint
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deliveries as delivery
    where delivery.delivery_id = target_delivery_id
      and (
        delivery.rider_id = private.current_rider_id()
        or (
          delivery.delivery_status = 'available'
          and delivery.rider_id is null
          and private.current_rider_id() is not null
          and (delivery.expires_at is null or delivery.expires_at > now())
        )
      )
  )
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
  if current_rider is null then raise exception 'Rider identity required'; end if;
  select * into delivery from public.deliveries
  where delivery_id = p_delivery_id for update;
  if not found then raise exception 'Delivery not found'; end if;
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
        and rider.availability_status = 'online'
    ) then
      raise exception 'Rider is not eligible and available'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from public.delivery_requirements as requirement
      join public.rider_vehicles as vehicle
        on vehicle.rider_id = current_rider
      where requirement.delivery_id = p_delivery_id
        and (
          requirement.minimum_capacity_kg > vehicle.capacity_kg
          or (
            requirement.required_vehicle_type is not null
            and lower(replace(requirement.required_vehicle_type, '-', '')) <>
              lower(replace(vehicle.vehicle_type, '-', ''))
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
    update public.riders set availability_status = 'busy',
      delivery_status = 'assigned'
    where rider_id = current_rider;
  end if;
  return to_jsonb(delivery) || jsonb_build_object(
    'is_idempotent_replay', replay,
    'idempotency_key', p_idempotency_key
  );
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
  if not private.is_admin() then raise exception 'Administrator required'; end if;
  select count(*) filter (where item ->> 'location_type' = 'pickup'),
    count(*) filter (where item ->> 'location_type' = 'dropoff')
  into pickup_count, dropoff_count
  from jsonb_array_elements(coalesce(p_locations, '[]'::jsonb)) as item;
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
    nullif(p_delivery ->> 'rider_id', '')::uuid,
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
  deduction := greatest(
    coalesce((p_payment ->> 'deduction_amount')::numeric, 0), 0
  );
  insert into public.delivery_payment (
    delivery_id, delivery_fee, additional_fee, deduction_amount, final_earning
  ) values (
    created.delivery_id, fee, extra, deduction,
    greatest(fee + extra - deduction, 0)
  );
  return to_jsonb(created);
end;
$$;
create function private.rider_delivery_transition_allowed(
  previous_status text,
  next_status text
) returns boolean language sql immutable set search_path = '' as $$
  select previous_status = next_status or (previous_status, next_status) in (
    ('waiting','assigned'), ('assigned','waiting'),
    ('assigned','going_to_pickup'),
    ('going_to_pickup','arrived_at_pickup'),
    ('arrived_at_pickup','picked_up'),
    ('picked_up','going_to_buyer'),
    ('going_to_buyer','arrived_at_delivery'),
    ('arrived_at_delivery','completed'),
    ('completed','waiting'), ('completed','assigned')
  )
$$;
create function private.enforce_rider_delivery_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.rider_delivery_transition_allowed(
    old.delivery_status,
    new.delivery_status
  ) then
    raise exception 'Invalid Rider delivery status transition: % to %',
      old.delivery_status, new.delivery_status;
  end if;
  return new;
end;
$$;
create trigger riders_validate_delivery_transition
before update of delivery_status on public.riders
for each row execute function private.enforce_rider_delivery_transition();
create function private.sync_rider_account_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
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
create trigger riders_sync_account_status
after insert or update of verification_status on public.riders
for each row execute function private.sync_rider_account_status();
alter table public.riders enable row level security;
alter table public.rider_vehicles enable row level security;
alter table public.rider_documents enable row level security;
alter table public.rider_locations enable row level security;
create policy riders_own_read on public.riders for select to authenticated
  using (auth_id = (select auth.uid()));
create policy riders_own_insert on public.riders for insert to authenticated
  with check (
    auth_id = (select auth.uid()) and verification_status = 'pending'
  );
create policy riders_own_update on public.riders for update to authenticated
  using (auth_id = (select auth.uid()))
  with check (
    auth_id = (select auth.uid())
    and (profile_photo_url is null or split_part(profile_photo_url, '/', 1)
      = (select auth.uid())::text)
  );
create policy rider_vehicles_own_read on public.rider_vehicles
for select to authenticated using (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_vehicles.rider_id
    and rider.auth_id = (select auth.uid())
));
create policy rider_vehicles_own_insert on public.rider_vehicles
for insert to authenticated with check (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_vehicles.rider_id
    and rider.auth_id = (select auth.uid())
));
create policy rider_vehicles_own_update on public.rider_vehicles
for update to authenticated using (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_vehicles.rider_id
    and rider.auth_id = (select auth.uid())
)) with check (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_vehicles.rider_id
    and rider.auth_id = (select auth.uid())
));
create policy rider_vehicles_own_delete on public.rider_vehicles
for delete to authenticated using (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_vehicles.rider_id
    and rider.auth_id = (select auth.uid())
));
create policy rider_documents_own_read on public.rider_documents
for select to authenticated using (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_documents.rider_id
    and rider.auth_id = (select auth.uid())
));
create policy rider_documents_own_insert on public.rider_documents
for insert to authenticated with check (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_documents.rider_id
    and rider.auth_id = (select auth.uid())
) and split_part(file_url, '/', 1) = (select auth.uid())::text);
create policy rider_documents_own_update on public.rider_documents
for update to authenticated using (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_documents.rider_id
    and rider.auth_id = (select auth.uid())
)) with check (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_documents.rider_id
    and rider.auth_id = (select auth.uid())
) and split_part(file_url, '/', 1) = (select auth.uid())::text);
create policy rider_documents_own_delete on public.rider_documents
for delete to authenticated using (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_documents.rider_id
    and rider.auth_id = (select auth.uid())
));
create policy rider_locations_own_read on public.rider_locations
for select to authenticated using (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_locations.rider_id
    and rider.auth_id = (select auth.uid())
));
create policy rider_locations_own_insert on public.rider_locations
for insert to authenticated with check (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_locations.rider_id
    and rider.auth_id = (select auth.uid())
));
create policy rider_locations_own_update on public.rider_locations
for update to authenticated using (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_locations.rider_id
    and rider.auth_id = (select auth.uid())
)) with check (exists (
  select 1 from public.riders as rider
  where rider.rider_id = rider_locations.rider_id
    and rider.auth_id = (select auth.uid())
));
create policy payments_access_read on public.payments for select to authenticated
  using (private.can_access_payment(payment_id));
create policy deliveries_access_read on public.deliveries for select to authenticated
  using (private.can_access_delivery(delivery_id));
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'delivery_locations','delivery_requirements','delivery_status_history',
    'delivery_proofs','delivery_payment'
  ] loop
    execute format(
      'drop policy if exists rider_delivery_child_read on public.%I',
      table_name
    );
    execute format(
      'create policy rider_delivery_child_read on public.%I for select to authenticated using (private.rider_can_view_delivery(delivery_id))',
      table_name
    );
  end loop;
  foreach table_name in array array[
    'delivery_status_history','delivery_proofs','delivery_payment'
  ] loop
    execute format(
      'drop policy if exists rider_delivery_child_read on public.%I',
      table_name
    );
    execute format(
      'create policy rider_delivery_child_read on public.%I for select to authenticated using (private.rider_owns_delivery(delivery_id))',
      table_name
    );
  end loop;
end $$;
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
drop policy if exists rider_delivery_proof_read on storage.objects;
create policy rider_delivery_proof_read on storage.objects
for select to authenticated using (
  private.is_admin() or (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.rider_owns_delivery(private.storage_delivery_id(name))
  )
);
drop policy if exists rider_delivery_proof_insert on storage.objects;
create policy rider_delivery_proof_insert on storage.objects
for insert to authenticated with check (
  private.is_admin() or (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.rider_owns_delivery(private.storage_delivery_id(name))
  )
);
drop policy if exists rider_delivery_proof_update on storage.objects;
create policy rider_delivery_proof_update on storage.objects
for update to authenticated using (
  private.is_admin() or (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.rider_owns_delivery(private.storage_delivery_id(name))
  )
) with check (
  private.is_admin() or (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.rider_owns_delivery(private.storage_delivery_id(name))
  )
);
drop policy if exists rider_delivery_proof_delete on storage.objects;
create policy rider_delivery_proof_delete on storage.objects
for delete to authenticated using (
  private.is_admin() or (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.rider_owns_delivery(private.storage_delivery_id(name))
  )
);
revoke all on public.riders, public.rider_vehicles,
  public.rider_documents, public.rider_locations from anon, authenticated;
grant select on public.riders, public.rider_vehicles,
  public.rider_documents, public.rider_locations to authenticated;
grant insert (
  rider_id, auth_id, first_name, middle_name, last_name, email,
  contact_number, date_of_birth, gender, profile_photo_url, region, province,
  city_municipality, barangay, complete_address, service_radius_km
) on public.riders to authenticated;
grant update (
  first_name, middle_name, last_name, contact_number, date_of_birth, gender,
  profile_photo_url, region, province, city_municipality, barangay,
  complete_address, service_radius_km, availability_status, delivery_status
) on public.riders to authenticated;
grant insert (
  rider_id, vehicle_type, vehicle_brand, vehicle_model, vehicle_color,
  plate_number, registration_number, capacity_kg, handling_capability
) on public.rider_vehicles to authenticated;
grant update (
  vehicle_type, vehicle_brand, vehicle_model, vehicle_color, plate_number,
  registration_number, capacity_kg, handling_capability
) on public.rider_vehicles to authenticated;
grant delete on public.rider_vehicles to authenticated;
grant insert (
  rider_id, vehicle_id, document_type, document_number, file_url, expiry_date
) on public.rider_documents to authenticated;
grant update (document_number, file_url, expiry_date)
  on public.rider_documents to authenticated;
grant delete on public.rider_documents to authenticated;
grant insert (
  rider_id, latitude, longitude, accuracy_meters, heading, speed_kph,
  location_updated_at
) on public.rider_locations to authenticated;
grant update (
  latitude, longitude, accuracy_meters, heading, speed_kph,
  location_updated_at
) on public.rider_locations to authenticated;
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'rider-documents', 'rider-documents', false, 8388608,
  array['image/jpeg','image/png','image/webp']
) on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
create policy rider_files_own_read on storage.objects
for select to authenticated using (
  bucket_id = 'rider-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy rider_files_own_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'rider-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy rider_files_own_update on storage.objects
for update to authenticated using (
  bucket_id = 'rider-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'rider-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy rider_files_own_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'rider-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create function public.create_current_rider_registration(
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
  normalized_plate := upper(nullif(btrim(vehicle_payload ->> 'plate_number'), ''));
  if normalized_plate is null then
    normalized_plate := 'NO-PLATE-' || upper(substr(
      replace(authenticated_user_id::text, '-', ''), 1, 12
    ));
  end if;

  insert into public.riders (
    rider_id, auth_id, first_name, middle_name, last_name, email,
    contact_number, date_of_birth, gender, profile_photo_url, region, province,
    city_municipality, barangay, complete_address, service_radius_km
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
  ) on conflict (rider_id) do update set
    vehicle_type = excluded.vehicle_type,
    vehicle_brand = excluded.vehicle_brand,
    vehicle_model = excluded.vehicle_model,
    vehicle_color = excluded.vehicle_color,
    plate_number = excluded.plate_number,
    registration_number = excluded.registration_number,
    capacity_kg = excluded.capacity_kg,
    handling_capability = excluded.handling_capability
  returning * into target_vehicle;

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
revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.current_rider_id() to authenticated;
grant execute on function private.can_access_delivery(bigint) to authenticated;
grant execute on function private.can_access_payment(bigint) to authenticated;
grant execute on function private.rider_owns_delivery(bigint) to authenticated;
grant execute on function private.rider_can_view_delivery(bigint) to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.storage_delivery_id(text) to authenticated;
grant execute on function private.rider_delivery_transition_allowed(text, text)
  to authenticated;
grant execute on function public.accept_delivery(bigint, uuid) to authenticated;
grant execute on function public.create_delivery(
  jsonb, jsonb, jsonb, jsonb
) to authenticated;
revoke all on function public.create_current_rider_registration(
  jsonb, jsonb, jsonb
) from public;
grant execute on function public.create_current_rider_registration(
  jsonb, jsonb, jsonb
) to authenticated;
comment on column public.riders.profile_photo_url is
  'Private rider-documents object path; generate a signed URL for display.';
comment on column public.rider_documents.file_url is
  'Private rider-documents object path, never a public or signed URL.';
comment on table public.rider_locations is
  'One latest known location row per Rider; update through upsert.';
-- Rollback guidance: do not drop these entities after Rider signups begin.
-- Restore a pre-migration backup to roll back. For an empty development DB,
-- drop the four Rider tables, their policies/functions/triggers, restore the
-- legacy ERD riders table, and change the two private rider_id columns back to
-- bigint before reapplying the earlier migrations.

commit;
