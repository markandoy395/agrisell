do $$
declare missing_locations bigint;
declare missing_payments bigint;
declare invalid_statuses bigint;
declare rls_table_count integer;
begin
  select count(*) into missing_locations
  from public.deliveries delivery
  where not exists (
    select 1 from public.delivery_locations location
    where location.delivery_id = delivery.delivery_id
      and location.location_type = 'pickup'
  ) or not exists (
    select 1 from public.delivery_locations location
    where location.delivery_id = delivery.delivery_id
      and location.location_type = 'dropoff'
  );

  select count(*) into missing_payments
  from public.deliveries delivery
  where not exists (
    select 1 from public.delivery_payment payment
    where payment.delivery_id = delivery.delivery_id
  );

  select count(*) into invalid_statuses
  from public.deliveries
  where delivery_status not in (
    'pending','available','accepted','going_to_pickup',
    'arrived_at_pickup','picked_up','going_to_delivery',
    'arrived_at_delivery','completed','cancelled','failed'
  );

  if missing_locations > 0 then
    raise warning '% deliveries retain legacy locations because a valid pickup or drop-off address/coordinate pair is missing', missing_locations;
  end if;
  if missing_payments > 0 then
    raise exception 'Delivery payment migration incomplete: % rows', missing_payments;
  end if;
  if invalid_statuses > 0 then
    raise exception 'Delivery status normalization incomplete: % rows', invalid_statuses;
  end if;

  select count(*) into rls_table_count
  from pg_tables
  where schemaname = 'public'
    and tablename in (
      'delivery_locations','delivery_requirements',
      'delivery_status_history','delivery_proofs','delivery_payment'
    ) and rowsecurity;
  if rls_table_count <> 5 then
    raise exception 'RLS is not enabled on all normalized delivery tables';
  end if;
  if exists (
    select 1 from storage.buckets
    where id = 'delivery-proofs' and public
  ) or not exists (
    select 1 from storage.buckets where id = 'delivery-proofs'
  ) then
    raise exception 'delivery-proofs must exist as a private bucket';
  end if;
  if has_column_privilege(
    'authenticated', 'public.delivery_payment', 'payout_status', 'UPDATE'
  ) then
    raise exception 'Authenticated Riders may not update payout status';
  end if;
  if has_column_privilege(
    'authenticated', 'public.delivery_proofs',
    'confirmation_code_hash', 'SELECT'
  ) then
    raise exception 'Confirmation-code hashes are exposed to authenticated clients';
  end if;
end;
$$;
