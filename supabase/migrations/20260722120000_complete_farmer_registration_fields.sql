begin;
-- Farmer registration writes directly from Auth metadata. Require the values
-- that power farm discovery and persist the crop count derived by the app.
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
      coalesce(
        nullif(new.raw_user_meta_data ->> 'total_crops', '')::integer,
        jsonb_array_length(coalesce(new.raw_user_meta_data -> 'main_crops', '[]'::jsonb))
      ),
      nullif(new.raw_user_meta_data ->> 'farm_size', '')::numeric,
      nullif(btrim(new.raw_user_meta_data ->> 'farm_size_unit'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'farming_type'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'irrigation_type'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'ownership_type'), ''),
      array(select jsonb_array_elements_text(
        coalesce(new.raw_user_meta_data -> 'main_crops', '[]'::jsonb)
      ))
    );
    insert into private.auth_identities (auth_user_id, farmer_user_id)
    values (new.id, new_farmer_id);
    return new;
  end if;

  if requested_role = 'rider' then
    insert into public.users (account_status)
    values ('pending') returning user_id into new_user_id;
    insert into private.auth_identities (auth_user_id, user_id)
    values (new.id, new_user_id);
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
commit;
