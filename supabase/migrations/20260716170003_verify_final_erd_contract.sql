begin;
do $$
declare
  difference text;
begin
  with expected(table_name, columns) as (values
    ('admin_roles', array['admin_role_id','user_id','role_name','description','role_level','created_at','updated_at']),
    ('admins', array['user_id','admin_role','admin_code','date_assigned','assigned_by_user_id','created_at','updated_at']),
    ('users', array['user_id','first_name','middle_name','last_name','extension_name','email','contact_number','password_hash','profile_photo_url','account_status','created_at','updated_at','gender','date_of_birth','e_wallet_details']),
    ('buyers', array['buyer_user_id','user_id','shipping_address','loyalty_points','preferred_payment_method','gps_lat','gps_long','user_type','business_name']),
    ('farmers', array['farmer_user_id','years_of_experience','bank_details','certification','registration_date']),
    ('farms', array['farm_id','farmer_user_id','farm_name','farm_location','gps_lat','gps_long','total_crops','farm_size_hectares','farming_type','created_at','soil_type','irrigation_type','main_crops','certifications','farm_images']),
    ('categories', array['category_id','category_name','description','status','created_at','farm_id']),
    ('commodities', array['commodity_id','category_id','commodity_name','description','price_per_unit','unit_type','available_quantity','harvest_date','production_status','is_organic','image_url','commodity_status','created_at','minimum_order_quantity','grade_quality','updated_at','farm_id']),
    ('carts', array['cart_id','buyer_user_id','cart_status','created_at','updated_at']),
    ('cart_items', array['cart_item_id','cart_id','commodity_id','quantity','price_at_time','created_at']),
    ('orders', array['order_id','cart_item_id','order_date','order_status','total_amount','payment_status','delivery_address','payment_method','created_at','delivery_date']),
    ('order_items', array['order_item_id','order_id','quantity','unit_price','total_price']),
    ('reviews', array['review_id','order_id','rating','comment','created_at']),
    ('payments', array['payment_id','order_id','amount','payment_method','transaction_reference','payment_date','payment_status','created_at']),
    ('deliveries', array['delivery_id','order_id','delivery_status','estimated_delivery_time','actual_delivery_time','created_at','vehicle_types','cold_chain_available','pickup_location','dropoff_location','distance_km']),
    ('riders', array['rider_id','logistics_company_id','license_number','full_name','vehicle_type','vehicle_plate_number','availability_status','rating','first_name','last_name','contact_number','email','gps_lat','gps_long','total_deliveries','employment_status','profile_photo_url']),
    ('logistics_companies', array['logistics_company_id','delivery_id','company_name','contact_person','contact_number','email','service_areas','pricing_model','cod_available','rating','status','created_at'])
  ), actual as (
    select column_record.table_name,
      array_agg(column_record.column_name::text order by column_record.column_name) as columns
    from information_schema.columns as column_record
    where column_record.table_schema = 'public'
      and exists (
        select 1 from information_schema.tables as table_record
        where table_record.table_schema = column_record.table_schema
          and table_record.table_name = column_record.table_name
          and table_record.table_type = 'BASE TABLE'
      )
    group by column_record.table_name
  ), normalized_expected as (
    select table_name, array(
      select unnest(columns) order by 1
    ) as columns from expected
  )
  select string_agg(coalesce(expected.table_name, actual.table_name), ', ')
  into difference
  from normalized_expected as expected
  full join actual using (table_name)
  where expected.table_name is null or actual.table_name is null
    or expected.columns <> actual.columns;
  if difference is not null then
    raise exception 'Final ERD table/column mismatch: %', difference;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.logistics_companies'::regclass
      and confrelid = 'public.deliveries'::regclass
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (delivery_id)%'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.riders'::regclass
      and confrelid = 'public.logistics_companies'::regclass
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (logistics_company_id)%'
  ) then
    raise exception 'Final Rider/Delivery relationships are missing';
  end if;

  if to_regprocedure('public.current_application_role()') is null
     or to_regprocedure(
       'public.create_current_rider_registration(jsonb)'
     ) is null
     or to_regprocedure('public.current_rider_deliveries(boolean)') is null
     or to_regprocedure('public.accept_delivery(bigint,uuid)') is null then
    raise exception 'Final ERD client API is incomplete';
  end if;

  if has_column_privilege(
    'authenticated', 'public.users', 'password_hash', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.users', 'password_hash', 'UPDATE'
  ) then
    raise exception 'The ERD password_hash compatibility column is exposed';
  end if;
end;
$$;
rollback;
