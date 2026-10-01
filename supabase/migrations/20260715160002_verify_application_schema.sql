begin;
do $$
declare
  expected_tables text[] := array[
    'admin_roles','admins','users','buyers','farmers','farms','categories',
    'commodities','carts','cart_items','orders','order_items','reviews',
    'payments','deliveries','riders','logistics_companies'
  ];
  actual_tables text[];
  missing_columns text[];
begin
  select array_agg(table_name order by table_name) into actual_tables
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE';
  if actual_tables <> (select array_agg(value order by value) from unnest(expected_tables) value) then
    raise exception 'Public table contract changed: %', actual_tables;
  end if;

  with required(table_name, column_name) as (values
    ('users','username'), ('users','account_role'), ('users','rider_application'),
    ('farms','cover_image_url'), ('commodities','product_metadata'),
    ('orders','contact_number'), ('reviews','helpful_count'),
    ('payments','collection_status'), ('payments','amount_received'),
    ('riders','capacity_kg'), ('riders','service_radius_km'),
    ('riders','maximum_active_deliveries'),
    ('deliveries','pickup_deadline'), ('deliveries','delivery_deadline'),
    ('deliveries','handling_requirements'), ('deliveries','proof_references'),
    ('deliveries','status_history'), ('deliveries','offline_actions'),
    ('deliveries','batch_reference'), ('deliveries','earning_breakdown')
  )
  select array_agg(required.table_name || '.' || required.column_name)
  into missing_columns from required
  left join information_schema.columns actual
    on actual.table_schema = 'public'
   and actual.table_name = required.table_name
   and actual.column_name = required.column_name
  where actual.column_name is null;
  if missing_columns is not null then
    raise exception 'Application attributes missing: %', missing_columns;
  end if;

  if to_regprocedure('public.provision_current_user_role(text)') is null
     or to_regprocedure('public.submit_current_rider_application(jsonb)') is null then
    raise exception 'Auth provisioning functions are missing';
  end if;
end;
$$;
rollback;
