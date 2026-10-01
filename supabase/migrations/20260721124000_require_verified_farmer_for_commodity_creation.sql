begin;
-- Farmers may view their products while their registration is pending, but
-- only verified farmers may create categories or commodities.
drop policy if exists categories_owner_insert on public.categories;
create policy categories_owner_insert on public.categories for insert to authenticated
  with check (
    exists (
      select 1
      from public.farms farm
      join public.farmers farmer on farmer.farmer_user_id = farm.farmer_user_id
      where farm.farm_id = categories.farm_id
        and farmer.auth_user_id = (select auth.uid())
        and lower(farmer.verification_status) = 'verified'
    )
  );
drop policy if exists commodities_owner_insert on public.commodities;
create policy commodities_owner_insert on public.commodities for insert to authenticated
  with check (
    exists (
      select 1
      from public.categories category
      join public.farms farm on farm.farm_id = category.farm_id
      join public.farmers farmer on farmer.farmer_user_id = farm.farmer_user_id
      where category.category_id = commodities.category_id
        and category.farm_id = commodities.farm_id
        and farmer.auth_user_id = (select auth.uid())
        and lower(farmer.verification_status) = 'verified'
    )
  );
commit;
