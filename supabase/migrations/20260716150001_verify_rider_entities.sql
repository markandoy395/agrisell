begin;
do $$
declare
  missing_tables text[];
  missing_policies text[];
begin
  with required(name) as (values
    ('riders'), ('rider_vehicles'), ('rider_documents'), ('rider_locations')
  )
  select array_agg(required.name) into missing_tables
  from required left join information_schema.tables actual
    on actual.table_schema = 'public' and actual.table_name = required.name
  where actual.table_name is null;
  if missing_tables is not null then
    raise exception 'Rider tables missing: %', missing_tables;
  end if;

  if exists (
    select 1 from pg_class relation
    join pg_namespace schema_record on schema_record.oid = relation.relnamespace
    where schema_record.nspname = 'public'
      and relation.relname in (
        'riders','rider_vehicles','rider_documents','rider_locations'
      ) and not relation.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on every Rider entity';
  end if;

  with required(name) as (values
    ('riders_own_read'), ('riders_own_insert'), ('riders_own_update'),
    ('rider_vehicles_own_read'), ('rider_vehicles_own_insert'),
    ('rider_vehicles_own_update'), ('rider_vehicles_own_delete'),
    ('rider_documents_own_read'), ('rider_documents_own_insert'),
    ('rider_documents_own_update'), ('rider_documents_own_delete'),
    ('rider_locations_own_read'), ('rider_locations_own_insert'),
    ('rider_locations_own_update'), ('rider_files_own_read'),
    ('rider_files_own_insert'), ('rider_files_own_update'),
    ('rider_files_own_delete')
  )
  select array_agg(required.name) into missing_policies
  from required left join pg_policies policy
    on policy.policyname = required.name
  where policy.policyname is null;
  if missing_policies is not null then
    raise exception 'Rider policies missing: %', missing_policies;
  end if;

  if exists (
    select 1 from pg_policies
    where tablename in (
      'riders','rider_vehicles','rider_documents','rider_locations'
    ) and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'A broad Rider RLS policy was detected';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'rider-documents' and public is false
      and file_size_limit = 8388608
  ) then
    raise exception 'The private Rider document bucket is not configured';
  end if;

  if to_regprocedure(
    'public.create_current_rider_registration(jsonb,jsonb,jsonb)'
  ) is null or to_regprocedure('private.current_rider_id()') is null then
    raise exception 'Required Rider registration functions are missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deliveries'
      and column_name = 'rider_id' and data_type = 'uuid'
  ) then
    raise exception 'Delivery Rider references were not converted to UUID';
  end if;
end $$;
rollback;
