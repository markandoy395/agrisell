begin;
create table public.rider_assignment_requests (
  request_id uuid primary key default extensions.gen_random_uuid(),
  delivery_id bigint not null references public.deliveries(delivery_id)
    on delete cascade,
  seller_order_id text not null,
  rider_id uuid not null references public.riders(rider_id) on delete restrict,
  farmer_user_id bigint not null references public.farmers(farmer_user_id)
    on delete restrict,
  status text not null default 'pending' check (
    status in ('pending', 'accepted', 'declined', 'expired', 'cancelled', 'failed')
  ),
  requested_schedule timestamptz not null,
  proposed_delivery_fee numeric(14,2) check (
    proposed_delivery_fee is null or proposed_delivery_fee >= 0
  ),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  failure_reason text,
  updated_at timestamptz not null default now(),
  check (expires_at > requested_at),
  check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  )
);
create unique index rider_assignment_requests_one_pending_delivery_idx
  on public.rider_assignment_requests(delivery_id)
  where status = 'pending';
create unique index rider_assignment_requests_one_accepted_delivery_idx
  on public.rider_assignment_requests(delivery_id)
  where status = 'accepted';
create index rider_assignment_requests_farmer_order_idx
  on public.rider_assignment_requests(
    farmer_user_id, seller_order_id, requested_at desc
  );
create index rider_assignment_requests_rider_status_idx
  on public.rider_assignment_requests(rider_id, status, expires_at);
alter table public.rider_assignment_requests enable row level security;
create policy rider_assignment_requests_participant_read
on public.rider_assignment_requests for select to authenticated using (
  farmer_user_id = private.current_farmer_user_id()
  or rider_id = private.current_rider_id()
  or private.is_admin()
);
revoke all on public.rider_assignment_requests from public, anon, authenticated;
grant select on public.rider_assignment_requests to authenticated;
create trigger rider_assignment_requests_set_updated_at
before update on public.rider_assignment_requests
for each row execute function public.set_updated_at();
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rider_assignment_requests'
  ) then
    alter publication supabase_realtime
      add table public.rider_assignment_requests;
  end if;
end
$$;
-- Profile photos are intentionally stored separately from Rider documents.
-- Resolve the owning Rider through the private Auth mapping used by the final
-- ERD, and allow only the exact active Rider profile-photo object.
create or replace function private.is_active_rider_profile_photo(
  object_name text
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.riders as rider
    join private.auth_identities as identity
      on identity.rider_id = rider.rider_id
    where identity.auth_user_id::text =
        (storage.foldername(object_name))[1]
      and (storage.foldername(object_name))[2] = 'profile'
      and rider.profile_photo_url = object_name
      and rider.employment_status = 'active'
  )
$$;
drop policy if exists rider_verified_profile_photo_read on storage.objects;
create policy rider_verified_profile_photo_read
on storage.objects for select to authenticated using (
  bucket_id = 'rider-documents'
  and private.is_active_rider_profile_photo(name)
);
create or replace function private.rider_is_eligible_for_delivery(
  target_delivery_id bigint,
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.riders as rider
    join private.auth_identities as identity
      on identity.rider_id = rider.rider_id
    join public.users as app_user on app_user.user_id = identity.user_id
    left join public.logistics_companies as company
      on company.logistics_company_id = rider.logistics_company_id
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.delivery_id = target_delivery_id
    join private.seller_order_registry as registry
      on registry.seller_order_id = fulfillment.seller_order_id
    join public.farms as farm on farm.farm_id = registry.seller_farm_id
    where rider.rider_id = target_rider_id
      and app_user.account_status = 'active'
      and rider.employment_status = 'active'
      and rider.availability_status = 'online'
      and nullif(btrim(rider.first_name), '') is not null
      and nullif(btrim(rider.last_name), '') is not null
      and nullif(btrim(rider.contact_number), '') is not null
      and nullif(btrim(rider.vehicle_type), '') is not null
      and nullif(btrim(farm.city_municipality), '') is not null
      and (
        strpos(
          lower(coalesce(rider.location_label, '')),
          lower(btrim(farm.city_municipality))
        ) > 0
        or strpos(
          lower(coalesce(
            array_to_string(company.service_areas, ','), ''
          )),
          lower(btrim(farm.city_municipality))
        ) > 0
      )
      and regexp_replace(lower(rider.vehicle_type), '[^a-z0-9]', '', 'g') =
          regexp_replace(
            lower(fulfillment.required_vehicle_type), '[^a-z0-9]', '', 'g'
          )
      and not exists (
        select 1
        from private.rider_delivery_assignments as assignment
        join public.deliveries as active_delivery
          on active_delivery.delivery_id = assignment.delivery_id
        where assignment.rider_id = rider.rider_id
          and active_delivery.delivery_status not in (
            'completed', 'delivered', 'cancelled', 'failed', 'returned'
          )
      )
  )
