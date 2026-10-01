begin;
-- PostgreSQL ORs permissive policies together. Keep that authorization behavior,
-- but express it as a single authenticated policy per table and command so each
-- row does not evaluate a separate administrator policy as well as its normal
-- owner/access policy.
do $$
declare
  target_table text;
  source_policy record;
  select_using text;
  insert_check text;
  update_using text;
  update_check text;
  delete_using text;
begin
  foreach target_table in array array[
    'buyers',
    'cart_items',
    'carts',
    'categories',
    'commodities',
    'deliveries',
    'delivery_proofs',
    'farmers',
    'farms',
    'logistics_companies',
    'order_items',
    'orders',
    'payments',
    'reviews',
    'rider_documents',
    'rider_incidents',
    'users'
  ] loop
    select string_agg(
      format('(%s)', coalesce(qual, 'true')),
      ' OR ' order by policyname
    )
    into select_using
    from pg_policies
    where schemaname = 'public'
      and tablename = target_table
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and cmd in ('ALL', 'SELECT');

    select string_agg(
      format('(%s)', coalesce(with_check, qual, 'true')),
      ' OR ' order by policyname
    )
    into insert_check
    from pg_policies
    where schemaname = 'public'
      and tablename = target_table
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and cmd in ('ALL', 'INSERT');

    select
      string_agg(
        format('(%s)', coalesce(qual, 'true')),
        ' OR ' order by policyname
      ),
      string_agg(
        format('(%s)', coalesce(with_check, qual, 'true')),
        ' OR ' order by policyname
      )
    into update_using, update_check
    from pg_policies
    where schemaname = 'public'
      and tablename = target_table
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and cmd in ('ALL', 'UPDATE');

    select string_agg(
      format('(%s)', coalesce(qual, 'true')),
      ' OR ' order by policyname
    )
    into delete_using
    from pg_policies
    where schemaname = 'public'
      and tablename = target_table
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated']::name[]
      and cmd in ('ALL', 'DELETE');

    for source_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and permissive = 'PERMISSIVE'
        and roles = array['authenticated']::name[]
    loop
      execute format(
        'drop policy %I on public.%I',
        source_policy.policyname,
        target_table
      );
    end loop;

    if select_using is not null then
      execute format(
        'create policy authenticated_select on public.%I '
        'for select to authenticated using (%s)',
        target_table,
        select_using
      );
    end if;

    if insert_check is not null then
      execute format(
        'create policy authenticated_insert on public.%I '
        'for insert to authenticated with check (%s)',
        target_table,
        insert_check
      );
    end if;

    if update_using is not null then
      execute format(
        'create policy authenticated_update on public.%I '
        'for update to authenticated using (%s) with check (%s)',
        target_table,
        update_using,
        update_check
      );
    end if;

    if delete_using is not null then
      execute format(
        'create policy authenticated_delete on public.%I '
        'for delete to authenticated using (%s)',
        target_table,
        delete_using
      );
    end if;
  end loop;
end
$$;
commit;
