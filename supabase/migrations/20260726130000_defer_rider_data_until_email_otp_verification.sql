begin;
-- An Auth user must exist before Supabase can send and verify an email OTP.
-- Do not create application-owned Rider records until that OTP has produced
-- an authenticated session.
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_user_id bigint;
  new_buyer_id bigint;
  new_farmer_id bigint;
  requested_role text := lower(nullif(new.raw_user_meta_data ->> 'requested_role', ''));
begin
  if requested_role not in ('buyer', 'farmer', 'rider') then
    requested_role := null;
  end if;

  if requested_role = 'farmer' then
    if nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '') is null
       or nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '') is null
       or nullif(btrim(new.raw_user_meta_data ->> 'phone_number'), '') is null
       or nullif(btrim(new.raw_user_meta_data ->> 'farm_name'), '') is null
       or nullif(btrim(new.raw_user_meta_data ->> 'farm_location'), '') is null
       or nullif(new.raw_user_meta_data ->> 'latitude', '') is null
       or nullif(new.raw_user_meta_data ->> 'longitude', '') is null
       or nullif(new.raw_user_meta_data ->> 'years_of_experience', '') is null then
      raise exception 'Farmer details, farm location, and years of experience are required';
    end if;

    insert into public.farmers (
      auth_user_id, first_name, middle_name, last_name, suffix, phone_number,
      date_of_birth, gender, address_line, barangay, city_municipality,
      province, postal_code, years_of_experience, verification_status,
      account_status, registration_date
    ) values (
      new.id, btrim(new.raw_user_meta_data ->> 'first_name'),
      nullif(btrim(new.raw_user_meta_data ->> 'middle_name'), ''),
      btrim(new.raw_user_meta_data ->> 'last_name'),
      nullif(btrim(new.raw_user_meta_data ->> 'suffix'), ''),
      btrim(new.raw_user_meta_data ->> 'phone_number'),
      nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
      nullif(btrim(new.raw_user_meta_data ->> 'gender'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'address_line'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'barangay'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'city_municipality'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'province'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'postal_code'), ''),
      nullif(new.raw_user_meta_data ->> 'years_of_experience', '')::integer,
      'pending', 'active', current_date
    ) returning farmer_user_id into new_farmer_id;

    insert into public.farms (
      farmer_user_id, farm_name, farm_location, barangay, city_municipality,
      province, gps_lat, gps_long, total_crops, farm_size_hectares,
      farm_size_unit, farming_type, irrigation_type, ownership_type, main_crops
    ) values (
      new_farmer_id, btrim(new.raw_user_meta_data ->> 'farm_name'),
      btrim(new.raw_user_meta_data ->> 'farm_location'),
      nullif(btrim(new.raw_user_meta_data ->> 'farm_barangay'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'farm_city_municipality'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'farm_province'), ''),
      (new.raw_user_meta_data ->> 'latitude')::numeric,
      (new.raw_user_meta_data ->> 'longitude')::numeric,
      coalesce(nullif(new.raw_user_meta_data ->> 'total_crops', '')::integer,
        jsonb_array_length(coalesce(new.raw_user_meta_data -> 'main_crops', '[]'::jsonb))),
      nullif(new.raw_user_meta_data ->> 'farm_size', '')::numeric,
      nullif(btrim(new.raw_user_meta_data ->> 'farm_size_unit'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'farming_type'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'irrigation_type'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'ownership_type'), ''),
      array(select jsonb_array_elements_text(
        coalesce(new.raw_user_meta_data -> 'main_crops', '[]'::jsonb)))
    );
    insert into private.auth_identities (auth_user_id, farmer_user_id)
    values (new.id, new_farmer_id);
    return new;
  end if;

  if requested_role = 'rider' then
    -- The OTP flow now owns the next step. No public.users, riders, or
    -- private.auth_identities row is created until the Rider signs in.
    return new;
  end if;

  insert into public.users (
    first_name, middle_name, last_name, extension_name, email, contact_number,
    profile_photo_url, account_status, gender, date_of_birth
  ) values (
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'middle_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'extension_name', ''),
    lower(new.email), nullif(new.raw_user_meta_data ->> 'phone_number', ''),
    nullif(new.raw_user_meta_data ->> 'profile_photo_url', ''),
    'active', nullif(new.raw_user_meta_data ->> 'gender', ''),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
  ) returning user_id into new_user_id;
  if requested_role = 'buyer' then
    insert into public.buyers (user_id, user_type)
    values (new_user_id, 'buyer') returning buyer_user_id into new_buyer_id;
  end if;
  insert into private.auth_identities (auth_user_id, user_id, buyer_user_id)
  values (new.id, new_user_id, new_buyer_id);
  return new;
end;
$$;
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
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'rider_application'
  where id = identity_record.auth_user_id;
  return to_jsonb(target_rider);
end;
$$;
notify pgrst, 'reload schema';
commit;
