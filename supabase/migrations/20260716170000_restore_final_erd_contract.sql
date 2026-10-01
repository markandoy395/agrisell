begin;
-- erd.png is the final public-schema contract. Preserve useful normalized
-- values before removing every public table/column that is absent from it.
alter table public.users add column if not exists password_hash text;
alter table public.deliveries
  add column if not exists estimated_delivery_time timestamptz,
  add column if not exists actual_delivery_time timestamptz,
  add column if not exists vehicle_types text,
  add column if not exists cold_chain_available boolean,
  add column if not exists pickup_location text,
  add column if not exists dropoff_location text;
alter table public.logistics_companies
  add column if not exists delivery_id bigint;
alter table public.riders
  add column if not exists license_number text,
  add column if not exists full_name text,
  add column if not exists vehicle_type text,
  add column if not exists vehicle_plate_number text,
  add column if not exists rating numeric(3,2),
  add column if not exists gps_lat numeric(10,7),
  add column if not exists gps_long numeric(10,7),
  add column if not exists total_deliveries bigint;
update public.deliveries as delivery set
  estimated_delivery_time = coalesce(
    delivery.estimated_delivery_time, delivery.estimated_delivery_at
  ),
  actual_delivery_time = coalesce(
    delivery.actual_delivery_time, delivery.actual_delivery_at
  ),
  vehicle_types = coalesce(
    delivery.vehicle_types,
    (select requirement.required_vehicle_type
     from public.delivery_requirements as requirement
     where requirement.delivery_id = delivery.delivery_id)
  ),
  cold_chain_available = coalesce(
    delivery.cold_chain_available,
    (select requirement.requires_cooling
     from public.delivery_requirements as requirement
     where requirement.delivery_id = delivery.delivery_id)
  ),
  pickup_location = coalesce(
    delivery.pickup_location,
    (select location.address from public.delivery_locations as location
     where location.delivery_id = delivery.delivery_id
       and location.location_type = 'pickup'
     order by location.sequence_number limit 1)
  ),
  dropoff_location = coalesce(
    delivery.dropoff_location,
    (select location.address from public.delivery_locations as location
     where location.delivery_id = delivery.delivery_id
       and location.location_type = 'dropoff'
     order by location.sequence_number limit 1)
  );
update public.riders as rider set
  license_number = coalesce(
    rider.license_number,
    (select document.document_number
     from public.rider_documents as document
     where document.rider_id = rider.rider_id
       and document.document_type = 'drivers_license'
     order by document.created_at limit 1)
  ),
  full_name = coalesce(
    nullif(btrim(rider.full_name), ''),
    concat_ws(' ', rider.first_name, rider.middle_name, rider.last_name)
  ),
  vehicle_type = coalesce(
    rider.vehicle_type,
    (select vehicle.vehicle_type from public.rider_vehicles as vehicle
     where vehicle.rider_id = rider.rider_id
     order by vehicle.created_at limit 1)
  ),
  vehicle_plate_number = coalesce(
    rider.vehicle_plate_number,
    (select vehicle.plate_number from public.rider_vehicles as vehicle
     where vehicle.rider_id = rider.rider_id
     order by vehicle.created_at limit 1)
  ),
  gps_lat = coalesce(
    rider.gps_lat,
    (select location.latitude from public.rider_locations as location
     where location.rider_id = rider.rider_id)
  ),
  gps_long = coalesce(
    rider.gps_long,
    (select location.longitude from public.rider_locations as location
     where location.rider_id = rider.rider_id)
  ),
  total_deliveries = coalesce(
    rider.total_deliveries,
    (select count(*) from private.rider_delivery_assignments as assignment
     join public.deliveries as delivery
       on delivery.delivery_id = assignment.delivery_id
     where assignment.rider_id = rider.rider_id
       and delivery.delivery_status in ('completed','delivered'))
  );
update private.auth_identities as identity set rider_id = rider.rider_id
from public.riders as rider
where rider.auth_id = identity.auth_user_id and identity.rider_id is null;
update public.logistics_companies as company set delivery_id = (
  select min(delivery.delivery_id) from public.deliveries as delivery
  where delivery.logistics_company_id = company.logistics_company_id
) where company.delivery_id is null;
-- Remove routines whose bodies depend on the superseded normalized contract.
do $$
declare routine record;
begin
  for routine in
    select procedure.oid::regprocedure as signature
    from pg_proc as procedure
    join pg_namespace as schema_record on schema_record.oid = procedure.pronamespace
    where (schema_record.nspname = 'public' and procedure.proname in (
      'provision_current_user_role','submit_current_rider_application',
      'create_current_rider_registration','create_delivery','accept_delivery',
      'update_delivery_status','save_delivery_confirmation_code',
      'calculate_delivery_earning'
    )) or (schema_record.nspname = 'private' and procedure.proname in (
      'can_access_delivery','can_access_payment','rider_owns_delivery',
      'rider_can_view_delivery','storage_delivery_id',
      'delivery_positive_numeric','delivery_canonical_status',
      'delivery_safe_timestamp','delivery_safe_coordinate',
      'delivery_transition_allowed','prepare_delivery_status_change',
      'record_delivery_status_change','record_initial_delivery_status',
      'rider_delivery_transition_allowed','enforce_rider_delivery_transition',
      'sync_rider_account_status'
    ))
  loop
    execute format('drop function %s cascade', routine.signature);
  end loop;
end $$;
-- These generic triggers would otherwise try to write the removed
-- normalized updated_at attributes after the final ERD cleanup.
drop trigger if exists riders_set_updated_at on public.riders;
drop trigger if exists deliveries_set_updated_at on public.deliveries;
drop policy if exists rider_delivery_proof_read on storage.objects;
drop policy if exists rider_delivery_proof_insert on storage.objects;
drop policy if exists rider_delivery_proof_update on storage.objects;
drop policy if exists rider_delivery_proof_delete on storage.objects;
-- Delete non-ERD public tables and attributes by allow-list, including any
-- future accidental additions that are present when this migration runs.
do $$
declare item record;
begin
  for item in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
      and table_name not in (
        'admin_roles','admins','users','buyers','farmers','farms','categories',
        'commodities','carts','cart_items','orders','order_items','reviews',
        'payments','deliveries','riders','logistics_companies'
      )
  loop
    execute format('drop table public.%I cascade', item.table_name);
  end loop;

  for item in
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
    )
    select column_record.table_name, column_record.column_name
    from information_schema.columns as column_record
    join expected on expected.table_name = column_record.table_name
    where column_record.table_schema = 'public'
      and not (column_record.column_name = any(expected.columns))
  loop
    execute format(
      'alter table public.%I drop column %I cascade',
      item.table_name, item.column_name
    );
  end loop;
end $$;
alter table public.logistics_companies
  drop constraint if exists logistics_companies_deliveries_fk,
  add constraint logistics_companies_deliveries_fk foreign key (delivery_id)
    references public.deliveries (delivery_id) on update restrict on delete restrict;
alter table public.riders
  drop constraint if exists riders_logistics_company_fk,
  drop constraint if exists riders_logistics_companies_fk,
  add constraint riders_logistics_companies_fk foreign key (logistics_company_id)
    references public.logistics_companies (logistics_company_id)
    on update restrict on delete restrict;
comment on column public.users.password_hash is
  'ERD compatibility only. Supabase Auth owns credentials; application clients cannot read or write this value.';
commit;
