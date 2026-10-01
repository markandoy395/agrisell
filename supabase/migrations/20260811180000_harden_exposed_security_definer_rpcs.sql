begin;
-- Supabase's Data API grants EXECUTE on newly-created functions on older
-- projects. Make all future RPC exposure explicit instead.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;
-- Keep each client-facing RPC name and signature stable while moving the
-- privileged implementation out of the exposed public schema. The public SQL
-- wrapper runs as the caller; only the unexposed implementation runs with the
-- function owner's privileges.
do $migration$
declare
  target_signature text;
  target_oid oid;
  target_name text;
  internal_name text;
  identity_argument_types oidvector;
  identity_arguments text;
  wrapper_arguments text;
  result_type text;
  argument_references text;
  wrapper_body text;
  volatility_clause text;
  parallel_clause text;
  strict_clause text;
  returns_set boolean;
  has_output_arguments boolean;
  is_security_definer boolean;
begin
  foreach target_signature in array array[
    'public.accept_delivery(bigint,uuid)',
    'public.cancel_current_farmer_order(text,text)',
    'public.cancel_current_farmer_rider_request(uuid)',
    'public.checkout_gcash_details(bigint[])',
    'public.complete_pickup(bigint,text,text,double precision,double precision,double precision,timestamp with time zone,boolean,boolean,jsonb,integer,double precision)',
    'public.configure_rider_delivery_limit(integer,uuid,text,bigint)',
    'public.current_account_cancellation_snapshots()',
    'public.current_farmer_rider_assignment_requests()',
    'public.current_marketplace_conversations()',
    'public.current_profile_follow_stats()',
    'public.current_rider_conversation_messages(text)',
    'public.current_rider_conversations()',
    'public.current_rider_dashboard()',
    'public.current_rider_ratings()',
    'public.decline_delivery_request(bigint)',
    'public.eligible_riders_for_current_farmer_order(text)',
    'public.mark_current_farmer_order_ready(text)',
    'public.mark_current_rider_conversation_read(text)',
    'public.mark_marketplace_conversation_read(bigint)',
    'public.marketplace_conversation_messages(bigint)',
    'public.marketplace_farm_details(bigint[])',
    'public.marketplace_farmer_directory()',
    'public.marketplace_farmer_follow_state(bigint)',
    'public.marketplace_farmer_follow_states()',
    'public.marketplace_product_reviews(bigint)',
    'public.request_current_farmer_rider(text,uuid,timestamp with time zone,numeric)',
    'public.restock_current_farmer_commodity(bigint,numeric,text)',
    'public.save_current_rider_confirmation_code(bigint,text,text,text)',
    'public.save_current_rider_delivery_proof(bigint,text,text,text,text,double precision,double precision,timestamp with time zone)',
    'public.send_marketplace_message(bigint,text)',
    'public.send_rider_delivery_message(text,text,text,text,text)',
    'public.set_marketplace_farmer_follow(bigint,boolean)',
    'public.start_marketplace_conversation(bigint,bigint,text)',
    'public.submit_current_buyer_feedback(text,bigint,integer,text,integer,text)',
    'public.submit_rider_rating(bigint,numeric,text)',
    'public.update_current_rider_availability(text)',
    'public.update_delivery_status(bigint,text,text,text,text,double precision,double precision)'
  ]
  loop
    target_oid := to_regprocedure(target_signature)::oid;

    if target_oid is null then
      raise exception 'Expected RPC does not exist: %', target_signature;
    end if;

    select
      procedure.proname,
      procedure.proargtypes,
      pg_get_function_identity_arguments(procedure.oid),
      case
        when procedure.proargmodes is null then false
        else procedure.proargmodes && array['o'::"char", 'b'::"char", 't'::"char"]
      end,
      pg_get_function_result(procedure.oid),
      procedure.proretset,
      case procedure.provolatile
        when 'i' then 'immutable'
        when 's' then 'stable'
        else 'volatile'
      end,
      case procedure.proparallel
        when 's' then 'parallel safe'
        when 'r' then 'parallel restricted'
        else 'parallel unsafe'
      end,
      case when procedure.proisstrict then 'strict' else 'called on null input' end,
      procedure.prosecdef
    into
      target_name,
      identity_argument_types,
      identity_arguments,
      has_output_arguments,
      result_type,
      returns_set,
      volatility_clause,
      parallel_clause,
      strict_clause,
      is_security_definer
    from pg_proc as procedure
    where procedure.oid = target_oid;

    if not is_security_definer then
      raise exception 'Expected SECURITY DEFINER RPC: %', target_signature;
    end if;

    if has_output_arguments then
      -- RETURNS TABLE functions expose their output columns through proargmodes;
      -- identity arguments contain only the callable input parameters.
      wrapper_arguments := identity_arguments;
    else
      wrapper_arguments := pg_get_function_arguments(target_oid);
    end if;

    select coalesce(string_agg(format('$%s', position), ', '), '')
    into argument_references
    from generate_series(
      1,
      (select procedure.pronargs from pg_proc as procedure
       where procedure.oid = target_oid)
    ) as position;

    internal_name := 'api_impl_' || target_name;

    if exists (
      select 1
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'private'
        and procedure.proname = internal_name
        and procedure.proargtypes = identity_argument_types
    ) then
      raise exception 'Private RPC implementation already exists: private.%',
        internal_name;
    end if;

    execute format(
      'alter function %s rename to %I',
      target_oid::regprocedure,
      internal_name
    );
    execute format(
      'alter function %s set schema private',
      target_oid::regprocedure
    );

    if returns_set then
      wrapper_body := format(
        'select * from private.%I(%s)',
        internal_name,
        argument_references
      );
    else
      wrapper_body := format(
        'select private.%I(%s)',
        internal_name,
        argument_references
      );
    end if;

    execute format(
      'create function public.%I(%s) returns %s '
      'language sql %s security invoker %s %s set search_path = '''' as %L',
      target_name,
      wrapper_arguments,
      result_type,
      volatility_clause,
      parallel_clause,
      strict_clause,
      wrapper_body
    );

    execute format(
      'revoke all on function private.%I(%s) '
      'from public, anon, authenticated, service_role',
      internal_name,
      identity_arguments
    );
    execute format(
      'grant execute on function private.%I(%s) to authenticated, service_role',
      internal_name,
      identity_arguments
    );
    execute format(
      'revoke all on function public.%I(%s) '
      'from public, anon, authenticated, service_role',
      target_name,
      identity_arguments
    );
    execute format(
      'grant execute on function public.%I(%s) to authenticated, service_role',
      target_name,
      identity_arguments
    );
  end loop;
end;
$migration$;
-- Existing installations can be relocated without data loss when their
-- installed pg_net build declares itself relocatable. Non-relocatable builds
-- need a controlled drop/reinstall because that clears pg_net's request queue.
create schema if not exists extensions;
do $migration$
declare
  pg_net_oid oid;
  pg_net_is_relocatable boolean;
  pg_net_schema text;
begin
  select extension.oid, extension.extrelocatable, namespace.nspname
  into pg_net_oid, pg_net_is_relocatable, pg_net_schema
  from pg_extension as extension
  join pg_namespace as namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pg_net';

  if pg_net_oid is not null and pg_net_schema = 'public' then
    if pg_net_is_relocatable then
      alter extension pg_net set schema extensions;
    else
      raise warning using message =
        'pg_net is non-relocatable; reinstall it in extensions during a maintenance window';
    end if;
  end if;
end;
$migration$;
notify pgrst, 'reload schema';
commit;
