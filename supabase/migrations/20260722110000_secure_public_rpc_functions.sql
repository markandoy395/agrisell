begin;
-- These RPCs must retain privileged access to private tables and controlled
-- cross-table updates. Move their SECURITY DEFINER implementations out of the
-- API-exposed `public` schema and retain identically shaped, SECURITY INVOKER
-- public wrappers for the mobile app.
alter function public.current_application_role() set schema private;
alter function public.provision_current_user_role(text) set schema private;
alter function public.create_current_rider_registration(jsonb) set schema private;
alter function public.current_rider_deliveries(boolean) set schema private;
alter function public.accept_delivery(bigint, uuid) set schema private;
alter function public.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) set schema private;
create function public.current_application_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_application_role()
$$;
create function public.provision_current_user_role(requested_role text)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.provision_current_user_role(requested_role)
$$;
create function public.create_current_rider_registration(rider_payload jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.create_current_rider_registration(rider_payload)
$$;
create function public.current_rider_deliveries(include_available boolean default true)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_rider_deliveries(include_available)
$$;
create function public.accept_delivery(
  p_delivery_id bigint,
  p_idempotency_key uuid
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.accept_delivery(p_delivery_id, p_idempotency_key)
$$;
create function public.update_delivery_status(
  p_delivery_id bigint,
  p_previous_status text,
  p_new_status text,
  p_idempotency_key text,
  p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.update_delivery_status(
    p_delivery_id,
    p_previous_status,
    p_new_status,
    p_idempotency_key,
    p_remarks,
    p_latitude,
    p_longitude
  )
$$;
grant usage on schema private to authenticated;
revoke all on function private.current_application_role() from public, anon;
revoke all on function private.provision_current_user_role(text) from public, anon;
revoke all on function private.create_current_rider_registration(jsonb) from public, anon;
revoke all on function private.current_rider_deliveries(boolean) from public, anon;
revoke all on function private.accept_delivery(bigint, uuid) from public, anon;
revoke all on function private.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) from public, anon;
grant execute on function private.current_application_role() to authenticated;
grant execute on function private.provision_current_user_role(text) to authenticated;
grant execute on function private.create_current_rider_registration(jsonb) to authenticated;
grant execute on function private.current_rider_deliveries(boolean) to authenticated;
grant execute on function private.accept_delivery(bigint, uuid) to authenticated;
grant execute on function private.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) to authenticated;
revoke all on function public.current_application_role() from public, anon;
revoke all on function public.provision_current_user_role(text) from public, anon;
revoke all on function public.create_current_rider_registration(jsonb) from public, anon;
revoke all on function public.current_rider_deliveries(boolean) from public, anon;
revoke all on function public.accept_delivery(bigint, uuid) from public, anon;
revoke all on function public.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) from public, anon;
grant execute on function public.current_application_role() to authenticated;
grant execute on function public.provision_current_user_role(text) to authenticated;
grant execute on function public.create_current_rider_registration(jsonb) to authenticated;
grant execute on function public.current_rider_deliveries(boolean) to authenticated;
grant execute on function public.accept_delivery(bigint, uuid) to authenticated;
grant execute on function public.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) to authenticated;
do $$
declare
  function_name text;
begin
  foreach function_name in array array[
    'public.current_application_role()',
    'public.provision_current_user_role(text)',
    'public.create_current_rider_registration(jsonb)',
    'public.current_rider_deliveries(boolean)',
    'public.accept_delivery(bigint,uuid)',
    'public.update_delivery_status(bigint,text,text,text,text,double precision,double precision)'
  ] loop
    if has_function_privilege('anon', function_name, 'execute') then
      raise exception 'anon must not execute %', function_name;
    end if;
    if not has_function_privilege('authenticated', function_name, 'execute') then
      raise exception 'authenticated must execute %', function_name;
    end if;
    if (select p.prosecdef
        from pg_proc as p
        where p.oid = to_regprocedure(function_name)) then
      raise exception 'public RPC wrapper % must be SECURITY INVOKER', function_name;
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;