$$;
create or replace function private.rider_assignment_request_json(
  target public.rider_assignment_requests
) returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(target) || jsonb_build_object(
    'rider_name', coalesce(
      nullif(btrim(rider.full_name), ''),
      concat_ws(' ', rider.first_name, rider.last_name)
    ),
    'rider_barangay', case
      when nullif(btrim(farm.barangay), '') is not null
        and strpos(lower(coalesce(rider.location_label, '')),
          lower(btrim(farm.barangay))) > 0
        then farm.barangay
      else nullif(btrim(split_part(coalesce(rider.location_label, ''), ',', 1)), '')
    end,
    'rider_municipality', farm.city_municipality,
    'rider_profile_photo_path', rider.profile_photo_url
  )
  from public.riders as rider
  join private.order_delivery_fulfillments as fulfillment
    on fulfillment.delivery_id = target.delivery_id
  join private.seller_order_registry as registry
    on registry.seller_order_id = fulfillment.seller_order_id
  join public.farms as farm on farm.farm_id = registry.seller_farm_id
  where rider.rider_id = target.rider_id
$$;
create or replace function private.notify_rider_assignment_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  farmer_auth_id uuid;
  rider_auth_id uuid;
  representative_order_id bigint;
  rider_name text;
  notification_title text;
  notification_description text;
  notification_type text;
begin
  if new.status is not distinct from old.status then return new; end if;

  select farmer.auth_user_id into farmer_auth_id
  from public.farmers as farmer
  where farmer.farmer_user_id = new.farmer_user_id;
  select identity.auth_user_id,
    coalesce(nullif(btrim(rider.full_name), ''),
      concat_ws(' ', rider.first_name, rider.last_name))
  into rider_auth_id, rider_name
  from public.riders as rider
  join private.auth_identities as identity
    on identity.rider_id = rider.rider_id
  where rider.rider_id = new.rider_id;
  select delivery.order_id into representative_order_id
  from public.deliveries as delivery
  where delivery.delivery_id = new.delivery_id;

  select case new.status
      when 'accepted' then 'Rider accepted your request'
      when 'declined' then 'Rider declined your request'
      when 'expired' then 'Rider request expired'
      when 'failed' then 'Rider request failed'
    end,
    case new.status
      when 'accepted' then format(
        '%s accepted the delivery request. The rider is now assigned.', rider_name
      )
      when 'declined' then format(
        '%s declined the delivery request. You can choose another rider.', rider_name
      )
      when 'expired' then format(
        '%s did not respond in time. You can choose another rider.', rider_name
      )
      when 'failed' then format(
        '%s is no longer eligible for this delivery. Choose another rider.',
        rider_name
      )
    end,
    case new.status
      when 'accepted' then 'rider_assignment_accepted'
      when 'declined' then 'rider_assignment_declined'
      when 'expired' then 'rider_assignment_expired'
      when 'failed' then 'rider_assignment_failed'
    end
  into notification_title, notification_description, notification_type;

  if new.status in ('accepted', 'declined', 'expired', 'failed')
     and farmer_auth_id is not null then
    insert into public.notifications (
      recipient_auth_user_id, title, description, notification_type,
      category, destination, order_id, metadata
    ) values (
      farmer_auth_id, notification_title, notification_description,
      notification_type, 'orders', 'orders', representative_order_id,
      jsonb_build_object(
        'event_id', new.request_id::text || ':' || new.status,
        'request_id', new.request_id,
        'delivery_id', new.delivery_id,
        'client_order_id', new.seller_order_id,
        'rider_id', new.rider_id,
        'rider_name', rider_name,
        'request_status', new.status
      )
    );
  end if;

  if new.status in ('cancelled', 'expired', 'failed')
     and rider_auth_id is not null then
    insert into public.notifications (
      recipient_auth_user_id, title, description, notification_type,
      category, destination, order_id, metadata
    ) values (
      rider_auth_id,
      case new.status
        when 'cancelled' then 'Delivery request cancelled'
        when 'expired' then 'Delivery request expired'
        else 'Delivery request unavailable'
      end,
      case new.status
        when 'cancelled' then 'The farmer cancelled this delivery request.'
        when 'expired' then 'This delivery request expired before a response.'
        else 'This delivery request is no longer available.'
      end,
      case new.status
        when 'cancelled' then 'rider_assignment_cancelled'
        when 'expired' then 'rider_assignment_expired'
        else 'rider_assignment_failed'
      end,
      'orders', 'deliveries', representative_order_id,
      jsonb_build_object(
        'event_id', new.request_id::text || ':' || new.status || ':rider',
        'request_id', new.request_id,
        'delivery_id', new.delivery_id,
        'client_order_id', new.seller_order_id,
        'request_status', new.status
      )
    );
  end if;
  return new;
