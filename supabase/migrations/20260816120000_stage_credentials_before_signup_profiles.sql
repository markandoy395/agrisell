begin;
-- Buyer, Farmer, and Rider signup now verifies credentials before collecting profile
-- details. The Auth row is needed to send the OTP, but application-owned rows
-- must not exist until the email is verified and the full form is submitted.
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_user_id bigint;
  new_buyer_id bigint;
  new_farmer_id bigint;
  requested_role text := lower(nullif(new.raw_user_meta_data ->> 'requested_role', ''));
  signup_stage text := lower(nullif(new.raw_user_meta_data ->> 'signup_stage', ''));
begin
  if requested_role not in ('buyer', 'farmer', 'rider') then
    requested_role := null;
  end if;

  if signup_stage = 'profile_pending'
     and requested_role in ('buyer', 'farmer', 'rider') then
    return new;
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
create or replace function private.complete_current_buyer_registration(
  buyer_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  identity_record private.auth_identities%rowtype;
  target_user public.users%rowtype;
  new_user_id bigint;
  new_buyer_id bigint;
  account_email text;
  requested_role text;
begin
  if not private.current_email_is_verified() then
    raise exception 'Email verification is required' using errcode = '42501';
  end if;

  select lower(email), lower(nullif(raw_user_meta_data ->> 'requested_role', ''))
  into account_email, requested_role from auth.users
  where id = (select auth.uid());
  if requested_role <> 'buyer' then
    raise exception 'An authenticated Buyer account is required'
      using errcode = '42501';
  end if;

  insert into private.auth_identities (auth_user_id)
  values ((select auth.uid())) on conflict (auth_user_id) do nothing;
  select * into identity_record from private.auth_identities
  where auth_user_id = (select auth.uid()) for update;

  if identity_record.farmer_user_id is not null
     or identity_record.rider_id is not null then
    raise exception 'An account role is already assigned';
  end if;
  if identity_record.buyer_user_id is not null then
    select app_user.* into target_user from public.users as app_user
    where app_user.user_id = identity_record.user_id;
    return to_jsonb(target_user);
  end if;

  if nullif(btrim(buyer_payload ->> 'first_name'), '') is null
     or nullif(btrim(buyer_payload ->> 'last_name'), '') is null
     or nullif(btrim(buyer_payload ->> 'phone_number'), '') is null
     or nullif(btrim(buyer_payload ->> 'shipping_address'), '') is null then
    raise exception 'Buyer name, phone number, and shipping address are required';
  end if;

  if identity_record.user_id is null then
    insert into public.users (
      first_name, last_name, extension_name, email, contact_number,
      account_status, gender, date_of_birth
    ) values (
      btrim(buyer_payload ->> 'first_name'),
      btrim(buyer_payload ->> 'last_name'),
      nullif(btrim(buyer_payload ->> 'extension_name'), ''),
      account_email,
      btrim(buyer_payload ->> 'phone_number'),
      'active',
      nullif(btrim(buyer_payload ->> 'gender'), ''),
      nullif(buyer_payload ->> 'date_of_birth', '')::date
    ) returning * into target_user;
    new_user_id := target_user.user_id;
  else
    update public.users set
      first_name = btrim(buyer_payload ->> 'first_name'),
      last_name = btrim(buyer_payload ->> 'last_name'),
      extension_name = nullif(btrim(buyer_payload ->> 'extension_name'), ''),
      email = account_email,
      contact_number = btrim(buyer_payload ->> 'phone_number'),
      account_status = 'active',
      gender = nullif(btrim(buyer_payload ->> 'gender'), ''),
      date_of_birth = nullif(buyer_payload ->> 'date_of_birth', '')::date,
      updated_at = now()
    where user_id = identity_record.user_id
    returning * into target_user;
    new_user_id := identity_record.user_id;
  end if;

  insert into public.buyers (user_id, shipping_address, user_type)
  values (
    new_user_id,
    btrim(buyer_payload ->> 'shipping_address'),
    'buyer'
  ) returning buyer_user_id into new_buyer_id;
  update private.auth_identities set
    user_id = new_user_id,
    buyer_user_id = new_buyer_id
  where auth_user_id = (select auth.uid());
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'signup_stage'
  where id = (select auth.uid());
  return to_jsonb(target_user);
end;
$$;
create or replace function public.complete_current_buyer_registration(
  buyer_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if not private.current_email_is_verified() then
    raise exception 'Email verification is required' using errcode = '42501';
  end if;
  return private.complete_current_buyer_registration(buyer_payload);
end;
$$;
create or replace function private.complete_current_farmer_registration(
  farmer_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  identity_record private.auth_identities%rowtype;
  target_farmer public.farmers%rowtype;
  new_farmer_id bigint;
  requested_role text;
begin
  if not private.current_email_is_verified() then
    raise exception 'Email verification is required' using errcode = '42501';
  end if;

  select lower(nullif(raw_user_meta_data ->> 'requested_role', ''))
  into requested_role from auth.users where id = (select auth.uid());
  if requested_role <> 'farmer' then
    raise exception 'An authenticated Farmer account is required'
      using errcode = '42501';
  end if;

  insert into private.auth_identities (auth_user_id)
  values ((select auth.uid())) on conflict (auth_user_id) do nothing;
  select * into identity_record from private.auth_identities
  where auth_user_id = (select auth.uid()) for update;

  if identity_record.buyer_user_id is not null
     or identity_record.rider_id is not null then
    raise exception 'An account role is already assigned';
  end if;
  if identity_record.farmer_user_id is not null then
    select * into target_farmer from public.farmers
    where farmer_user_id = identity_record.farmer_user_id;
    return to_jsonb(target_farmer);
  end if;

  if nullif(btrim(farmer_payload ->> 'first_name'), '') is null
     or nullif(btrim(farmer_payload ->> 'last_name'), '') is null
     or nullif(btrim(farmer_payload ->> 'phone_number'), '') is null
     or nullif(btrim(farmer_payload ->> 'farm_name'), '') is null
     or nullif(btrim(farmer_payload ->> 'farm_location'), '') is null
     or nullif(farmer_payload ->> 'latitude', '') is null
     or nullif(farmer_payload ->> 'longitude', '') is null
     or nullif(farmer_payload ->> 'years_of_experience', '') is null then
    raise exception 'Farmer details, farm location, and years of experience are required';
  end if;

  insert into public.farmers (
    auth_user_id, first_name, middle_name, last_name, suffix, phone_number,
    date_of_birth, gender, address_line, barangay, city_municipality,
    province, postal_code, years_of_experience, verification_status,
    account_status, registration_date
  ) values (
    (select auth.uid()), btrim(farmer_payload ->> 'first_name'),
    nullif(btrim(farmer_payload ->> 'middle_name'), ''),
    btrim(farmer_payload ->> 'last_name'),
    nullif(btrim(farmer_payload ->> 'suffix'), ''),
    btrim(farmer_payload ->> 'phone_number'),
    nullif(farmer_payload ->> 'date_of_birth', '')::date,
    nullif(btrim(farmer_payload ->> 'gender'), ''),
    nullif(btrim(farmer_payload ->> 'address_line'), ''),
    nullif(btrim(farmer_payload ->> 'barangay'), ''),
    nullif(btrim(farmer_payload ->> 'city_municipality'), ''),
    nullif(btrim(farmer_payload ->> 'province'), ''),
    nullif(btrim(farmer_payload ->> 'postal_code'), ''),
    nullif(farmer_payload ->> 'years_of_experience', '')::integer,
    'pending', 'active', current_date
  ) returning * into target_farmer;
  new_farmer_id := target_farmer.farmer_user_id;

  insert into public.farms (
    farmer_user_id, farm_name, farm_location, barangay, city_municipality,
    province, gps_lat, gps_long, total_crops, farm_size_hectares,
    farm_size_unit, farming_type, irrigation_type, ownership_type, main_crops
  ) values (
    new_farmer_id, btrim(farmer_payload ->> 'farm_name'),
    btrim(farmer_payload ->> 'farm_location'),
    nullif(btrim(farmer_payload ->> 'farm_barangay'), ''),
    nullif(btrim(farmer_payload ->> 'farm_city_municipality'), ''),
    nullif(btrim(farmer_payload ->> 'farm_province'), ''),
    (farmer_payload ->> 'latitude')::numeric,
    (farmer_payload ->> 'longitude')::numeric,
    coalesce(nullif(farmer_payload ->> 'total_crops', '')::integer,
      jsonb_array_length(coalesce(farmer_payload -> 'main_crops', '[]'::jsonb))),
    nullif(farmer_payload ->> 'farm_size', '')::numeric,
    nullif(btrim(farmer_payload ->> 'farm_size_unit'), ''),
    nullif(btrim(farmer_payload ->> 'farming_type'), ''),
    nullif(btrim(farmer_payload ->> 'irrigation_type'), ''),
    nullif(btrim(farmer_payload ->> 'ownership_type'), ''),
    array(select jsonb_array_elements_text(
      coalesce(farmer_payload -> 'main_crops', '[]'::jsonb)))
  );
  update private.auth_identities set farmer_user_id = new_farmer_id
  where auth_user_id = (select auth.uid());
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'signup_stage'
  where id = (select auth.uid());
  return to_jsonb(target_farmer);
end;
$$;
create or replace function public.complete_current_farmer_registration(
  farmer_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if not private.current_email_is_verified() then
    raise exception 'Email verification is required' using errcode = '42501';
  end if;
  return private.complete_current_farmer_registration(farmer_payload);
end;
$$;
revoke all on function private.complete_current_farmer_registration(jsonb)
from public, anon, authenticated;
grant execute on function private.complete_current_farmer_registration(jsonb)
to authenticated, service_role;
revoke all on function public.complete_current_farmer_registration(jsonb)
from public, anon;
grant execute on function public.complete_current_farmer_registration(jsonb)
to authenticated;
revoke all on function private.complete_current_buyer_registration(jsonb)
from public, anon, authenticated;
grant execute on function private.complete_current_buyer_registration(jsonb)
to authenticated, service_role;
revoke all on function public.complete_current_buyer_registration(jsonb)
from public, anon;
grant execute on function public.complete_current_buyer_registration(jsonb)
to authenticated;
notify pgrst, 'reload schema';
commit;
