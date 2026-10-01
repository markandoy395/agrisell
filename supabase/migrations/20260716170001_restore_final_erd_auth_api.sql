begin;
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
    case when requested_role = 'rider' then 'pending' else 'active' end,
    nullif(new.raw_user_meta_data ->> 'gender', ''),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
  ) returning user_id into new_user_id;
  if requested_role = 'buyer' then
    insert into public.buyers (user_id, user_type)
    values (new_user_id, 'buyer') returning buyer_user_id into new_buyer_id;
  elsif requested_role = 'farmer' then
    insert into public.farmers (registration_date)
    values (current_date) returning farmer_user_id into new_farmer_id;
  end if;
  insert into private.auth_identities (
    auth_user_id, user_id, buyer_user_id, farmer_user_id
  ) values (new.id, new_user_id, new_buyer_id, new_farmer_id);
  return new;
end;
$$;
create or replace function private.can_access_delivery(target_delivery_id bigint)
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
create or replace function private.can_access_payment(target_payment_id bigint)
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
create or replace function public.current_application_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when identity.rider_id is not null then 'rider'
    when identity.farmer_user_id is not null then 'farmer'
    when identity.buyer_user_id is not null then 'buyer'
    when app_user.account_status = 'pending' then 'rider'
    else ''
  end
  from private.auth_identities as identity
  join public.users as app_user on app_user.user_id = identity.user_id
  where identity.auth_user_id = (select auth.uid())
$$;
create or replace function public.provision_current_user_role(requested_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  identity_record private.auth_identities%rowtype;
  role_value text := lower(trim(requested_role));
  role_id bigint;
begin
  if role_value not in ('buyer', 'farmer', 'rider') then
    raise exception 'Unsupported account role';
  end if;
  select * into identity_record from private.auth_identities
  where auth_user_id = (select auth.uid()) for update;
  if not found then raise exception 'Authentication identity is unavailable'; end if;
  if identity_record.rider_id is not null and role_value <> 'rider'
     or identity_record.buyer_user_id is not null and role_value <> 'buyer'
     or identity_record.farmer_user_id is not null and role_value <> 'farmer' then
    raise exception 'An account role is already assigned';
  end if;
  if role_value = 'buyer' and identity_record.buyer_user_id is null then
    insert into public.buyers (user_id, user_type)
    values (identity_record.user_id, 'buyer') returning buyer_user_id into role_id;
    update private.auth_identities set buyer_user_id = role_id
    where auth_user_id = identity_record.auth_user_id;
  elsif role_value = 'farmer' and identity_record.farmer_user_id is null then
    insert into public.farmers (registration_date)
    values (current_date) returning farmer_user_id into role_id;
    update private.auth_identities set farmer_user_id = role_id
    where auth_user_id = identity_record.auth_user_id;
  elsif role_value = 'rider' then
    update public.users set account_status = 'pending', updated_at = now()
    where user_id = identity_record.user_id;
  end if;
  return role_value;
end;
$$;
create or replace function public.create_current_rider_registration(
  rider_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  identity_record private.auth_identities%rowtype;
  target_rider public.riders%rowtype;
  account_email text;
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
  insert into public.riders (
    logistics_company_id, license_number, full_name, vehicle_type,
    vehicle_plate_number, availability_status, first_name, last_name,
    contact_number, email, gps_lat, gps_long, total_deliveries,
    employment_status, profile_photo_url
  ) values (
    nullif(rider_payload ->> 'logistics_company_id', '')::bigint,
    nullif(upper(btrim(rider_payload ->> 'license_number')), ''),
    concat_ws(' ', btrim(rider_payload ->> 'first_name'),
      btrim(rider_payload ->> 'last_name')),
    btrim(rider_payload ->> 'vehicle_type'),
    nullif(upper(btrim(rider_payload ->> 'vehicle_plate_number')), ''),
    'offline', btrim(rider_payload ->> 'first_name'),
    btrim(rider_payload ->> 'last_name'),
    btrim(rider_payload ->> 'contact_number'), account_email,
    nullif(rider_payload ->> 'gps_lat', '')::numeric,
    nullif(rider_payload ->> 'gps_long', '')::numeric,
    0, 'inactive', nullif(rider_payload ->> 'profile_photo_url', '')
  ) returning * into target_rider;
  update private.auth_identities set rider_id = target_rider.rider_id
  where auth_user_id = identity_record.auth_user_id;
  update public.users set
    first_name = target_rider.first_name,
    last_name = target_rider.last_name,
    contact_number = target_rider.contact_number,
    profile_photo_url = target_rider.profile_photo_url,
    account_status = 'pending', updated_at = now()
  where user_id = identity_record.user_id;
  return to_jsonb(target_rider);
end;
$$;
commit;
