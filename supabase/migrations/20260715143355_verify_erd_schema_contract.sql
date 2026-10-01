do $$
declare schema_difference text;
declare constraint_count integer;
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
    select table_name, array_agg(column_name::text order by ordinal_position) columns
    from information_schema.columns where table_schema = 'public'
    group by table_name
  )
  select string_agg(coalesce(e.table_name, a.table_name), ', ' order by coalesce(e.table_name, a.table_name))
  into schema_difference from expected e full join actual a using (table_name)
  where e.table_name is null or a.table_name is null or e.columns <> a.columns;

  if schema_difference is not null then
    raise exception 'ERD table/column contract mismatch: %', schema_difference;
  end if;

  select count(*) into constraint_count
  from pg_constraint c join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public' and c.conname = any(array[
    'admins_users_fk','admin_roles_admins_fk','buyers_users_fk','farms_farmers_fk',
    'categories_farms_fk','commodities_categories_fk','carts_buyers_fk',
    'cart_items_carts_fk','cart_items_commodities_fk','orders_cart_items_fk',
    'order_items_orders_fk','reviews_orders_fk','payments_orders_fk',
    'deliveries_orders_fk','logistics_companies_deliveries_fk',
    'riders_logistics_companies_fk'
  ]);
  if constraint_count <> 16 then
    raise exception 'ERD relationship contract mismatch: expected 16 FKs, found %', constraint_count;
  end if;
end $$;
