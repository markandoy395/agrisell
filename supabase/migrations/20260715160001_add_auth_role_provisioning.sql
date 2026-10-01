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
    first_name, middle_name, last_name, email, contact_number, username,
    account_status, account_role, rider_application
  ) values (
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'middle_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''), new.email,
    nullif(new.raw_user_meta_data ->> 'phone_number', ''),
    nullif(new.raw_user_meta_data ->> 'username', ''),
    case when requested_role = 'rider' then 'pending' else 'active' end,
    requested_role,
    case when requested_role = 'rider'
      then new.raw_user_meta_data -> 'rider_application' else null end
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
create function public.provision_current_user_role(requested_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  identity_record private.auth_identities%rowtype;
  role_value text := lower(trim(requested_role));
  role_id bigint;
  existing_role text;
begin
  if role_value is null or role_value not in ('buyer', 'farmer', 'rider') then
    raise exception 'Unsupported account role';
  end if;

  select * into identity_record from private.auth_identities
  where auth_user_id = (select auth.uid()) for update;
  if not found then raise exception 'Authentication identity is unavailable'; end if;
  select account_role into existing_role from public.users
  where user_id = identity_record.user_id;
  if existing_role is not null and existing_role <> role_value then
    raise exception 'An account role is already assigned';
  end if;
  if identity_record.rider_id is not null
     or (role_value <> 'buyer' and identity_record.buyer_user_id is not null)
     or (role_value <> 'farmer' and identity_record.farmer_user_id is not null) then
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
  end if;

  update public.users set account_role = role_value,
    account_status = case when role_value = 'rider' then 'pending' else 'active' end,
    updated_at = now()
  where user_id = identity_record.user_id;
  return role_value;
end;
$$;
create function public.submit_current_rider_application(application jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_user_id bigint := private.current_user_id();
begin
  if target_user_id is null or application is null
     or jsonb_typeof(application) <> 'object' then
    raise exception 'A valid rider application is required';
  end if;
  if nullif(application ->> 'license_number', '') is null
     or nullif(application ->> 'vehicle_type', '') is null then
    raise exception 'License number and vehicle type are required';
  end if;
  if exists (
    select 1 from private.auth_identities identity
    where identity.auth_user_id = (select auth.uid())
      and (identity.buyer_user_id is not null
        or identity.farmer_user_id is not null
        or identity.rider_id is not null)
  ) then
    raise exception 'An account role is already assigned';
  end if;
  update public.users set rider_application = application,
    account_role = 'rider', account_status = 'pending', updated_at = now()
  where user_id = target_user_id;
  return found;
end;
$$;
revoke all on function public.provision_current_user_role(text) from public;
revoke all on function public.submit_current_rider_application(jsonb) from public;
grant execute on function public.provision_current_user_role(text) to authenticated;
grant execute on function public.submit_current_rider_application(jsonb) to authenticated;
commit;
