begin;
-- A farmer may edit only farms attached to their authenticated farmer record.
drop policy if exists farms_owner_read on public.farms;
drop policy if exists farms_owner_insert on public.farms;
drop policy if exists farms_owner_update on public.farms;
create policy farms_owner_read on public.farms
  for select to authenticated
  using (farmer_user_id = private.current_farmer_user_id());
create policy farms_owner_insert on public.farms
  for insert to authenticated
  with check (farmer_user_id = private.current_farmer_user_id());
create policy farms_owner_update on public.farms
  for update to authenticated
  using (farmer_user_id = private.current_farmer_user_id())
  with check (farmer_user_id = private.current_farmer_user_id());
grant select, insert on public.farms to authenticated;
grant update (
  farm_name,
  farm_location,
  barangay,
  city_municipality,
  province,
  gps_lat,
  gps_long,
  farm_size_hectares,
  farming_type,
  irrigation_type,
  main_crops
) on public.farms to authenticated;
commit;
