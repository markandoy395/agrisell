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
    date_of_birth, username, account_status, account_role, rider_application
  ) values (
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'middle_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'extension_name', ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone_number', ''),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
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
alter table public.users
  drop constraint if exists users_philippine_contact_number_check;
alter table public.users
  add constraint users_philippine_contact_number_check check (
    contact_number is null or
    regexp_replace(contact_number, '[[:space:]()-]', '', 'g')
      ~ '^(09[0-9]{9}|[+]639[0-9]{9})$'
  ) not valid;
comment on column public.users.extension_name is
  'Optional name suffix, such as Jr., Sr., or III.';
comment on column public.users.contact_number is
  'Philippine mobile number in 09XXXXXXXXX or +639XXXXXXXXX format.';
commit;
