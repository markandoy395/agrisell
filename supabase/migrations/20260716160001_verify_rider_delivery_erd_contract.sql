begin;
do $$
declare
  missing_tables text[];
  missing_columns text[];
  missing_triggers text[];
begin
  with required(name) as (values
    ('riders'), ('rider_vehicles'), ('rider_documents'), ('rider_locations'),
    ('deliveries'), ('delivery_locations'), ('delivery_requirements'),
    ('delivery_status_history'), ('delivery_proofs'), ('delivery_payments')
  )
  select array_agg(required.name order by required.name)
  into missing_tables
  from required
  left join information_schema.tables as actual
    on actual.table_schema = 'public' and actual.table_name = required.name
  where actual.table_name is null;
  if missing_tables is not null then
    raise exception 'Rider/Delivery tables missing: %', missing_tables;
  end if;

  with required(table_name, column_name) as (values
    ('riders','logistics_company_id'), ('riders','employment_status'),
    ('rider_documents','file_path'),
    ('deliveries','rider_id'), ('deliveries','logistics_company_id'),
    ('delivery_payments','delivery_payment_id')
  )
  select array_agg(required.table_name || '.' || required.column_name)
  into missing_columns
  from required
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
    and actual.table_name = required.table_name
    and actual.column_name = required.column_name
  where actual.column_name is null;
  if missing_columns is not null then
    raise exception 'Rider/Delivery columns missing: %', missing_columns;
  end if;

  if to_regclass('public.delivery_payment') is not null then
    raise exception 'Legacy singular delivery_payment still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and (
      (table_name = 'logistics_companies' and column_name = 'delivery_id')
      or (table_name = 'rider_documents' and column_name = 'file_url')
      or (table_name = 'deliveries' and column_name in (
        'pickup_location','dropoff_location','pickup_lat','pickup_long',
        'dropoff_lat','dropoff_long','pickup_instructions',
        'delivery_instructions','required_vehicle_types','vehicle_type',
        'handling_requirements','package_dimensions',
        'cancellation_conditions','route_payload','workflow_state',
        'proof_references','status_history','problem_records',
        'offline_actions','batch_reference','batch_route',
        'pickup_sequence','delivery_sequence','delivery_fee',
        'estimated_earning','earning_breakdown','earning_status','payout_status'
      ))
    )
  ) then
    raise exception 'Legacy flattened Rider/Delivery columns remain';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.rider_vehicles'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (rider_id)'
  ) then
    raise exception 'rider_vehicles still limits a Rider to one vehicle';
  end if;

  with required(name) as (values
    ('riders_set_updated_at'), ('rider_vehicles_set_updated_at'),
    ('rider_documents_set_updated_at'), ('deliveries_set_updated_at'),
    ('delivery_locations_set_updated_at'),
    ('delivery_requirements_set_updated_at'),
    ('delivery_proofs_set_updated_at'),
    ('delivery_payments_set_updated_at')
  )
  select array_agg(required.name order by required.name)
  into missing_triggers
  from required
  left join pg_trigger as actual
    on actual.tgname = required.name and not actual.tgisinternal
  where actual.tgname is null;
  if missing_triggers is not null then
    raise exception 'updated_at triggers missing: %', missing_triggers;
  end if;

  if exists (
    select 1
    from public.riders
    where employment_status not in ('active','inactive','suspended')
      or delivery_status not in (
        'waiting','assigned','going_to_pickup','arrived_at_pickup','picked_up',
        'going_to_delivery','arrived_at_delivery','completed'
      )
  ) then
    raise exception 'Non-canonical Rider status data exists';
  end if;

  if exists (
    select 1 from pg_class as relation
    join pg_namespace as schema_record
      on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'public'
      and relation.relname in (
        'riders','rider_vehicles','rider_documents','rider_locations',
        'deliveries','delivery_locations','delivery_requirements',
        'delivery_status_history','delivery_proofs','delivery_payments'
      ) and not relation.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on all Rider/Delivery entities';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'rider-documents' and public is false
  ) or not exists (
    select 1 from storage.buckets
    where id = 'delivery-proofs' and public is false
  ) then
    raise exception 'Private Rider/Delivery Storage buckets are incomplete';
  end if;

  if has_column_privilege(
    'authenticated', 'public.delivery_payments', 'payout_status', 'UPDATE'
  ) then
    raise exception 'Authenticated Riders may update payout status';
  end if;
  if has_column_privilege(
    'authenticated', 'public.delivery_proofs',
    'confirmation_code_hash', 'SELECT'
  ) then
    raise exception 'Confirmation-code hashes are exposed to clients';
  end if;
end;
$$;
rollback;
