begin;

-- Admin RPC to monitor and inspect direct farmer rider selection invitations & dispatch pipelines.
create or replace function public.admin_farmer_rider_requests(
  p_delivery_id bigint default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 200
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  -- Enforce administrator privileges
  if not private.is_admin() then
    raise exception 'Logistics management permission is required' using errcode = '42501';
  end if;

  -- Process any pending expired requests so stats and status are accurate
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'process_rider_assignment_expirations') then
    perform private.process_rider_assignment_expirations();
  end if;

  with base_requests as (
    select
      req.request_id::text,
      req.delivery_id,
      req.seller_order_id,
      d.order_id,
      req.farmer_user_id,
      coalesce(
        nullif(btrim(concat_ws(' ', f.first_name, f.last_name)), ''),
        nullif(farm.farm_name, ''),
        'Farmer #' || req.farmer_user_id
      ) as farmer_name,
      f.phone_number as farmer_phone,
      f.profile_image_url as farmer_image_url,
      coalesce(nullif(farm.farm_name, ''), 'Farm') as farm_name,
      coalesce(
        nullif(farm.farm_location, ''),
        nullif(concat_ws(', ', farm.barangay, farm.city_municipality, farm.province), ''),
        d.pickup_location,
        'Location unavailable'
      ) as farm_location,
      req.rider_id::text,
      coalesce(
        nullif(btrim(r.full_name), ''),
        nullif(concat_ws(' ', r.first_name, r.last_name), ''),
        'Rider'
      ) as rider_name,
      r.contact_number as rider_phone,
      r.vehicle_type as rider_vehicle_type,
      r.availability_status as rider_availability_status,
      r.profile_photo_url as rider_photo_url,
      req.status,
      req.requested_schedule,
      req.proposed_delivery_fee,
      req.requested_at,
      req.expires_at,
      req.responded_at,
      req.failure_reason,
      d.delivery_status,
      coalesce(d.pickup_location, farm.farm_location) as pickup_location,
      d.dropoff_location,
      o.buyer_name_snapshot as customer_name
    from public.rider_assignment_requests req
    join public.deliveries d on d.delivery_id = req.delivery_id
    join public.riders r on r.rider_id = req.rider_id
    left join public.farmers f on f.farmer_user_id = req.farmer_user_id
    left join private.order_delivery_fulfillments ful on ful.delivery_id = req.delivery_id
    left join private.seller_order_registry reg on reg.seller_order_id = req.seller_order_id
    left join public.farms farm on farm.farm_id = coalesce(
      reg.seller_farm_id,
      (select f2.farm_id from public.farms f2 where f2.farmer_user_id = req.farmer_user_id limit 1)
    )
    left join public.orders o on o.order_id = d.order_id
    where (p_delivery_id is null or req.delivery_id = p_delivery_id)
      and (p_status is null or p_status = '' or p_status = 'all' or req.status = p_status)
  ),
  counts as (
    select
      count(*) as total,
      count(*) filter (where status = 'pending') as pending_count,
      count(*) filter (where status = 'accepted') as accepted_count,
      count(*) filter (where status = 'declined') as declined_count,
      count(*) filter (where status = 'expired') as expired_count,
      count(*) filter (where status = 'cancelled') as cancelled_count,
      count(*) filter (where status = 'failed') as failed_count
    from public.rider_assignment_requests
    where (p_delivery_id is null or delivery_id = p_delivery_id)
  )
  select jsonb_build_object(
    'total', coalesce((select total from counts), 0),
    'pending_count', coalesce((select pending_count from counts), 0),
    'accepted_count', coalesce((select accepted_count from counts), 0),
    'declined_count', coalesce((select declined_count from counts), 0),
    'expired_count', coalesce((select expired_count from counts), 0),
    'cancelled_count', coalesce((select cancelled_count from counts), 0),
    'failed_count', coalesce((select failed_count from counts), 0),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r_page) order by r_page.requested_at desc)
      from (
        select * from base_requests
        order by requested_at desc
        limit greatest(1, least(p_limit, 500))
        offset greatest(p_offset, 0)
      ) r_page
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_farmer_rider_requests(bigint, text, integer, integer) from public, anon;
grant execute on function public.admin_farmer_rider_requests(bigint, text, integer, integer) to authenticated, service_role;

commit;
