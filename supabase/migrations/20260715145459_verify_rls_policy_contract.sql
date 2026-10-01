do $$
declare disabled_tables text;
declare missing_policies integer;
begin
  select string_agg(relname, ', ' order by relname) into disabled_tables
  from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'public'
    and relname = any(array[
      'admin_roles','admins','users','buyers','farmers','farms','categories',
      'commodities','carts','cart_items','orders','order_items','reviews',
      'payments','deliveries','riders','logistics_companies'
    ]) and not relrowsecurity;
  if disabled_tables is not null then
    raise exception 'RLS is disabled on: %', disabled_tables;
  end if;

  select count(*) into missing_policies from (
    select unnest(array[
      'users_own_read','buyers_own_read','farmers_own_read','riders_own_read',
      'farms_owner_insert','categories_owner_insert','commodities_owner_insert',
      'carts_owner_insert','cart_items_owner_insert','orders_access_read',
      'payments_access_read','deliveries_access_read'
    ]) as policy_name
  ) as expected left join pg_policies on pg_policies.policyname = expected.policy_name
  where pg_policies.policyname is null;
  if missing_policies <> 0 then
    raise exception 'Required RLS policies are missing: %', missing_policies;
  end if;
end $$;