end;
$$;
create trigger rider_assignment_requests_notify_status
after update of status on public.rider_assignment_requests
for each row execute function private.notify_rider_assignment_status_change();
create or replace function private.fail_rider_requests_when_unavailable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.employment_status, '') <> 'active'
     or coalesce(new.availability_status, '') <> 'online' then
    update public.rider_assignment_requests
    set status = 'failed', responded_at = now(),
      failure_reason = 'Rider became unavailable'
    where rider_id = new.rider_id and status = 'pending';
  end if;
  return new;
end;
$$;
create trigger riders_fail_pending_assignment_requests
after update of employment_status, availability_status on public.riders
for each row execute function private.fail_rider_requests_when_unavailable();
create or replace function private.process_rider_assignment_expirations()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare expired_count integer;
begin
  update public.rider_assignment_requests
  set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now();
  get diagnostics expired_count = row_count;
  return jsonb_build_object('expired', expired_count);
end;
$$;
create or replace function public.eligible_riders_for_current_farmer_order(
  p_seller_order_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_farmer bigint := private.current_farmer_user_id();
  target record;
begin
  if current_farmer is null then
    raise exception 'Only a farmer can choose a rider' using errcode = '42501';
  end if;
  perform private.process_rider_assignment_expirations();

  select fulfillment.delivery_id, fulfillment.pickup_lat,
    fulfillment.pickup_long, fulfillment.dropoff_lat,
    fulfillment.dropoff_long, fulfillment.total_weight_kg,
    fulfillment.required_vehicle_type, fulfillment.ready_at,
    farm.farm_location as pickup_address, farm.barangay as pickup_barangay,
    farm.city_municipality as pickup_municipality,
    delivery.dropoff_location as destination,
    delivery.estimated_delivery_time as requested_schedule,
    null::numeric as proposed_fee,
    delivery.order_id
  into target
  from private.order_delivery_fulfillments as fulfillment
  join private.seller_order_registry as registry
    on registry.seller_order_id = fulfillment.seller_order_id
  join public.farms as farm on farm.farm_id = registry.seller_farm_id
  join public.deliveries as delivery
    on delivery.delivery_id = fulfillment.delivery_id
  where fulfillment.seller_order_id = btrim(p_seller_order_id)
    and farm.farmer_user_id = current_farmer;
  if target.delivery_id is null then
    raise exception 'The ready delivery was not found' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'order', jsonb_build_object(
      'seller_order_id', btrim(p_seller_order_id),
      'delivery_id', target.delivery_id,
      'pickup_address', target.pickup_address,
      'pickup_barangay', target.pickup_barangay,
      'pickup_municipality', target.pickup_municipality,
      'destination', target.destination,
      'requested_schedule', coalesce(target.requested_schedule, target.ready_at),
      'proposed_delivery_fee', target.proposed_fee,
      'goods_summary', coalesce((
        select string_agg(
          format('%s %s %s', cart_item.quantity,
            coalesce(commodity.unit_type, 'unit'), commodity.commodity_name),
          ', ' order by commodity.commodity_name
        )
        from public.orders as order_record
        join public.cart_items as cart_item
          on cart_item.cart_item_id = order_record.cart_item_id
        join public.commodities as commodity
          on commodity.commodity_id = cart_item.commodity_id
        where order_record.client_order_id = btrim(p_seller_order_id)
      ), 'Farm produce')
    ),
    'riders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rider_id', candidate.rider_id,
        'name', candidate.rider_name,
        'profile_photo_path', candidate.profile_photo_url,
        'barangay', candidate.barangay,
        'municipality', candidate.city_municipality,
        'same_barangay', candidate.same_barangay,
        'distance_km', candidate.distance_km,
        'rating', candidate.rating,
        'completed_deliveries', candidate.total_deliveries,
        'availability_status', 'available',
        'proposed_delivery_fee', target.proposed_fee
      ) order by candidate.same_barangay desc,
        candidate.distance_km asc nulls last,
        candidate.rating desc, candidate.total_deliveries desc,
        candidate.rider_name)
      from (
        select rider.rider_id,
          coalesce(nullif(btrim(rider.full_name), ''),
            concat_ws(' ', rider.first_name, rider.last_name)) as rider_name,
          rider.profile_photo_url,
          case
            when nullif(btrim(target.pickup_barangay), '') is not null
              and strpos(lower(coalesce(rider.location_label, '')),
                lower(btrim(target.pickup_barangay))) > 0
              then target.pickup_barangay
            else nullif(btrim(split_part(
              coalesce(rider.location_label, ''), ',', 1
            )), '')
          end as barangay,
          target.pickup_municipality as city_municipality,
          nullif(btrim(target.pickup_barangay), '') is not null
            and strpos(lower(coalesce(rider.location_label, '')),
              lower(btrim(target.pickup_barangay))) > 0 as same_barangay,
          case when rider.gps_lat is not null
              and rider.gps_long is not null then
            6371 * acos(least(1, greatest(-1,
              sin(radians(target.pickup_lat)) *
                sin(radians(rider.gps_lat::double precision))
              + cos(radians(target.pickup_lat)) *
                cos(radians(rider.gps_lat::double precision))
              * cos(radians(rider.gps_long::double precision) -
                radians(target.pickup_long))
            )))
          end as distance_km,
          coalesce(rider.rating, 0) as rating,
          coalesce(rider.total_deliveries, 0) as total_deliveries
        from public.riders as rider
        where private.rider_is_eligible_for_delivery(
          target.delivery_id, rider.rider_id
        )
      ) as candidate
    ), '[]'::jsonb)
  );
