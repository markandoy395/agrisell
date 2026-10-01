begin;
-- Rider applications are kept in auth metadata until email verification. The
-- registration RPC must copy the structured address into public.riders before
-- clearing that metadata, otherwise the values cannot be recovered later.
create or replace function private.create_current_rider_registration(
  rider_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  identity_record private.auth_identities%rowtype;
  target_rider public.riders%rowtype;
  account_email text;
  requested_role text;
  selected_company_id bigint;
begin
  select * into identity_record from private.auth_identities
  where auth_user_id = (select auth.uid()) for update;

  if not found then
    select lower(nullif(raw_user_meta_data ->> 'requested_role', ''))
    into requested_role from auth.users where id = (select auth.uid());
    if requested_role <> 'rider' then
      raise exception 'An authenticated Rider account is required';
    end if;
    insert into private.auth_identities (auth_user_id)
    values ((select auth.uid()))
    returning * into identity_record;
  end if;

  if identity_record.buyer_user_id is not null
     or identity_record.farmer_user_id is not null then
    raise exception 'An account role is already assigned';
  end if;
  if identity_record.rider_id is not null then
    update public.riders set
      address_line = coalesce(
        nullif(btrim(rider_payload ->> 'address_line'), ''), address_line
      ),
      barangay = coalesce(
        nullif(btrim(rider_payload ->> 'barangay'), ''), barangay
      ),
      city_municipality = coalesce(
        nullif(btrim(rider_payload ->> 'city_municipality'), ''),
        city_municipality
      ),
      province = coalesce(
        nullif(btrim(rider_payload ->> 'province'), ''), province
      ),
      postal_code = coalesce(
        nullif(btrim(rider_payload ->> 'postal_code'), ''), postal_code
      )
    where rider_id = identity_record.rider_id
    returning * into target_rider;
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

  selected_company_id := nullif(
    btrim(rider_payload ->> 'logistics_company_id'), ''
  )::bigint;
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
    address_line, barangay, city_municipality, province, postal_code,
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
    nullif(btrim(rider_payload ->> 'address_line'), ''),
    nullif(btrim(rider_payload ->> 'barangay'), ''),
    nullif(btrim(rider_payload ->> 'city_municipality'), ''),
    nullif(btrim(rider_payload ->> 'province'), ''),
    nullif(btrim(rider_payload ->> 'postal_code'), ''),
    nullif(rider_payload ->> 'date_of_birth', '')::date,
    nullif(btrim(rider_payload ->> 'gender'), ''),
    0, 'inactive', null,
    case when rider_payload ->> 'accepted_terms' = 'true' then now() end,
    case when rider_payload ->> 'accepted_privacy' = 'true' then now() end,
    case when rider_payload ->> 'confirmed_accuracy' = 'true' then now() end
  ) returning * into target_rider;

  update private.auth_identities set rider_id = target_rider.rider_id
  where auth_user_id = identity_record.auth_user_id;
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'rider_application'
  where id = identity_record.auth_user_id;
  return to_jsonb(target_rider);
end;
$$;
commit;
