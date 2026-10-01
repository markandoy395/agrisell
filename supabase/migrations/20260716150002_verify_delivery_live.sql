begin;
do $$
declare
  delivery_count bigint;
  missing_location_ids bigint[];
  missing_payment_ids bigint[];
  required_policy_count integer;
begin
  select count(*) into delivery_count from public.deliveries;
  select array_agg(delivery.delivery_id order by delivery.delivery_id)
  into missing_location_ids
  from public.deliveries as delivery
  where not exists (
    select 1 from public.delivery_locations as location
    where location.delivery_id = delivery.delivery_id
      and location.location_type = 'pickup'
  ) or not exists (
    select 1 from public.delivery_locations as location
    where location.delivery_id = delivery.delivery_id
      and location.location_type = 'dropoff'
  );
  select array_agg(delivery.delivery_id order by delivery.delivery_id)
  into missing_payment_ids
  from public.deliveries as delivery
  where not exists (
    select 1 from public.delivery_payment as payment
    where payment.delivery_id = delivery.delivery_id
  );

  raise notice
    'Delivery live verification: % deliveries, incomplete locations %, incomplete payments %',
    delivery_count, coalesce(cardinality(missing_location_ids), 0),
    coalesce(cardinality(missing_payment_ids), 0);
  if missing_location_ids is not null then
    raise warning 'Deliveries needing location correction: %', missing_location_ids;
  end if;
  if missing_payment_ids is not null then
    raise exception 'Deliveries missing normalized payments: %', missing_payment_ids;
  end if;

  if exists (
    select 1 from pg_class as relation
    join pg_namespace as schema_record
      on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'public'
      and relation.relname in (
        'delivery_locations','delivery_requirements',
        'delivery_status_history','delivery_proofs','delivery_payment'
      ) and not relation.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on every delivery child table';
  end if;

  select count(*) into required_policy_count
  from pg_policies
  where schemaname = 'public' and (
    (tablename in ('delivery_locations','delivery_requirements')
      and policyname in ('delivery_admin_access','rider_delivery_child_read'))
    or
    (tablename in (
        'delivery_status_history','delivery_proofs','delivery_payment'
      ) and policyname in ('delivery_admin_access','rider_delivery_child_read'))
  );
  if required_policy_count <> 10 then
    raise exception 'Expected 10 delivery child read/admin policies, found %',
      required_policy_count;
  end if;
  if exists (
    select 1 from pg_policies
    where (
      (
        schemaname = 'public' and tablename in (
          'deliveries','delivery_locations','delivery_requirements',
          'delivery_status_history','delivery_proofs','delivery_payment'
        )
      ) or (
        schemaname = 'storage' and tablename = 'objects'
        and policyname in (
          'rider_delivery_proof_read','rider_delivery_proof_insert',
          'rider_delivery_proof_update','rider_delivery_proof_delete'
        )
      )
    ) and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'A broad delivery or proof-storage RLS policy was detected';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'delivery-proofs' and public is false
  ) then
    raise exception 'delivery-proofs is not configured as a private bucket';
  end if;
  if (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in (
        'rider_delivery_proof_read','rider_delivery_proof_insert',
        'rider_delivery_proof_update','rider_delivery_proof_delete'
      )
  ) <> 4 then
    raise exception 'Delivery proof storage policies are incomplete';
  end if;
  if has_column_privilege(
    'authenticated', 'public.delivery_payment', 'payout_status', 'UPDATE'
  ) then
    raise exception 'Authenticated Riders may update payout status';
  end if;
  if has_column_privilege(
    'authenticated', 'public.delivery_proofs',
    'confirmation_code_hash', 'SELECT'
  ) then
    raise exception 'Confirmation-code hashes are exposed to clients';
  end if;
end $$;
-- Exercise RLS with two real auth identities and transaction-local fixtures.
-- The enclosing rollback removes every probe row and identity update.
do $$
declare
  auth_ids uuid[];
  auth_a uuid;
  auth_b uuid;
  rider_a uuid;
  rider_b uuid;
  phone_a text;
  phone_b text;
  probe_user_id bigint;
  probe_buyer_id bigint;
  probe_farmer_id bigint;
  probe_farm_id bigint;
  probe_category_id bigint;
  probe_commodity_id bigint;
  probe_cart_id bigint;
  probe_cart_item_id bigint;
  probe_order_id bigint;
  probe_delivery_id bigint;
  hidden_count bigint;
  visible_count bigint;
  resolved_rider uuid;
begin
  select array_agg(candidate.auth_user_id order by candidate.auth_user_id)
  into auth_ids
  from (
    select identity.auth_user_id
    from private.auth_identities as identity
    where identity.rider_id is null
    order by identity.auth_user_id
    limit 2
  ) as candidate;
  if coalesce(cardinality(auth_ids), 0) < 2 then
    raise warning 'Cross-Rider RLS probe skipped: two unused auth identities are required';
    return;
  end if;
  auth_a := auth_ids[1];
  auth_b := auth_ids[2];

  select '09' || lpad(candidate::text, 9, '0') into phone_a
  from generate_series(1, 999) as candidate
  where not exists (
    select 1 from public.riders
    where regexp_replace(contact_number, '[[:space:]()-]', '', 'g')
      = '09' || lpad(candidate::text, 9, '0')
  ) limit 1;
  select '09' || lpad(candidate::text, 9, '0') into phone_b
  from generate_series(1, 999) as candidate
  where '09' || lpad(candidate::text, 9, '0') <> phone_a
    and not exists (
      select 1 from public.riders
      where regexp_replace(contact_number, '[[:space:]()-]', '', 'g')
        = '09' || lpad(candidate::text, 9, '0')
    ) limit 1;

  insert into public.riders (
    auth_id, first_name, last_name, email, contact_number, date_of_birth,
    gender, region, province, city_municipality, barangay, complete_address,
    service_radius_km, verification_status, availability_status
  ) values (
    auth_a, 'RLS', 'Probe A',
    'rls-probe-' || replace(auth_a::text, '-', '') || '@example.invalid',
    phone_a, date '1990-01-01', 'unspecified', 'Probe', 'Probe', 'Probe',
    'Probe', 'Probe address', 1, 'verified', 'online'
  ) returning rider_id into rider_a;
  insert into public.riders (
    auth_id, first_name, last_name, email, contact_number, date_of_birth,
    gender, region, province, city_municipality, barangay, complete_address,
    service_radius_km, verification_status, availability_status
  ) values (
    auth_b, 'RLS', 'Probe B',
    'rls-probe-' || replace(auth_b::text, '-', '') || '@example.invalid',
    phone_b, date '1990-01-01', 'unspecified', 'Probe', 'Probe', 'Probe',
    'Probe', 'Probe address', 1, 'verified', 'online'
  ) returning rider_id into rider_b;
  update private.auth_identities set rider_id = rider_a
  where auth_user_id = auth_a;
  update private.auth_identities set rider_id = rider_b
  where auth_user_id = auth_b;

  insert into public.users (email, account_status, account_role)
  values ('rls-order-owner@example.invalid', 'active', 'buyer')
  returning public.users.user_id into probe_user_id;
  insert into public.buyers (
    user_id, shipping_address, gps_lat, gps_long, user_type
  ) values (probe_user_id, 'Probe drop-off', 14.5995, 120.9842, 'buyer')
  returning buyer_user_id into probe_buyer_id;
  insert into public.farmers (registration_date) values (current_date)
  returning farmer_user_id into probe_farmer_id;
  insert into public.farms (
    farmer_user_id, farm_name, farm_location, gps_lat, gps_long
  ) values (
    probe_farmer_id, 'RLS Probe Farm', 'Probe pickup', 14.6, 121.0
  ) returning public.farms.farm_id into probe_farm_id;
  insert into public.categories (category_name, farm_id)
  values ('RLS Probe', probe_farm_id)
  returning public.categories.category_id into probe_category_id;
  insert into public.commodities (category_id, farm_id, commodity_name)
  values (probe_category_id, probe_farm_id, 'RLS Probe Commodity')
  returning public.commodities.commodity_id into probe_commodity_id;
  insert into public.carts (buyer_user_id, cart_status)
  values (probe_buyer_id, 'probe')
  returning public.carts.cart_id into probe_cart_id;
  insert into public.cart_items (cart_id, commodity_id, quantity)
  values (probe_cart_id, probe_commodity_id, 1)
  returning public.cart_items.cart_item_id into probe_cart_item_id;
  insert into public.orders (cart_item_id, order_status, delivery_address)
  values (probe_cart_item_id, 'probe', 'Probe drop-off')
  returning public.orders.order_id into probe_order_id;
  insert into public.deliveries (
    order_id, rider_id, delivery_status, priority, total_weight_kg
  ) values (probe_order_id, rider_a, 'accepted', 'normal', 1)
  returning public.deliveries.delivery_id into probe_delivery_id;
  insert into private.rider_delivery_assignments (delivery_id, rider_id)
  values (probe_delivery_id, rider_a);
  insert into public.delivery_locations (
    delivery_id, location_type, address, latitude, longitude
  ) values
    (probe_delivery_id, 'pickup', 'Probe pickup', 14.6, 121.0),
    (probe_delivery_id, 'dropoff', 'Probe drop-off', 14.5995, 120.9842);
  insert into public.delivery_requirements (delivery_id)
  values (probe_delivery_id);
  insert into public.delivery_payment (
    delivery_id, delivery_fee, final_earning
  ) values (probe_delivery_id, 10, 10);
  insert into public.delivery_proofs (
    delivery_id, proof_stage, proof_type, file_path
  ) values (probe_delivery_id, 'pickup', 'photo',
    auth_a::text || '/' || probe_delivery_id::text || '/pickup/probe.jpg');
  insert into storage.objects (bucket_id, name)
  values ('delivery-proofs',
    auth_a::text || '/' || probe_delivery_id::text || '/pickup/probe.jpg');

  perform set_config('request.jwt.claim.sub', auth_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', auth_b, 'role', 'authenticated'
  )::text, true);
  execute 'set local role authenticated';
  select private.current_rider_id() into resolved_rider;
  select count(public.deliveries.delivery_id) into hidden_count
  from public.deliveries
  where public.deliveries.delivery_id = probe_delivery_id;
  select hidden_count
    + (select count(location_id) from public.delivery_locations
       where public.delivery_locations.delivery_id = probe_delivery_id)
    + (select count(requirement_id) from public.delivery_requirements
       where public.delivery_requirements.delivery_id = probe_delivery_id)
    + (select count(status_history_id) from public.delivery_status_history
       where public.delivery_status_history.delivery_id = probe_delivery_id)
    + (select count(proof_id) from public.delivery_proofs
       where public.delivery_proofs.delivery_id = probe_delivery_id)
    + (select count(payment_id) from public.delivery_payment
       where public.delivery_payment.delivery_id = probe_delivery_id)
    + (select count(id) from storage.objects
       where bucket_id = 'delivery-proofs'
         and name = auth_a::text || '/' || probe_delivery_id::text
           || '/pickup/probe.jpg')
  into hidden_count;
  execute 'reset role';
  if resolved_rider <> rider_b or hidden_count <> 0 then
    raise exception 'Cross-Rider RLS failed: Rider B could see % protected rows',
      hidden_count;
  end if;

  perform set_config('request.jwt.claim.sub', auth_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', auth_a, 'role', 'authenticated'
  )::text, true);
  execute 'set local role authenticated';
  select private.current_rider_id() into resolved_rider;
  select count(public.deliveries.delivery_id) into visible_count
  from public.deliveries
  where public.deliveries.delivery_id = probe_delivery_id;
  select visible_count
    + (select count(location_id) from public.delivery_locations
       where public.delivery_locations.delivery_id = probe_delivery_id)
    + (select count(requirement_id) from public.delivery_requirements
       where public.delivery_requirements.delivery_id = probe_delivery_id)
    + (select count(status_history_id) from public.delivery_status_history
       where public.delivery_status_history.delivery_id = probe_delivery_id)
    + (select count(proof_id) from public.delivery_proofs
       where public.delivery_proofs.delivery_id = probe_delivery_id)
    + (select count(payment_id) from public.delivery_payment
       where public.delivery_payment.delivery_id = probe_delivery_id)
    + (select count(id) from storage.objects
       where bucket_id = 'delivery-proofs'
         and name = auth_a::text || '/' || probe_delivery_id::text
           || '/pickup/probe.jpg')
  into visible_count;
  execute 'reset role';
  if resolved_rider <> rider_a or visible_count < 8 then
    raise exception 'Owner-Rider RLS failed: Rider A could see only % probe rows',
      visible_count;
  end if;
  raise notice
    'Cross-Rider RLS probe passed: Rider B saw 0 rows; Rider A saw % rows',
    visible_count;
end $$;
rollback;
