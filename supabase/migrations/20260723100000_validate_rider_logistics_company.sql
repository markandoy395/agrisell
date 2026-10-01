begin;
-- This changes only registration behavior; the public ERD remains unchanged.
-- A rider may optionally select an active logistics company, but the privileged
-- registration function must not accept a forged, missing, or inactive ID.
create or replace function private.create_current_rider_registration(
  rider_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  identity_record private.auth_identities%rowtype;
  target_rider public.riders%rowtype;
  account_email text;
  selected_company_id bigint;
begin
  select * into identity_record from private.auth_identities
  where auth_user_id = (select auth.uid()) for update;
  if not found then raise exception 'An authenticated Rider account is required'; end if;
  if identity_record.buyer_user_id is not null
     or identity_record.farmer_user_id is not null then
    raise exception 'An account role is already assigned';
  end if;
  if identity_record.rider_id is not null then
    select * into target_rider from public.riders
    where rider_id = identity_record.rider_id;
    return to_jsonb(target_rider);
  end if;
  select lower(email) into account_email from auth.users
  where id = identity_record.auth_user_id;
  if nullif(btrim(rider_payload ->> 'first_name'), '') is null
     or nullif(btrim(rider_payload ->> 'last_name'), '') is null
     or nullif(btrim(rider_payload ->> 'contact_number'), '') is null
     or nullif(btrim(rider_payload ->> 'vehicle_type'), '') is null then
    raise exception 'Rider name, contact, and vehicle type are required';
  end if;

  selected_company_id := nullif(btrim(rider_payload ->> 'logistics_company_id'), '')::bigint;
  if selected_company_id is not null and not exists (
    select 1 from public.logistics_companies as company
    where company.logistics_company_id = selected_company_id
      and coalesce(lower(nullif(btrim(company.status), '')), 'active') = 'active'
  ) then
    raise exception 'The selected logistics company is unavailable';
  end if;

  insert into public.riders (
    logistics_company_id, license_number, full_name, vehicle_type,
    vehicle_plate_number, availability_status, first_name, middle_name,
    last_name, contact_number, email, gps_lat, gps_long,
    gps_accuracy_meters, location_captured_at, location_label, location_notes,
    date_of_birth, gender, total_deliveries, employment_status,
    profile_photo_url, accepted_terms_at, accepted_privacy_at,
    confirmed_accuracy_at
  ) values (
    selected_company_id,
    nullif(upper(btrim(rider_payload ->> 'license_number')), ''),
    concat_ws(' ', btrim(rider_payload ->> 'first_name'),
      nullif(btrim(rider_payload ->> 'middle_name'), ''),
      btrim(rider_payload ->> 'last_name')),
    btrim(rider_payload ->> 'vehicle_type'),
    nullif(upper(btrim(rider_payload ->> 'vehicle_plate_number')), ''),
    'offline', btrim(rider_payload ->> 'first_name'),
    nullif(btrim(rider_payload ->> 'middle_name'), ''),
    btrim(rider_payload ->> 'last_name'),
    btrim(rider_payload ->> 'contact_number'), account_email,
    nullif(rider_payload ->> 'gps_lat', '')::numeric,
    nullif(rider_payload ->> 'gps_long', '')::numeric,
    nullif(rider_payload ->> 'gps_accuracy_meters', '')::numeric,
    nullif(rider_payload ->> 'location_captured_at', '')::timestamptz,
    nullif(btrim(rider_payload ->> 'location_label'), ''),
    nullif(btrim(rider_payload ->> 'location_notes'), ''),
    nullif(rider_payload ->> 'date_of_birth', '')::date,
    nullif(btrim(rider_payload ->> 'gender'), ''),
    0, 'inactive', null,
    case when rider_payload ->> 'accepted_terms' = 'true' then now() end,
    case when rider_payload ->> 'accepted_privacy' = 'true' then now() end,
    case when rider_payload ->> 'confirmed_accuracy' = 'true' then now() end
  ) returning * into target_rider;

  update private.auth_identities set rider_id = target_rider.rider_id
  where auth_user_id = identity_record.auth_user_id;
  update public.users set account_status = 'pending', updated_at = now()
  where user_id = identity_record.user_id;
  return to_jsonb(target_rider);
end;
$$;
commit;