end;
$$;
create or replace function public.current_farmer_rider_assignment_requests()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_farmer bigint := private.current_farmer_user_id();
begin
  if current_farmer is null then
    raise exception 'Only a farmer can view rider requests'
      using errcode = '42501';
  end if;
  perform private.process_rider_assignment_expirations();
  return coalesce((
    select jsonb_agg(private.rider_assignment_request_json(request_record)
      order by request_record.requested_at desc)
    from public.rider_assignment_requests as request_record
    where request_record.farmer_user_id = current_farmer
  ), '[]'::jsonb);
end;
$$;
create or replace function public.request_current_farmer_rider(
  p_seller_order_id text,
  p_rider_id uuid,
  p_requested_schedule timestamptz default null,
  p_proposed_delivery_fee numeric default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_farmer bigint := private.current_farmer_user_id();
  target record;
  saved public.rider_assignment_requests%rowtype;
  rider_auth_id uuid;
  summary text;
begin
  if current_farmer is null then
    raise exception 'Only a farmer can request a rider' using errcode = '42501';
  end if;
  if p_proposed_delivery_fee is not null and p_proposed_delivery_fee < 0 then
    raise exception 'The proposed delivery fee is invalid' using errcode = '22023';
  end if;
  perform private.process_rider_assignment_expirations();

  select fulfillment.delivery_id, fulfillment.ready_at,
    farm.farm_location as pickup_address,
    delivery.dropoff_location as destination,
    delivery.estimated_delivery_time,
    null::numeric as delivery_fee,
    delivery.delivery_status, delivery.order_id
  into target
  from private.order_delivery_fulfillments as fulfillment
  join private.seller_order_registry as registry
    on registry.seller_order_id = fulfillment.seller_order_id
  join public.farms as farm on farm.farm_id = registry.seller_farm_id
  join public.deliveries as delivery
    on delivery.delivery_id = fulfillment.delivery_id
  where fulfillment.seller_order_id = btrim(p_seller_order_id)
    and farm.farmer_user_id = current_farmer;
  if target.delivery_id is null then
    raise exception 'The ready delivery was not found' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(target.delivery_id);
  perform 1 from public.deliveries
    where delivery_id = target.delivery_id for update;
  select delivery.delivery_status into target.delivery_status
  from public.deliveries as delivery
  where delivery.delivery_id = target.delivery_id;
  if target.delivery_status <> 'available'
     or exists (
       select 1 from private.rider_delivery_assignments
       where delivery_id = target.delivery_id
     ) then
    raise exception 'This order already has a rider' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.rider_assignment_requests
    where delivery_id = target.delivery_id and status in ('pending', 'accepted')
  ) then
    raise exception 'This order already has an active rider request'
      using errcode = '40001';
  end if;
  if not private.rider_is_eligible_for_delivery(
    target.delivery_id, p_rider_id
  ) then
    raise exception 'The selected rider is no longer eligible or available'
      using errcode = '22023';
  end if;

  insert into public.rider_assignment_requests (
    delivery_id, seller_order_id, rider_id, farmer_user_id,
    requested_schedule, proposed_delivery_fee, expires_at
  ) values (
    target.delivery_id, btrim(p_seller_order_id), p_rider_id, current_farmer,
    coalesce(p_requested_schedule, target.estimated_delivery_time,
      target.ready_at, now()),
    coalesce(p_proposed_delivery_fee, target.delivery_fee),
    now() + interval '15 minutes'
  ) returning * into saved;

  select identity.auth_user_id into rider_auth_id
  from private.auth_identities as identity
  where identity.rider_id = saved.rider_id;
  select coalesce(string_agg(
      format('%s %s %s', cart_item.quantity,
        coalesce(commodity.unit_type, 'unit'), commodity.commodity_name),
      ', ' order by commodity.commodity_name), 'Farm produce')
  into summary
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.commodities as commodity
    on commodity.commodity_id = cart_item.commodity_id
  where order_record.client_order_id = btrim(p_seller_order_id);

  insert into public.notifications (
    recipient_auth_user_id, title, description, notification_type,
    category, destination, order_id, metadata
  ) values (
    rider_auth_id, 'New delivery request',
    format('Order %s: %s. Review the pickup and delivery details.',
      saved.seller_order_id, summary),
    'delivery_request', 'orders', 'deliveries', target.order_id,
    jsonb_build_object(
      'event_id', saved.request_id::text || ':created',
      'request_id', saved.request_id,
      'delivery_id', saved.delivery_id,
      'client_order_id', saved.seller_order_id,
      'goods_summary', summary,
      'pickup_location', target.pickup_address,
      'destination', target.destination,
      'requested_schedule', saved.requested_schedule,
      'proposed_delivery_fee', saved.proposed_delivery_fee,
      'expires_at', saved.expires_at,
      'request_status', saved.status
    )
  );
  return private.rider_assignment_request_json(saved);
