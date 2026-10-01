begin;

create or replace function private.current_rider_verification_details()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_rider record;
  latest_action record;
  docs_json jsonb;
  result jsonb;
begin
  select
    r.rider_id,
    r.auth_id,
    coalesce(r.verification_status, 'pending') as verification_status,
    coalesce(r.employment_status, 'inactive') as employment_status
  into current_rider
  from public.riders r
  where r.auth_id = (select auth.uid())
  limit 1;

  if current_rider.rider_id is null then
    return jsonb_build_object(
      'found', false,
      'error', 'Rider record not found'
    );
  end if;

  select
    a.action,
    a.reason,
    a.message,
    coalesce(a.missing_items, '{}'::text[]) as missing_items,
    a.created_at as reviewed_at
  into latest_action
  from public.admin_verification_actions a
  where a.entity_type = 'rider'
    and a.entity_id = current_rider.rider_id::text
  order by a.created_at desc
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'document_id', d.document_id,
        'document_type', d.document_type,
        'document_number', d.document_number,
        'verification_status', coalesce(d.verification_status, 'pending'),
        'rejection_reason', d.rejection_reason,
        'updated_at', d.updated_at
      ) order by d.created_at asc
    ),
    '[]'::jsonb
  )
  into docs_json
  from public.rider_documents d
  where d.rider_id = current_rider.rider_id;

  result := jsonb_build_object(
    'found', true,
    'rider_id', current_rider.rider_id,
    'verification_status', current_rider.verification_status,
    'employment_status', current_rider.employment_status,
    'action', latest_action.action,
    'reason', latest_action.reason,
    'message', latest_action.message,
    'missing_items', to_jsonb(coalesce(latest_action.missing_items, '{}'::text[])),
    'reviewed_at', latest_action.reviewed_at,
    'documents', docs_json
  );

  return result;
end;
$$;

create or replace function public.current_rider_verification_details()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.current_rider_verification_details();
$$;

create or replace function private.current_farmer_verification_details()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_farmer record;
  latest_action record;
  result jsonb;
begin
  select
    f.farmer_user_id,
    f.auth_user_id,
    coalesce(f.verification_status, 'pending') as verification_status,
    coalesce(f.account_status, 'active') as account_status
  into current_farmer
  from public.farmers f
  where f.auth_user_id = (select auth.uid())
  limit 1;

  if current_farmer.farmer_user_id is null then
    return jsonb_build_object(
      'found', false,
      'error', 'Farmer record not found'
    );
  end if;

  select
    a.action,
    a.reason,
    a.message,
    coalesce(a.missing_items, '{}'::text[]) as missing_items,
    a.created_at as reviewed_at
  into latest_action
  from public.admin_verification_actions a
  where a.entity_type = 'farmer'
    and a.entity_id = current_farmer.farmer_user_id::text
  order by a.created_at desc
  limit 1;

  result := jsonb_build_object(
    'found', true,
    'farmer_user_id', current_farmer.farmer_user_id,
    'verification_status', current_farmer.verification_status,
    'account_status', current_farmer.account_status,
    'action', latest_action.action,
    'reason', latest_action.reason,
    'message', latest_action.message,
    'missing_items', to_jsonb(coalesce(latest_action.missing_items, '{}'::text[])),
    'reviewed_at', latest_action.reviewed_at
  );

  return result;
end;
$$;

create or replace function public.current_farmer_verification_details()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.current_farmer_verification_details();
$$;

revoke all on function private.current_rider_verification_details() from public, anon;
grant execute on function private.current_rider_verification_details() to authenticated;
revoke all on function public.current_rider_verification_details() from public, anon;
grant execute on function public.current_rider_verification_details() to authenticated;

revoke all on function private.current_farmer_verification_details() from public, anon;
grant execute on function private.current_farmer_verification_details() to authenticated;
revoke all on function public.current_farmer_verification_details() from public, anon;
grant execute on function public.current_farmer_verification_details() to authenticated;

commit;
