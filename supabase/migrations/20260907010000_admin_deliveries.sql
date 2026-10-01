begin;
-- Integrates with the existing rider app's private assignments/fulfillments.
-- All admin RPCs are service-role-only; the HTTP layer checks logistics:manage.
create table if not exists private.admin_delivery_commands (
  command_id text primary key,
  actor text not null,
  payload jsonb not null,
  delivery_id bigint references public.deliveries(delivery_id),
  created_at timestamptz not null default now()
);
create table if not exists private.delivery_location_history (
  point_id bigint generated always as identity primary key,
  delivery_id bigint not null references public.deliveries(delivery_id) on delete cascade,
  rider_id uuid not null references public.riders(rider_id),
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters double precision,
  captured_at timestamptz not null,
  unique(delivery_id, rider_id, captured_at)
);
create index if not exists delivery_location_history_trip_idx
  on private.delivery_location_history(delivery_id, captured_at);
alter table private.admin_delivery_commands enable row level security;
alter table private.delivery_location_history enable row level security;
revoke all on private.admin_delivery_commands, private.delivery_location_history from public, anon, authenticated;
-- Existing authenticated rider upserts keep their ownership RLS. Reject invalid
-- timestamps, ignore out-of-order fixes, and record each active trip atomically.
create or replace function private.validate_admin_tracking_fix() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.latitude is null or new.longitude is null
     or not (new.latitude between -90 and 90)
     or not (new.longitude between -180 and 180)
     or new.location_updated_at is null
     or new.location_updated_at > now() + interval '1 minute'
     or new.location_updated_at < now() - interval '24 hours'
     or (new.accuracy_meters is not null and not (new.accuracy_meters between 0 and 100000)) then
    raise exception 'Invalid GPS fix or timestamp' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.location_updated_at <= old.location_updated_at then return null; end if;
  return new;
end; $$;
create or replace function private.record_admin_tracking_fix() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.delivery_location_history(delivery_id,rider_id,latitude,longitude,accuracy_meters,captured_at)
  select a.delivery_id,new.rider_id,new.latitude,new.longitude,new.accuracy_meters,new.location_updated_at
  from private.rider_delivery_assignments a join public.deliveries d using(delivery_id)
  where a.rider_id = new.rider_id and new.location_updated_at >= a.assigned_at and d.delivery_status in
    ('accepted','going_to_pickup','arrived_at_pickup','picked_up','going_to_delivery','arrived_at_delivery')
  on conflict do nothing;
  return new;
end; $$;
drop trigger if exists admin_tracking_validate on public.rider_locations;
create trigger admin_tracking_validate before insert or update on public.rider_locations
for each row execute function private.validate_admin_tracking_fix();
drop trigger if exists admin_tracking_history on public.rider_locations;
create trigger admin_tracking_history after insert or update on public.rider_locations
for each row execute function private.record_admin_tracking_fix();
create or replace function public.admin_delivery_rows(p_active boolean default false, p_offset integer default 0, p_limit integer default 200)
returns jsonb language sql stable security definer set search_path = '' as $$
  with selected as (
    select d.*, a.rider_id, r.full_name as rider_name, r.contact_number as rider_phone,
      f.pickup_lat, f.pickup_long, f.dropoff_lat, f.dropoff_long,
      f.pickup_contact, f.dropoff_contact, f.total_weight_kg,
      o.buyer_name_snapshot as customer_name,
      l.latitude, l.longitude, l.accuracy_meters, l.location_updated_at
    from public.deliveries d
    left join private.rider_delivery_assignments a using(delivery_id)
    left join public.riders r using(rider_id)
    left join private.order_delivery_fulfillments f using(delivery_id)
    left join public.orders o on o.order_id = d.order_id
    left join public.rider_locations l on l.rider_id = a.rider_id
    where not p_active or d.delivery_status not in ('completed','delivered','cancelled','failed','returned')
  ) select jsonb_build_object('total',(select count(*) from selected), 'rows',coalesce((
    select jsonb_agg(to_jsonb(page) order by page.created_at desc,page.delivery_id desc)
    from (select * from selected order by created_at desc,delivery_id desc limit greatest(1,least(p_limit,500)) offset greatest(p_offset,0)) page
  ),'[]'::jsonb));
$$;
create or replace function public.admin_delivery_options() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'riders',coalesce((select jsonb_agg(jsonb_build_object('rider_id',r.rider_id,'full_name',coalesce(r.full_name,concat_ws(' ',r.first_name,r.last_name)),
      'contact_number',r.contact_number,'availability_status',r.availability_status,'vehicle_type',r.vehicle_type,
      'maximum_active_deliveries',r.maximum_active_deliveries,'active_deliveries',(select count(*) from private.rider_delivery_assignments a join public.deliveries d using(delivery_id)
       where a.rider_id=r.rider_id and d.delivery_status not in ('completed','cancelled','failed','returned'))))
      from public.riders r where r.employment_status='active'),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('order_id',o.order_id,'customer_name',o.buyer_name_snapshot,'destination',o.delivery_address))
      from public.orders o where o.order_status in ('preparing','readyForPickup') and not exists
        (select 1 from private.order_delivery_fulfillments f where f.seller_order_id=o.client_order_id)),'[]'::jsonb));
