begin;
create schema if not exists extensions;
do $migration$
declare
  installed_schema text;
  installed_version text;
  has_pending_requests boolean := false;
begin
  select namespace.nspname, extension.extversion
  into installed_schema, installed_version
  from pg_extension as extension
  join pg_namespace as namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pg_net';

  if installed_schema is null then
    execute 'create extension pg_net with schema extensions';
  elsif installed_schema = 'public' then
    if to_regclass('net.http_request_queue') is not null then
      begin
        execute
          'lock table net.http_request_queue in access exclusive mode nowait';
      exception
        when lock_not_available then
          raise exception using message =
            'pg_net request queue is busy; retry this migration after requests finish';
      end;

      execute 'select exists (select 1 from net.http_request_queue)'
      into has_pending_requests;
    end if;

    if has_pending_requests then
      raise exception using message =
        'pg_net has pending HTTP requests; retry this migration after the queue is empty';
    end if;

    -- This hosted pg_net build is non-relocatable. Supabase's supported repair
    -- is to reinstall it, without CASCADE, after confirming the queue is empty.
    execute 'drop extension pg_net';
    execute format(
      'create extension pg_net with schema extensions version %L',
      installed_version
    );
  end if;

  select namespace.nspname
  into installed_schema
  from pg_extension as extension
  join pg_namespace as namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pg_net';

  if installed_schema is distinct from 'extensions' then
    raise exception 'pg_net was installed in unexpected schema: %',
      installed_schema;
  end if;
end;
$migration$;
commit;
