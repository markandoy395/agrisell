begin;

-- Migration: 20260925120000_harden_security_definer_rpcs_and_permissions.sql
-- Resolves Supabase Database Linter security warnings:
-- 1. anon_security_definer_function_executable (Rule 0028)
-- 2. authenticated_security_definer_function_executable (Rule 0029)

grant usage on schema private to anon, authenticated, service_role;

-- ============================================================================
-- 1. ADMIN-ONLY RPCS: REVOKE FROM PUBLIC, ANON, AND AUTHENTICATED
-- Only service_role (used by server backend & edge functions) may execute admin RPCs.
-- ============================================================================

do $admin_grants$
declare
  admin_sig text;
  admin_oid oid;
begin
  foreach admin_sig in array array[
    'public.admin_farmer_rider_requests(bigint,text,integer,integer)',
    'public.admin_get_marketplace_conversation_detail(bigint)',
    'public.admin_get_marketplace_conversations(text,text,integer,integer)',
    'public.admin_get_payout_requests()',
    'public.admin_get_support_hub()',
    'public.admin_moderate_marketplace_conversation(bigint,text,text,text,text)',
    'public.admin_resolve_safety_incident(text,text,text,text)',
    'public.admin_safety_incidents(text,text,integer,integer)',
    'public.admin_send_marketplace_intervention(bigint,text,text)',
    'public.admin_update_payout_request(jsonb,text)'
  ]
  loop
    admin_oid := to_regprocedure(admin_sig)::oid;
    if admin_oid is not null then
      execute format('revoke all on function %s from public, anon, authenticated', admin_oid::regprocedure);
      execute format('grant execute on function %s to service_role', admin_oid::regprocedure);
    end if;
  end loop;
end;
$admin_grants$;

-- Ensure public wrappers for admin functions with existing private implementations run as invoker
do $admin_invoker$
declare
  func_sig text;
  func_oid oid;
begin
  foreach func_sig in array array[
    'public.admin_get_payout_requests()',
    'public.admin_resolve_safety_incident(text,text,text,text)',
    'public.admin_safety_incidents(text,text,integer,integer)',
    'public.admin_update_payout_request(jsonb,text)'
  ]
  loop
    func_oid := to_regprocedure(func_sig)::oid;
    if func_oid is not null then
      execute format('alter function %s security invoker', func_oid::regprocedure);
    end if;
  end loop;
end;
$admin_invoker$;

-- ============================================================================
-- 2. VERIFICATION & RESUBMISSION FUNCTIONS WITH EXISTING PRIVATE IMPLEMENTATIONS
-- Switch the exposed public wrappers to SECURITY INVOKER and revoke from public, anon.
-- ============================================================================

do $verification_wrappers$
declare
  verif_sig text;
  verif_oid oid;
begin
  foreach verif_sig in array array[
    'public.current_rider_verification_details()',
    'public.current_farmer_verification_details()',
    'public.farmer_resubmit_verification(text,text,text,text,text,text,text,text[],text)'
  ]
  loop
    verif_oid := to_regprocedure(verif_sig)::oid;
    if verif_oid is not null then
      execute format('alter function %s security invoker', verif_oid::regprocedure);
      execute format('revoke all on function %s from public, anon', verif_oid::regprocedure);
      execute format('grant execute on function %s to authenticated, service_role', verif_oid::regprocedure);
    end if;
  end loop;
end;
$verification_wrappers$;

-- ============================================================================
-- 3. USER-FACING & MARKETPLACE RPCS: MOVE TO PRIVATE SCHEMA WITH INVOKER WRAPPERS
-- Keeps each client-facing RPC name and signature stable while moving the
-- privileged implementation out of the exposed public schema. The public SQL
-- wrapper runs as the caller (SECURITY INVOKER); only the unexposed implementation
-- runs with the function owner's privileges (SECURITY DEFINER in private schema).
-- ============================================================================

do $harden_client_rpcs$
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
    'public.current_account_dispute_snapshots()',
    'public.current_farmer_reviews()',
    'public.current_user_payout_requests(text)',
    'public.current_user_withdrawal_methods(text)',
    'public.delete_user_withdrawal_method(uuid)',
    'public.farmer_create_sale(bigint,text,text,numeric,timestamp with time zone,timestamp with time zone,text,bigint[])',
    'public.farmer_delete_sale(bigint,bigint)',
    'public.farmer_load_sales(bigint)',
    'public.farmer_update_sale(bigint,bigint,text,text,numeric,timestamp with time zone,timestamp with time zone,text,boolean,bigint[])',
    'public.get_my_safety_incidents(text)',
    'public.marketplace_active_deals()',
    'public.marketplace_product_reviews(bigint)',
    'public.report_current_buyer_order_dispute(text,text,text,text)',
    'public.save_user_withdrawal_method(text,text,text,text,boolean,text)',
    'public.submit_farmer_review_report_or_appeal(bigint,text,text,text)',
    'public.submit_payout_request(numeric,text,text,text,text,text,text)',
    'public.submit_safety_incident(text,text,text,text,text,text,text,text,bigint,bigint,text,double precision,double precision,double precision,jsonb,jsonb)'
  ]
  loop
    target_oid := to_regprocedure(target_signature)::oid;

    if target_oid is null then
      continue;
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

    -- If already security invoker, no need to relocate
    if not is_security_definer then
      continue;
    end if;

    wrapper_arguments := case
      when has_output_arguments then identity_arguments
      else pg_get_function_arguments(target_oid)
    end;

    internal_name := 'api_impl_20260925_' || target_name;

    if exists (
      select 1
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'private'
        and procedure.proname = internal_name
        and procedure.proargtypes = identity_argument_types
    ) then
      continue;
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

    if target_name in ('marketplace_active_deals', 'marketplace_product_reviews') then
      allowed_roles := 'anon, authenticated, service_role';
    else
      allowed_roles := 'authenticated, service_role';
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
$harden_client_rpcs$;

notify pgrst, 'reload schema';

commit;