end;
$$;
create or replace function public.cancel_current_farmer_rider_request(
  p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_farmer bigint := private.current_farmer_user_id();
  saved public.rider_assignment_requests%rowtype;
begin
  if current_farmer is null then
    raise exception 'Only a farmer can cancel a rider request'
      using errcode = '42501';
  end if;
  perform private.process_rider_assignment_expirations();
  select * into saved from public.rider_assignment_requests
  where rider_assignment_requests.request_id = p_request_id
    and farmer_user_id = current_farmer for update;
  if not found then raise exception 'Rider request not found' using errcode = '22023'; end if;
  if saved.status <> 'pending' then
    raise exception 'Only a pending rider request can be cancelled'
      using errcode = '22023';
  end if;
  update public.rider_assignment_requests
  set status = 'cancelled', responded_at = now()
  where rider_assignment_requests.request_id = saved.request_id
  returning * into saved;
  return private.rider_assignment_request_json(saved);
end;
$$;
create or replace function public.decline_delivery_request(
  p_delivery_id bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_rider uuid := private.current_rider_id();
  saved public.rider_assignment_requests%rowtype;
begin
  if current_rider is null then
    raise exception 'Only a rider can decline a delivery request'
      using errcode = '42501';
  end if;
  perform private.process_rider_assignment_expirations();
  select * into saved from public.rider_assignment_requests
  where delivery_id = p_delivery_id and rider_id = current_rider
    and status = 'pending' and expires_at > now()
  order by requested_at desc limit 1 for update;
  if not found then
    raise exception 'This delivery request is no longer pending'
      using errcode = '22023';
  end if;
  update public.rider_assignment_requests
  set status = 'declined', responded_at = now()
  where request_id = saved.request_id returning * into saved;
  return private.rider_assignment_request_json(saved);
end;
$$;
-- Only a pending request selected for the authenticated Rider may now be
-- accepted. The delivery row and request are locked in one transaction.
create or replace function private.accept_delivery(
  p_delivery_id bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_rider uuid := private.current_rider_id();
  target public.deliveries%rowtype;
  selected_request public.rider_assignment_requests%rowtype;
  previous_status text;
begin
  if current_rider is null then
    raise exception 'Rider identity required' using errcode = '42501';
  end if;
  select * into target from public.deliveries
  where delivery_id = p_delivery_id for update;
  if not found then raise exception 'Delivery not found' using errcode = '22023'; end if;

  perform 1 from public.riders
  where rider_id = current_rider for update;
  if not found then
    raise exception 'Rider profile not found' using errcode = '22023';
  end if;

  select * into selected_request
  from public.rider_assignment_requests
  where delivery_id = p_delivery_id and rider_id = current_rider
    and status in ('pending', 'accepted')
  order by requested_at desc limit 1 for update;

  if selected_request.status = 'accepted'
     and exists (
       select 1 from private.rider_delivery_assignments
       where delivery_id = p_delivery_id and rider_id = current_rider
     ) then
    return to_jsonb(target) || jsonb_build_object(
      'assigned_to_current_rider', true,
      'assignment_request_id', selected_request.request_id,
      'assignment_request_status', selected_request.status,
      'idempotency_key', p_idempotency_key
    );
  end if;
  if selected_request.request_id is null then
    raise exception 'This delivery was not requested for this Rider'
      using errcode = '42501';
  end if;
  if selected_request.expires_at <= now() then
    raise exception 'Delivery request expired' using errcode = '22023';
  end if;
  if target.delivery_status <> 'available'
     or exists (
       select 1 from private.rider_delivery_assignments
       where delivery_id = p_delivery_id
     ) then
    raise exception 'Delivery is no longer available' using errcode = '40001';
  end if;
  if not private.rider_is_eligible_for_delivery(p_delivery_id, current_rider) then
    raise exception 'Rider is no longer eligible and available'
      using errcode = '22023';
  end if;

  previous_status := target.delivery_status;
  insert into private.rider_delivery_assignments (
    delivery_id, rider_id, assigned_at
  ) values (p_delivery_id, current_rider, now());
  update public.deliveries set delivery_status = 'accepted'
  where delivery_id = p_delivery_id returning * into target;
  insert into private.delivery_status_events (
    delivery_id, idempotency_key, previous_status, new_status
  ) values (
    p_delivery_id, p_idempotency_key::text, previous_status, 'accepted'
  );
  update public.rider_assignment_requests
  set status = 'accepted', responded_at = now()
  where request_id = selected_request.request_id
  returning * into selected_request;
  update public.riders
  set availability_status = 'busy'
  where rider_id = current_rider;
  return to_jsonb(target) || jsonb_build_object(
    'assigned_to_current_rider', true,
    'assignment_request_id', selected_request.request_id,
    'assignment_request_status', selected_request.status,
    'idempotency_key', p_idempotency_key
  );
end;
$$;
-- Preserve the existing Rider delivery bundle shape while limiting available
-- deliveries to requests explicitly selected for the current Rider.
create or replace function private.current_rider_deliveries(
  include_available boolean default true
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    to_jsonb(delivery) || jsonb_build_object(
      'assigned_to_current_rider', assignment.rider_id is not null,
      'assignment_request_id', selected_request.request_id,
      'assignment_request_status', selected_request.status,
      'assignment_request_expires_at', selected_request.expires_at,
      'requested_schedule', selected_request.requested_schedule,
      'proposed_delivery_fee', selected_request.proposed_delivery_fee,
      'payment_method', order_summary.payment_method,
      'payment_status', order_summary.payment_status,
      'amount_to_collect', case
        when order_summary.payment_method = 'cash_on_delivery'
          then order_summary.order_total else null end,
      'goods_summary', order_summary.goods_summary,
      'seller_name', order_summary.seller_name,
      'buyer_name', order_summary.buyer_name,
      'total_weight_kg', fulfillment.total_weight_kg,
      'required_capacity_kg', fulfillment.total_weight_kg,
      'service_area', order_summary.pickup_municipality,
      'delivery_fee', selected_request.proposed_delivery_fee,
      'expires_at', selected_request.expires_at,
      'locations', case when fulfillment.delivery_id is null then '[]'::jsonb
        else jsonb_build_array(
          jsonb_build_object(
            'location_id', 'pickup-' || delivery.delivery_id,
            'delivery_id', delivery.delivery_id,
            'location_type', 'pickup', 'address', delivery.pickup_location,
            'latitude', fulfillment.pickup_lat,
            'longitude', fulfillment.pickup_long,
            'contact_number', fulfillment.pickup_contact,
            'sequence_number', 1, 'created_at', fulfillment.ready_at,
            'updated_at', fulfillment.ready_at
          ),
          jsonb_build_object(
            'location_id', 'dropoff-' || delivery.delivery_id,
            'delivery_id', delivery.delivery_id,
            'location_type', 'dropoff', 'address', delivery.dropoff_location,
            'latitude', fulfillment.dropoff_lat,
            'longitude', fulfillment.dropoff_long,
            'contact_number', fulfillment.dropoff_contact,
            'sequence_number', 1, 'created_at', fulfillment.ready_at,
            'updated_at', fulfillment.ready_at
          )
        ) end,
      'requirement', case when fulfillment.delivery_id is null then null
        else jsonb_build_object(
          'requirement_id', 'requirement-' || delivery.delivery_id,
          'delivery_id', delivery.delivery_id,
          'required_vehicle_type', fulfillment.required_vehicle_type,
          'minimum_capacity_kg', fulfillment.total_weight_kg,
          'requires_cooling', coalesce(delivery.cold_chain_available, false),
          'requires_fragile_handling', true,
          'requires_waterproof_cover', true,
          'requires_special_handling', true,
          'handling_notes', fulfillment.handling_notes,
          'cancellation_conditions',
            'Cancellation closes once the selected rider accepts.',
          'created_at', fulfillment.ready_at,
          'updated_at', fulfillment.ready_at
        ) end,
      'history', coalesce((
        select jsonb_agg(
          to_jsonb(event) || jsonb_build_object(
            'status_history_id', event.idempotency_key,
            'created_at', event.changed_at
          ) order by event.changed_at
        )
        from private.delivery_status_events as event
        where event.delivery_id = delivery.delivery_id
      ), '[]'::jsonb)
    ) order by delivery.created_at desc
  ), '[]'::jsonb)
  from public.deliveries as delivery
  left join private.rider_delivery_assignments as assignment
    on assignment.delivery_id = delivery.delivery_id
      and assignment.rider_id = private.current_rider_id()
  left join private.order_delivery_fulfillments as fulfillment
    on fulfillment.delivery_id = delivery.delivery_id
  left join lateral (
    select request_record.*
    from public.rider_assignment_requests as request_record
    where request_record.delivery_id = delivery.delivery_id
      and request_record.rider_id = private.current_rider_id()
      and (
        request_record.status = 'accepted'
        or (request_record.status = 'pending'
          and request_record.expires_at > now())
      )
    order by request_record.requested_at desc limit 1
  ) as selected_request on true
  left join lateral (
    select
      (array_agg(order_record.payment_method
        order by order_record.order_id))[1] as payment_method,
      (array_agg(order_record.payment_status
        order by order_record.order_id))[1] as payment_status,
      sum(order_record.total_amount) as order_total,
      string_agg(format('%s %s %s', cart_item.quantity,
        coalesce(commodity.unit_type, 'unit'), commodity.commodity_name),
        ', ' order by commodity.commodity_name) as goods_summary,
      coalesce(nullif(btrim(farmer.first_name || ' ' || farmer.last_name), ''),
        farm.farm_name, 'Farmer') as seller_name,
      coalesce(nullif(btrim(app_user.first_name || ' ' || app_user.last_name), ''),
        'Buyer') as buyer_name,
      farm.city_municipality as pickup_municipality
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.commodities as commodity
      on commodity.commodity_id = cart_item.commodity_id
    join public.farms as farm on farm.farm_id = commodity.farm_id
    join public.farmers as farmer
      on farmer.farmer_user_id = farm.farmer_user_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join public.buyers as buyer on buyer.buyer_user_id = cart.buyer_user_id
    join public.users as app_user on app_user.user_id = buyer.user_id
    where order_record.client_order_id = fulfillment.seller_order_id
      and cart.buyer_user_id = fulfillment.buyer_user_id
    group by farmer.first_name, farmer.last_name, farm.farm_name,
      app_user.first_name, app_user.last_name, farm.city_municipality
  ) as order_summary on true
  where assignment.rider_id is not null or (
    include_available and delivery.delivery_status = 'available'
    and fulfillment.delivery_id is not null
    and selected_request.status = 'pending'
    and not exists (
      select 1 from private.rider_delivery_assignments as claimed
      where claimed.delivery_id = delivery.delivery_id
    )
  )
$$;
revoke all on function private.rider_is_eligible_for_delivery(bigint, uuid),
  private.rider_assignment_request_json(public.rider_assignment_requests),
  private.notify_rider_assignment_status_change(),
  private.fail_rider_requests_when_unavailable(),
  private.process_rider_assignment_expirations()
  from public, anon, authenticated;
revoke all on function private.is_active_rider_profile_photo(text)
  from public, anon;
grant execute on function private.is_active_rider_profile_photo(text)
  to authenticated;
revoke all on function public.eligible_riders_for_current_farmer_order(text),
  public.current_farmer_rider_assignment_requests(),
  public.request_current_farmer_rider(text, uuid, timestamptz, numeric),
  public.cancel_current_farmer_rider_request(uuid),
  public.decline_delivery_request(bigint)
  from public, anon;
grant execute on function public.eligible_riders_for_current_farmer_order(text),
  public.current_farmer_rider_assignment_requests(),
  public.request_current_farmer_rider(text, uuid, timestamptz, numeric),
  public.cancel_current_farmer_rider_request(uuid),
  public.decline_delivery_request(bigint)
  to authenticated;
create extension if not exists pg_cron;
select cron.schedule(
  'agrisell-rider-assignment-expiration',
  '* * * * *',
  'select private.process_rider_assignment_expirations()'
);
notify pgrst, 'reload schema';
commit;