$$;
create or replace function public.admin_delivery_detail(p_delivery_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.changed_at) from private.delivery_status_events e where e.delivery_id=p_delivery_id),'[]'::jsonb),
  'proofs',coalesce((select jsonb_agg(jsonb_build_object('proof_id',p.proof_id,'proof_stage',p.proof_stage,'proof_type',p.proof_type,
    'file_path',p.file_path,'remarks',p.remarks,'confirmed_at',p.confirmed_at,'created_at',p.created_at) order by p.created_at)
    from public.delivery_proofs p where p.delivery_id=p_delivery_id),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(jsonb_build_object('name',c.commodity_name,'quantity',ci.quantity,'total',o.total_amount))
    from private.order_delivery_fulfillments f join public.orders o on o.client_order_id=f.seller_order_id
    join public.cart_items ci on ci.cart_item_id=o.cart_item_id join public.carts cart on cart.cart_id=ci.cart_id and cart.buyer_user_id=f.buyer_user_id
    join public.commodities c on c.commodity_id=ci.commodity_id where f.delivery_id=p_delivery_id),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.captured_at) from private.delivery_location_history h where h.delivery_id=p_delivery_id),'[]'::jsonb));
$$;
create or replace function public.admin_save_delivery(p_input jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.deliveries%rowtype;
  selected_order public.orders%rowtype;
  selected_rider public.riders%rowtype;
  fulfillment private.order_delivery_fulfillments%rowtype;
  command private.admin_delivery_commands%rowtype;
  command_key text := p_input->>'command_id';
  action text := p_input->>'action';
  next_status text := p_input->>'status';
  reason text := nullif(btrim(p_input->>'reason'),'');
  old_rider uuid;
  new_rider uuid;
  farmer_id bigint;
  delivery_key bigint;
begin
  if nullif(btrim(command_key),'') is null or length(command_key)>100 or nullif(btrim(p_actor),'') is null then
    raise exception 'Command ID and actor are required' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(command_key,0));
  select * into command from private.admin_delivery_commands where command_id=command_key;
  if found then
    if command.payload<>p_input or command.actor<>p_actor then raise exception 'Command ID already used' using errcode='40001'; end if;
    return jsonb_build_object('delivery_id',command.delivery_id);
  end if;
  if action='create' then
    select * into selected_order from public.orders where order_id=(p_input->>'order_id')::bigint for update;
    if not found then raise exception 'Order not found' using errcode='22023'; end if;
    if exists(select 1 from private.order_delivery_fulfillments f
      join public.cart_items ci on ci.cart_item_id=selected_order.cart_item_id
      join public.carts cart on cart.cart_id=ci.cart_id and cart.buyer_user_id=f.buyer_user_id
      where f.seller_order_id=selected_order.client_order_id) then
      raise exception 'Order already has a delivery; refresh the list' using errcode='40001';
    end if;
    select f.farmer_user_id into farmer_id from public.farms f where f.farm_id=selected_order.seller_farm_id;
    perform private.mark_farmer_order_ready(farmer_id,selected_order.client_order_id);
    select d.* into target from public.deliveries d join private.order_delivery_fulfillments f using(delivery_id)
      where f.representative_order_id=selected_order.order_id or (f.seller_order_id=selected_order.client_order_id and d.order_id=selected_order.order_id);
    -- The representative order can differ for a multi-item checkout.
    if target.delivery_id is null then
      select d.* into target from public.deliveries d join private.order_delivery_fulfillments f using(delivery_id)
      join public.cart_items ci on ci.cart_item_id=selected_order.cart_item_id
      join public.carts cart on cart.cart_id=ci.cart_id and cart.buyer_user_id=f.buyer_user_id
      where f.seller_order_id=selected_order.client_order_id;
    end if;
    if target.delivery_id is null then raise exception 'Delivery could not be created' using errcode='22023'; end if;
    if nullif(p_input->>'scheduled_at','') is null then raise exception 'Schedule required' using errcode='22023'; end if;
    update public.deliveries set estimated_delivery_time=(p_input->>'scheduled_at')::timestamptz where delivery_id=target.delivery_id;
  else
    select * into target from public.deliveries where delivery_id=(p_input->>'delivery_id')::bigint for update;
    if not found then raise exception 'Delivery not found' using errcode='22023'; end if;
    if target.delivery_status is distinct from p_input->>'previous_status' then raise exception 'Delivery changed; refresh before saving' using errcode='40001'; end if;
    if target.delivery_status in ('completed','cancelled','failed','returned') then raise exception 'This delivery is already closed' using errcode='22023'; end if;
    select rider_id into old_rider from private.rider_delivery_assignments where delivery_id=target.delivery_id;
    if action='assign' then
      if target.delivery_status not in ('pending','available','accepted','going_to_pickup','arrived_at_pickup') then
        raise exception 'Cannot reassign after pickup' using errcode='22023'; end if;
      if old_rider is not null and reason is null then raise exception 'Reassignment reason required' using errcode='22023'; end if;
      if old_rider is distinct from nullif(p_input->>'previous_rider_id','')::uuid then raise exception 'Rider assignment changed; refresh before saving' using errcode='40001'; end if;
      new_rider := (p_input->>'rider_id')::uuid;
      if new_rider=old_rider then raise exception 'Rider is already assigned' using errcode='22023'; end if;
      select * into selected_rider from public.riders where rider_id=new_rider for update;
      if not found or selected_rider.employment_status<>'active' then raise exception 'Choose an approved rider' using errcode='22023'; end if;
      if selected_rider.availability_status not in ('online','available','busy','on_delivery') then raise exception 'Rider is offline' using errcode='22023'; end if;
      select * into fulfillment from private.order_delivery_fulfillments where delivery_id=target.delivery_id;
      if not found then raise exception 'Delivery pickup/destination details are missing' using errcode='22023'; end if;
      select f.farmer_user_id into farmer_id from public.orders o join public.farms f on f.farm_id=o.seller_farm_id where o.order_id=target.order_id;
      update public.rider_assignment_requests set status='cancelled',responded_at=now(),updated_at=now(),failure_reason=coalesce(reason,'Admin assignment')
        where delivery_id=target.delivery_id and status in ('pending','accepted');
      insert into public.rider_assignment_requests(delivery_id,seller_order_id,rider_id,farmer_user_id,requested_schedule,expires_at)
        values(target.delivery_id,fulfillment.seller_order_id,new_rider,farmer_id,coalesce(target.estimated_delivery_time,now()),now()+interval '1 hour');
      perform private.validate_delivery_batch_acceptance(target.delivery_id,new_rider);
      insert into private.rider_delivery_assignments(delivery_id,rider_id,assigned_at) values(target.delivery_id,new_rider,now())
        on conflict(delivery_id) do update set rider_id=excluded.rider_id,assigned_at=excluded.assigned_at;
      update public.rider_assignment_requests set status='accepted',responded_at=now(),updated_at=now() where delivery_id=target.delivery_id and rider_id=new_rider and status='pending';
      update public.riders set availability_status='busy' where rider_id=new_rider;
      next_status := 'accepted';
    elsif action='status' then
      if reason is null then raise exception 'A reason is required for admin status changes' using errcode='22023'; end if;
      if not ((target.delivery_status='accepted' and next_status='going_to_pickup')
        or (target.delivery_status='going_to_pickup' and next_status='arrived_at_pickup')
        or (target.delivery_status='picked_up' and next_status='going_to_delivery')
        or (target.delivery_status='going_to_delivery' and next_status='arrived_at_delivery')
        or (next_status='cancelled' and target.delivery_status in ('pending','available','accepted','going_to_pickup','arrived_at_pickup'))
        or next_status='failed') then
        raise exception 'Invalid transition. Pickup and completion require rider evidence.' using errcode='22023';
      end if;
      if next_status in ('cancelled','failed') then
        update public.rider_assignment_requests set status='cancelled',responded_at=now(),updated_at=now(),failure_reason=reason
          where delivery_id=target.delivery_id and status in ('pending','accepted');
      end if;
    else raise exception 'Unknown delivery action' using errcode='22023'; end if;
    update public.deliveries set delivery_status=next_status where delivery_id=target.delivery_id;
    if old_rider is not null and (old_rider is distinct from new_rider or next_status in ('cancelled','failed')) then
      update public.riders r set availability_status='online' where r.rider_id=old_rider and not exists
        (select 1 from private.rider_delivery_assignments a join public.deliveries d using(delivery_id) where a.rider_id=r.rider_id and d.delivery_status not in ('completed','cancelled','failed','returned'));
    end if;
  end if;
  delivery_key := target.delivery_id;
  insert into private.delivery_status_events(delivery_id,idempotency_key,previous_status,new_status,remarks)
    values(delivery_key,'admin:'||command_key,case when action='create' then null else target.delivery_status end,
      coalesce(next_status,target.delivery_status),'Admin '||p_actor||' · '||action||coalesce(': '||reason,''));
  insert into private.admin_delivery_commands(command_id,actor,payload,delivery_id) values(command_key,p_actor,p_input,delivery_key);
  return jsonb_build_object('delivery_id',delivery_key);
end; $$;
revoke all on function public.admin_delivery_rows(boolean,integer,integer),public.admin_delivery_options(),
 public.admin_delivery_detail(bigint),public.admin_save_delivery(jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_delivery_rows(boolean,integer,integer),public.admin_delivery_options(),
 public.admin_delivery_detail(bigint),public.admin_save_delivery(jsonb,text) to service_role;
revoke all on function private.validate_admin_tracking_fix(),private.record_admin_tracking_fix() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
