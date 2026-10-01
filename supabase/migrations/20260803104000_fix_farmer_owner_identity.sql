begin;
-- Farmer accounts are owned by farmers.auth_user_id. Do not depend on the
-- legacy private identity mapping, which may be absent for existing accounts.
create or replace function private.current_authenticated_farmer_user_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select farmer.farmer_user_id
  from public.farmers as farmer
  where farmer.auth_user_id = (select auth.uid())
  limit 1
$$;
revoke all on function private.current_authenticated_farmer_user_id() from public;
grant execute on function private.current_authenticated_farmer_user_id() to authenticated;
drop policy if exists farms_owner_read on public.farms;
drop policy if exists farms_owner_insert on public.farms;
drop policy if exists farms_owner_update on public.farms;
create policy farms_owner_read on public.farms
  for select to authenticated
  using (farmer_user_id = private.current_authenticated_farmer_user_id());
create policy farms_owner_insert on public.farms
  for insert to authenticated
  with check (farmer_user_id = private.current_authenticated_farmer_user_id());
create policy farms_owner_update on public.farms
  for update to authenticated
  using (farmer_user_id = private.current_authenticated_farmer_user_id())
  with check (farmer_user_id = private.current_authenticated_farmer_user_id());
commit;
