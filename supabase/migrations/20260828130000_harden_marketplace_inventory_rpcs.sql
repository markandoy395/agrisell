begin;
-- Keep the client-facing RPC contract while ensuring no privileged function is
-- directly callable through the exposed public schema. The public wrappers run
-- as the caller; only their implementations in the unexposed private schema
-- retain the owner's privileges.
grant usage on schema private to anon, authenticated, service_role;
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
  allowed_roles text;
begin
  foreach target_signature in array array[
    'public.marketplace_home_banners()',
    'public.marketplace_inventory_lot_summaries(bigint[])',
    'public.marketplace_products(bigint)',
    'public.marketplace_promotion_banners()',
    'public.marketplace_sale_campaign_products(bigint)',
    'public.restock_current_farmer_commodity(bigint,numeric,text)',
    'public.restock_current_farmer_inventory_lot(bigint,numeric,text,date,date,date,text,text,text)'
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

    -- Preserve defaults used by existing no-parameter/legacy client calls.
    wrapper_arguments := case target_name
      when 'marketplace_products' then 'p_farm_id bigint default null'
      when 'restock_current_farmer_commodity' then
        'p_commodity_id bigint, p_quantity numeric, p_reason text default null'
      when 'restock_current_farmer_inventory_lot' then
        'p_commodity_id bigint, p_quantity numeric, p_date_type text, ' ||
        'p_harvested_at date, p_sell_until date, p_expires_at date, ' ||
        'p_lot_code text, p_storage_instructions text, p_reason text'
      else identity_arguments
    end;

    internal_name := 'api_impl_20260828_' || target_name;

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

    select coalesce(string_agg(format('$%s', position), ', '), '')
    into argument_references
    from generate_series(
      1,
      (select procedure.pronargs
       from pg_proc as procedure
       where procedure.oid = target_oid)
    ) as position;

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

    if target_name like 'restock_current_farmer_%' then
      allowed_roles := 'authenticated, service_role';
    else
      allowed_roles := 'anon, authenticated, service_role';
    end if;

    execute format(
      'revoke all on function private.%I(%s) '
      'from public, anon, authenticated, service_role',
      internal_name,
      identity_arguments
    );
    execute format(
      'grant execute on function private.%I(%s) to %s',
      internal_name,
      identity_arguments,
      allowed_roles
    );
    execute format(
      'revoke all on function public.%I(%s) '
      'from public, anon, authenticated, service_role',
      target_name,
      identity_arguments
    );
    execute format(
      'grant execute on function public.%I(%s) to %s',
      target_name,
      identity_arguments,
      allowed_roles
    );
  end loop;
end;
$migration$;
notify pgrst, 'reload schema';
commit;
