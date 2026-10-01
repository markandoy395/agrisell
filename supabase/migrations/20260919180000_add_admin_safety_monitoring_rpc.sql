begin;

-- Add resolution audit columns to rider_incidents if not already present
alter table public.rider_incidents
  add column if not exists resolution_notes text,
  add column if not exists resolved_by text,
  add column if not exists resolved_at timestamptz;

-- Function: private.admin_safety_incidents
create or replace function private.admin_safety_incidents(
  p_status text default null,
  p_search text default null,
  p_offset integer default 0,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_status text := nullif(btrim(coalesce(p_status, '')), '');
  clean_search text := nullif(btrim(coalesce(p_search, '')), '');
  total_count integer := 0;
  open_emergencies integer := 0;
  active_accidents integer := 0;
  under_review_count integer := 0;
  resolved_count integer := 0;
  incidents_json jsonb := '[]'::jsonb;
begin
  -- Compute summary metrics
  select
    count(*),
    count(*) filter (where (i.category = 'emergencySos' or i.report_type = 'safety_action') and i.status in ('submitted', 'underReview', 'escalated')),
    count(*) filter (where i.category in ('accident', 'medicalEmergency', 'theft', 'harassment') and i.status in ('submitted', 'underReview', 'escalated')),
    count(*) filter (where i.status in ('underReview', 'waitingForInformation', 'escalated')),
    count(*) filter (where i.status in ('resolved', 'rejected'))
  into
    total_count,
    open_emergencies,
    active_accidents,
    under_review_count,
    resolved_count
  from public.rider_incidents i;

  -- Query filtered incidents
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'report_id', i.report_id,
        'rider_id', i.rider_id,
        'delivery_id', i.delivery_id,
        'report_type', i.report_type,
        'category', i.category,
        'stage', i.stage,
        'description', i.description,
        'latitude', i.latitude,
        'longitude', i.longitude,
        'accuracy_meters', i.accuracy_meters,
        'attachments', i.attachments,
        'requested_actions', i.requested_actions,
        'status', i.status,
        'reported_at', i.reported_at,
        'created_at', i.created_at,
        'updated_at', i.updated_at,
        'resolution_notes', i.resolution_notes,
        'resolved_by', i.resolved_by,
        'resolved_at', i.resolved_at,
        'rider', jsonb_build_object(
          'full_name', coalesce(r.full_name, btrim(concat_ws(' ', r.first_name, r.last_name))),
          'first_name', r.first_name,
          'last_name', r.last_name,
          'contact_number', r.contact_number,
          'email', r.email,
          'vehicle_type', r.vehicle_type,
          'plate_number', r.vehicle_plate_number
        ),
        'delivery', case when d.delivery_id is not null then jsonb_build_object(
          'delivery_id', d.delivery_id,
          'order_id', d.order_id,
          'delivery_status', d.delivery_status,
          'pickup_location', d.pickup_location,
          'dropoff_location', d.dropoff_location
        ) else null end
      ) order by
        case when (i.category = 'emergencySos' or i.report_type = 'safety_action') and i.status in ('submitted', 'underReview', 'escalated') then 0 else 1 end,
        i.reported_at desc
    ),
    '[]'::jsonb
  )
  into incidents_json
  from (
    select i.*
    from public.rider_incidents i
    left join public.riders r on r.rider_id = i.rider_id
    where (
      clean_status is null
      or (clean_status = 'emergency' and (i.category = 'emergencySos' or i.report_type = 'safety_action') and i.status in ('submitted', 'underReview', 'escalated'))
      or (clean_status = 'accidents' and i.category in ('accident', 'medicalEmergency', 'theft', 'harassment'))
      or (clean_status = 'vehicle' and i.category in ('vehicleBreakdown', 'roadClosure', 'severeWeather'))
      or (clean_status = 'open' and i.status in ('submitted', 'underReview', 'waitingForInformation', 'escalated'))
      or (clean_status = 'resolved' and i.status in ('resolved', 'rejected'))
      or lower(i.status) = lower(clean_status)
    )
    and (
      clean_search is null
      or i.report_id ilike '%' || clean_search || '%'
      or i.category ilike '%' || clean_search || '%'
      or i.description ilike '%' || clean_search || '%'
      or r.first_name ilike '%' || clean_search || '%'
      or r.last_name ilike '%' || clean_search || '%'
      or coalesce(r.full_name, '') ilike '%' || clean_search || '%'
      or coalesce(r.contact_number, '') ilike '%' || clean_search || '%'
      or i.delivery_id::text ilike '%' || clean_search || '%'
    )
    order by
      case when (i.category = 'emergencySos' or i.report_type = 'safety_action') and i.status in ('submitted', 'underReview', 'escalated') then 0 else 1 end,
      i.reported_at desc
    offset greatest(0, p_offset)
    limit least(200, greatest(1, p_limit))
  ) i
  left join public.riders r on r.rider_id = i.rider_id
  left join public.deliveries d on d.delivery_id = i.delivery_id;

  return jsonb_build_object(
    'incidents', incidents_json,
    'summary', jsonb_build_object(
      'total_incidents', total_count,
      'open_emergencies', open_emergencies,
      'active_accidents', active_accidents,
      'under_review', under_review_count,
      'resolved', resolved_count
    )
  );
