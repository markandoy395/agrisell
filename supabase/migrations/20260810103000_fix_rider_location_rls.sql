begin;
-- Authenticated clients cannot read private.auth_identities directly. Resolve
-- the current Rider through the existing security-definer helper instead.
drop policy if exists rider_locations_own_read on public.rider_locations;
create policy rider_locations_own_read on public.rider_locations
for select to authenticated
using (rider_id = private.current_rider_id());
drop policy if exists rider_locations_own_insert on public.rider_locations;
create policy rider_locations_own_insert on public.rider_locations
for insert to authenticated
with check (rider_id = private.current_rider_id());
drop policy if exists rider_locations_own_update on public.rider_locations;
create policy rider_locations_own_update on public.rider_locations
for update to authenticated
using (rider_id = private.current_rider_id())
with check (rider_id = private.current_rider_id());
notify pgrst, 'reload schema';
commit;
