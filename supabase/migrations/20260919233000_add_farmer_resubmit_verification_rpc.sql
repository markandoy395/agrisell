begin;

create or replace function private.current_farmer_verification_details()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_farmer record;
  current_farm record;
  latest_action record;
  latest_info_request record;
  result jsonb;
  action_val text;
  message_val text;
  missing_items_val text[];
  has_info_request boolean := false;
  req_id bigint := null;
  req_by text := null;
  req_at timestamptz := null;
begin
  select
    f.farmer_user_id,
    f.auth_user_id,
    coalesce(f.verification_status, 'pending') as verification_status,
    coalesce(f.account_status, 'active') as account_status,
    f.first_name,
    f.last_name,
    f.phone_number,
    f.profile_image_url
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
    fm.farm_id,
    fm.farm_name,
    fm.street_address,
    fm.barangay,
    fm.city,
    fm.province,
    fm.farm_images
  into current_farm
  from public.farms fm
  where fm.farmer_user_id = current_farmer.farmer_user_id
  limit 1;

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

  select
    r.request_id,
    r.requested_by_email,
    r.status,
    r.created_at
  into latest_info_request
  from public.admin_farmer_information_requests r
  where r.farmer_user_id = current_farmer.farmer_user_id
    and r.status = 'pending'
  order by r.created_at desc
  limit 1;

  if latest_info_request.request_id is not null then
    has_info_request := true;
    req_id := latest_info_request.request_id;
    req_by := latest_info_request.requested_by_email;
    req_at := latest_info_request.created_at;
  end if;

  action_val := latest_action.action;
  message_val := latest_action.message;
  missing_items_val := coalesce(latest_action.missing_items, '{}'::text[]);

  if has_info_request and (action_val is null or action_val != 'rejected') then
    action_val := 'needs_information';
    if message_val is null or btrim(message_val) = '' then
      message_val := 'Please review your farmer profile and submit the missing or outdated verification information.';
    end if;
  end if;

  result := jsonb_build_object(
    'found', true,
    'farmer_user_id', current_farmer.farmer_user_id,
    'verification_status', current_farmer.verification_status,
    'account_status', current_farmer.account_status,
    'first_name', current_farmer.first_name,
    'last_name', current_farmer.last_name,
    'phone_number', current_farmer.phone_number,
    'profile_image_url', current_farmer.profile_image_url,
    'farm_id', current_farm.farm_id,
    'farm_name', current_farm.farm_name,
    'farm_address', current_farm.street_address,
    'barangay', current_farm.barangay,
    'city', current_farm.city,
    'province', current_farm.province,
    'farm_images', to_jsonb(coalesce(current_farm.farm_images, '{}'::text[])),
    'action', action_val,
    'reason', latest_action.reason,
    'message', message_val,
    'missing_items', to_jsonb(missing_items_val),
    'reviewed_at', latest_action.reviewed_at,
    'has_information_request', has_info_request,
    'request_id', req_id,
    'requested_by', req_by,
    'requested_at', req_at
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

create or replace function private.farmer_resubmit_verification(
  p_first_name text default null,
  p_last_name text default null,
  p_phone_number text default null,
  p_farm_name text default null,
  p_farm_address text default null,
  p_profile_image_url text default null,
  p_farm_image_url text default null,
  p_document_urls text[] default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_farmer record;
  current_farm record;
begin
  select
    f.farmer_user_id,
    f.auth_user_id
  into current_farmer
  from public.farmers f
  where f.auth_user_id = (select auth.uid())
  limit 1;

  if current_farmer.farmer_user_id is null then
    raise exception 'Farmer account not found.';
  end if;

  update public.farmers
  set
    first_name = coalesce(nullif(btrim(p_first_name), ''), first_name),
    last_name = coalesce(nullif(btrim(p_last_name), ''), last_name),
    phone_number = coalesce(nullif(btrim(p_phone_number), ''), phone_number),
    profile_image_url = coalesce(nullif(btrim(p_profile_image_url), ''), profile_image_url),
    verification_status = 'pending'
  where farmer_user_id = current_farmer.farmer_user_id;

  select farm_id into current_farm
  from public.farms
  where farmer_user_id = current_farmer.farmer_user_id
  limit 1;

  if current_farm.farm_id is not null then
    update public.farms
    set
      farm_name = coalesce(nullif(btrim(p_farm_name), ''), farm_name),
      street_address = coalesce(nullif(btrim(p_farm_address), ''), street_address),
      farm_images = case
        when p_farm_image_url is not null and btrim(p_farm_image_url) != '' then array[p_farm_image_url]
        else farm_images
      end
    where farm_id = current_farm.farm_id;
  end if;

  update public.admin_farmer_information_requests
  set status = 'completed'
  where farmer_user_id = current_farmer.farmer_user_id
    and status = 'pending';

  insert into public.admin_verification_actions (
    entity_type,
    entity_id,
    action,
    message,
    actor_email,
    created_at
  ) values (
    'farmer',
    current_farmer.farmer_user_id::text,
    'resubmitted',
    coalesce(nullif(btrim(p_notes), ''), 'Farmer resubmitted requested information and documents.'),
    'farmer@agrisell.local',
    now()
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Verification information and documents resubmitted successfully.'
  );
end;
$$;

create or replace function public.farmer_resubmit_verification(
  p_first_name text default null,
  p_last_name text default null,
  p_phone_number text default null,
  p_farm_name text default null,
  p_farm_address text default null,
  p_profile_image_url text default null,
  p_farm_image_url text default null,
  p_document_urls text[] default null,
  p_notes text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.farmer_resubmit_verification(
    p_first_name,
    p_last_name,
    p_phone_number,
    p_farm_name,
    p_farm_address,
    p_profile_image_url,
    p_farm_image_url,
    p_document_urls,
    p_notes
  );
$$;

revoke all on function private.farmer_resubmit_verification(text, text, text, text, text, text, text, text[], text) from public, anon;
grant execute on function private.farmer_resubmit_verification(text, text, text, text, text, text, text, text[], text) to authenticated;
revoke all on function public.farmer_resubmit_verification(text, text, text, text, text, text, text, text[], text) from public, anon;
grant execute on function public.farmer_resubmit_verification(text, text, text, text, text, text, text, text[], text) to authenticated;

commit;