end;
$$;

create or replace function public.admin_safety_incidents(
  p_status text default null,
  p_search text default null,
  p_offset integer default 0,
  p_limit integer default 100
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.admin_safety_incidents(p_status, p_search, p_offset, p_limit);
$$;

-- Function: private.admin_resolve_safety_incident
create or replace function private.admin_resolve_safety_incident(
  p_report_id text,
  p_status text,
  p_notes text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_incident public.rider_incidents%rowtype;
  target_rider public.riders%rowtype;
  clean_status text := btrim(coalesce(p_status, ''));
  clean_notes text := btrim(coalesce(p_notes, ''));
  clean_actor text := btrim(coalesce(p_actor, 'admin'));
begin
  if clean_status not in ('submitted', 'underReview', 'waitingForInformation', 'resolved', 'rejected', 'escalated') then
    raise exception 'Invalid incident status: %', clean_status using errcode = '22023';
  end if;

  if clean_notes = '' then
    raise exception 'Resolution notes are required.' using errcode = '22023';
  end if;

  select * into target_incident
  from public.rider_incidents
  where report_id = p_report_id;

  if target_incident.report_id is null then
    raise exception 'Incident report not found: %', p_report_id using errcode = 'P0002';
  end if;

  update public.rider_incidents
  set
    status = clean_status,
    resolution_notes = clean_notes,
    resolved_by = clean_actor,
    resolved_at = case when clean_status in ('resolved', 'rejected') then now() else resolved_at end,
    updated_at = now()
  where report_id = p_report_id
  returning * into target_incident;

  -- Notify rider
  select * into target_rider
  from public.riders
  where rider_id = target_incident.rider_id;

  if target_rider.auth_id is not null then
    insert into public.notifications (
      recipient_auth_user_id,
      title,
      description,
      notification_type,
      category,
      destination,
      metadata
    ) values (
      target_rider.auth_id,
      case when clean_status in ('resolved', 'rejected') then 'Safety Report Resolved' else 'Safety Report Update' end,
      format('Your safety report (%s) was updated to %s: %s', target_incident.category, clean_status, clean_notes),
      'safety_incident_update',
      'safety',
      'profile',
      jsonb_build_object(
        'report_id', target_incident.report_id,
        'status', clean_status,
        'notes', clean_notes,
        'resolved_by', clean_actor
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'report_id', target_incident.report_id,
    'status', target_incident.status,
    'resolution_notes', target_incident.resolution_notes,
    'resolved_by', target_incident.resolved_by,
    'resolved_at', target_incident.resolved_at,
    'updated_at', target_incident.updated_at
  );
end;
$$;

create or replace function public.admin_resolve_safety_incident(
  p_report_id text,
  p_status text,
  p_notes text,
  p_actor text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.admin_resolve_safety_incident(p_report_id, p_status, p_notes, p_actor);
$$;

revoke all on function private.admin_safety_incidents(text, text, integer, integer) from public, anon;
grant execute on function private.admin_safety_incidents(text, text, integer, integer) to authenticated;
revoke all on function public.admin_safety_incidents(text, text, integer, integer) from public, anon;
grant execute on function public.admin_safety_incidents(text, text, integer, integer) to authenticated;

revoke all on function private.admin_resolve_safety_incident(text, text, text, text) from public, anon;
grant execute on function private.admin_resolve_safety_incident(text, text, text, text) to authenticated;
revoke all on function public.admin_resolve_safety_incident(text, text, text, text) from public, anon;
grant execute on function public.admin_resolve_safety_incident(text, text, text, text) to authenticated;

commit;
