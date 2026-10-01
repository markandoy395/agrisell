begin;
-- Keep the established bigint identifiers because farms, categories, and
-- commodities already depend on them. Farmer identity now originates from
-- auth.users rather than public.users.
alter table public.farmers
  add column if not exists auth_user_id uuid,
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists suffix text,
  add column if not exists phone_number text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists address_line text,
  add column if not exists barangay text,
  add column if not exists city_municipality text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists profile_image_url text,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists account_status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();
alter table private.auth_identities
  alter column user_id drop not null;
-- Preserve legacy Farmer data before severing the public.users dependency.
update public.farmers as farmer
set
  auth_user_id = identity.auth_user_id,
  first_name = coalesce(farmer.first_name, app_user.first_name),
  middle_name = coalesce(farmer.middle_name, app_user.middle_name),
  last_name = coalesce(farmer.last_name, app_user.last_name),
  suffix = coalesce(farmer.suffix, app_user.extension_name),
  phone_number = coalesce(farmer.phone_number, app_user.contact_number),
  date_of_birth = coalesce(farmer.date_of_birth, app_user.date_of_birth),
  gender = coalesce(farmer.gender, app_user.gender),
  profile_image_url = coalesce(farmer.profile_image_url, app_user.profile_photo_url),
  account_status = coalesce(farmer.account_status, app_user.account_status, 'active'),
  updated_at = now()
from private.auth_identities as identity
left join public.users as app_user on app_user.user_id = identity.user_id
where identity.farmer_user_id = farmer.farmer_user_id
  and farmer.auth_user_id is null;
do $$
begin
  if exists (select 1 from public.farmers where auth_user_id is null) then
    raise exception 'Cannot require farmers.auth_user_id: legacy Farmer rows are not linked to auth.users';
  end if;
end $$;
alter table public.farmers
  alter column auth_user_id set not null;
alter table public.farmers
  drop constraint if exists farmers_auth_user_id_fkey;
alter table public.farmers
  add constraint farmers_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete cascade;
create unique index if not exists farmers_auth_user_id_key
  on public.farmers(auth_user_id);
-- Retain historical public.users rows for audit/recovery, but remove their
-- Farmer identity link after the profile values have been copied above.
update private.auth_identities
set user_id = null
where farmer_user_id is not null;
alter table public.farms
  add column if not exists barangay text,
  add column if not exists city_municipality text,
  add column if not exists province text,
  add column if not exists farm_size_unit text,
  add column if not exists ownership_type text,
  add column if not exists updated_at timestamptz not null default now();
-- Farmer metadata is deliberately not copied to public.users. Buyers and
-- Riders retain the existing public.users-based provisioning path.
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
       or nullif(btrim(new.raw_user_meta_data ->> 'farm_name'), '') is null then
      raise exception 'Farmer personal information and farm name are required';
    end if;

    insert into public.farmers (
      auth_user_id, first_name, middle_name, last_name, suffix, phone_number,
      date_of_birth, gender, address_line, barangay, city_municipality,
      province, postal_code, verification_status, account_status,
      registration_date
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
      'pending', 'active', current_date
    ) returning farmer_user_id into new_farmer_id;

    insert into public.farms (
      farmer_user_id, farm_name, farm_location, barangay, city_municipality,
      province, gps_lat, gps_long, farm_size_hectares, farm_size_unit,
      farming_type, irrigation_type, ownership_type, main_crops
    ) values (
      new_farmer_id, btrim(new.raw_user_meta_data ->> 'farm_name'),
      nullif(btrim(new.raw_user_meta_data ->> 'farm_location'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'farm_barangay'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'farm_city_municipality'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'farm_province'), ''),
      nullif(new.raw_user_meta_data ->> 'latitude', '')::numeric,
      nullif(new.raw_user_meta_data ->> 'longitude', '')::numeric,
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
  end if;
  insert into private.auth_identities (auth_user_id, user_id, buyer_user_id)
  values (new.id, new_user_id, new_buyer_id);
  return new;
end;
$$;
create or replace function public.current_application_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (
      select 1 from public.farmers farmer
      where farmer.auth_user_id = (select auth.uid())
    ) then 'farmer'
    when identity.rider_id is not null then 'rider'
    when identity.buyer_user_id is not null then 'buyer'
    when app_user.account_status = 'pending' then 'rider'
    else ''
  end
  from private.auth_identities identity
  left join public.users app_user on app_user.user_id = identity.user_id
  where identity.auth_user_id = (select auth.uid())
$$;
drop policy if exists farmers_own_read on public.farmers;
drop policy if exists farmers_own_update on public.farmers;
drop policy if exists farmers_own_insert on public.farmers;
create policy farmers_own_read on public.farmers for select to authenticated
  using (auth_user_id = (select auth.uid()));
create policy farmers_own_insert on public.farmers for insert to authenticated
  with check (auth_user_id = (select auth.uid()));
create policy farmers_own_update on public.farmers for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));
drop policy if exists farms_owner_insert on public.farms;
drop policy if exists farms_owner_update on public.farms;
drop policy if exists farms_owner_read on public.farms;
drop policy if exists marketplace_read on public.farms;
create policy farms_owner_read on public.farms for select to authenticated
  using (exists (
    select 1 from public.farmers farmer
    where farmer.farmer_user_id = farms.farmer_user_id
      and farmer.auth_user_id = (select auth.uid())
  ));
create policy farms_owner_insert on public.farms for insert to authenticated
  with check (exists (
    select 1 from public.farmers farmer
    where farmer.farmer_user_id = farms.farmer_user_id
      and farmer.auth_user_id = (select auth.uid())
  ));
create policy farms_owner_update on public.farms for update to authenticated
  using (exists (
    select 1 from public.farmers farmer
    where farmer.farmer_user_id = farms.farmer_user_id
      and farmer.auth_user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.farmers farmer
    where farmer.farmer_user_id = farms.farmer_user_id
      and farmer.auth_user_id = (select auth.uid())
  ));
grant select, insert, update (
  first_name, middle_name, last_name, suffix, phone_number, date_of_birth,
  gender, address_line, barangay, city_municipality, province, postal_code,
  profile_image_url, verification_status, account_status, updated_at
) on public.farmers to authenticated;
grant update (
  farm_name, farm_location, barangay, city_municipality, province, gps_lat,
  gps_long, farm_size_hectares, farm_size_unit, farming_type, irrigation_type,
  ownership_type, main_crops, farm_images, updated_at
) on public.farms to authenticated;
-- The app uploads optional profile and farm images beneath the authenticated
-- user's UUID. The public bucket makes the saved URL displayable in listings.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('farmer-media', 'farmer-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists farmer_media_read on storage.objects;
drop policy if exists farmer_media_insert on storage.objects;
drop policy if exists farmer_media_update on storage.objects;
drop policy if exists farmer_media_delete on storage.objects;
create policy farmer_media_read on storage.objects for select to authenticated
  using (bucket_id = 'farmer-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy farmer_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'farmer-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy farmer_media_update on storage.objects for update to authenticated
  using (bucket_id = 'farmer-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'farmer-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy farmer_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'farmer-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
