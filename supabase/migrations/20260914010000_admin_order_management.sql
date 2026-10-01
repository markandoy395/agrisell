begin;

create table if not exists private.admin_order_events (
  event_id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(order_id) on delete cascade,
  command_id text not null unique,
  actor text not null,
  event_type text not null check (event_type in ('status_changed','cancellation_reviewed','refund_completed','exception_resolved')),
  previous_status text,
  new_status text,
  previous_payment_status text,
  new_payment_status text,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.admin_order_cases (
  order_id bigint primary key references public.orders(order_id) on delete cascade,
  cancellation_decision text check (cancellation_decision in ('approved','rejected')),
  cancellation_reviewed_by text,
  cancellation_reviewed_at timestamptz,
  cancellation_note text,
  exception_status text not null default 'open' check (exception_status in ('open','resolved')),
  exception_resolution text,
  exception_resolved_by text,
  exception_resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.admin_order_events enable row level security;
alter table private.admin_order_cases enable row level security;
revoke all on private.admin_order_events, private.admin_order_cases from public, anon, authenticated;

create or replace function public.admin_order_detail(p_order_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order', jsonb_build_object(
      'order_id', o.order_id, 'client_order_id', o.client_order_id,
      'order_status', o.order_status, 'payment_status', o.payment_status,
      'payment_method', o.payment_method, 'total_amount', o.total_amount,
      'delivery_address', o.delivery_address, 'order_date', o.order_date,
      'created_at', o.created_at, 'updated_at', o.updated_at,
      'cancellation_reason', o.cancellation_reason,
      'cancelled_by_role', o.cancelled_by_role, 'cancelled_at', o.cancelled_at
    ),
    'payment', coalesce((select to_jsonb(p) - 'order_id' from public.payments p where p.order_id=o.order_id order by p.payment_id desc limit 1), 'null'::jsonb),
    'delivery', coalesce((select jsonb_build_object('delivery_id',d.delivery_id,'delivery_status',d.delivery_status,'estimated_delivery_time',d.estimated_delivery_time,'actual_delivery_time',d.actual_delivery_time) from public.deliveries d where d.order_id=o.order_id order by d.delivery_id desc limit 1), 'null'::jsonb),
    'case', jsonb_build_object(
      'cancellation_decision', c.cancellation_decision,
      'cancellation_reviewed_by', c.cancellation_reviewed_by,
      'cancellation_reviewed_at', c.cancellation_reviewed_at,
      'cancellation_note', c.cancellation_note,
      'exception_status', coalesce(c.exception_status, case when lower(coalesce(o.order_status,'')) in ('failed','expired') or lower(coalesce(o.payment_status,'')) in ('refund_required','payment_review_required','rejected') then 'open' else 'resolved' end),
      'exception_resolution', c.exception_resolution,
      'exception_resolved_by', c.exception_resolved_by,
      'exception_resolved_at', c.exception_resolved_at
    ),
    'history', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.event_id desc) from private.admin_order_events e where e.order_id=o.order_id), '[]'::jsonb)
  )
  from public.orders o
  left join private.admin_order_cases c on c.order_id=o.order_id
  where o.order_id=p_order_id
$$;

create or replace function public.admin_save_order(p_input jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.orders%rowtype;
  action text := p_input->>'action';
  command_key text := nullif(btrim(p_input->>'command_id'),'');
  reason text := nullif(btrim(p_input->>'reason'),'');
  next_status text := nullif(btrim(p_input->>'status'),'');
  decision text := nullif(btrim(p_input->>'decision'),'');
  clean_refund_reference text := nullif(btrim(p_input->>'reference'),'');
  old_payment text;
  new_payment text;
  delivery_state text;
begin
  if command_key is null or nullif(btrim(p_actor),'') is null or reason is null then
    raise exception 'Command ID, actor, and reason are required' using errcode='22023';
  end if;
  if exists(select 1 from private.admin_order_events where command_id=command_key) then
    return public.admin_order_detail((select order_id from private.admin_order_events where command_id=command_key));
  end if;
  select * into target from public.orders where order_id=(p_input->>'order_id')::bigint for update;
  if not found then raise exception 'Order not found' using errcode='22023'; end if;
  if target.order_status is distinct from p_input->>'previous_status' then
    raise exception 'Order changed; refresh before saving' using errcode='40001';
  end if;
  old_payment := target.payment_status;
  new_payment := target.payment_status;

  if action='status' then
    if not (
      (lower(coalesce(target.order_status,'')) in ('pending','placed','topay') and next_status='toShip') or
      (lower(coalesce(target.order_status,'')) in ('toship','to_ship') and next_status='preparing') or
      (target.order_status='preparing' and next_status='readyForPickup') or
      (lower(coalesce(target.order_status,'')) in ('pending','placed','topay','toship','to_ship','preparing','readyforpickup') and next_status='cancelled') or
      (lower(coalesce(target.order_status,'')) in ('shipping','readyforpickup') and next_status='delivered')
    ) then raise exception 'Invalid order status transition' using errcode='22023'; end if;
    if next_status='delivered' then
      select d.delivery_status into delivery_state from public.deliveries d where d.order_id=target.order_id order by d.delivery_id desc limit 1;
      if delivery_state is null or delivery_state not in ('completed','delivered') then
        raise exception 'The linked delivery must be completed before the order can be delivered' using errcode='22023';
      end if;
    end if;
    if next_status='cancelled' then
      select d.delivery_status into delivery_state from public.deliveries d where d.order_id=target.order_id order by d.delivery_id desc limit 1;
      if delivery_state is not null and delivery_state not in ('pending','available','accepted','going_to_pickup','arrived_at_pickup','cancelled') then
        raise exception 'This order has already been picked up and cannot be cancelled by an administrator' using errcode='22023';
      end if;
      if target.stock_reserved_at is not null and target.stock_released_at is null then
        update public.commodities commodity
        set available_quantity=commodity.available_quantity+cart_item.quantity
        from public.cart_items cart_item
        where cart_item.cart_item_id=target.cart_item_id and commodity.commodity_id=cart_item.commodity_id;
      end if;
      update public.deliveries set delivery_status='cancelled'
      where order_id=target.order_id and delivery_status in ('pending','available','accepted','going_to_pickup','arrived_at_pickup');
    end if;
    update public.orders set order_status=next_status, updated_at=now(),
      cancellation_reason=case when next_status='cancelled' then reason else cancellation_reason end,
      cancelled_by_role=case when next_status='cancelled' then 'admin' else cancelled_by_role end,
      cancelled_at=case when next_status='cancelled' then now() else cancelled_at end,
      stock_released_at=case when next_status='cancelled' and stock_reserved_at is not null then coalesce(stock_released_at,now()) else stock_released_at end
    where order_id=target.order_id;
    select payment_status into new_payment from public.orders where order_id=target.order_id;
    if next_status='cancelled' then
      insert into private.admin_order_cases(order_id,exception_status) values(target.order_id,'open')
      on conflict(order_id) do update set cancellation_decision=null,cancellation_reviewed_by=null,cancellation_reviewed_at=null,cancellation_note=null,exception_status='open',updated_at=now();
    end if;
  elsif action='review_cancellation' then
    if lower(coalesce(target.order_status,'')) not in ('cancelled','canceled') then raise exception 'Only cancelled orders can be reviewed' using errcode='22023'; end if;
    if decision not in ('approved','rejected') then raise exception 'A valid cancellation review decision is required' using errcode='22023'; end if;
    insert into private.admin_order_cases(order_id,cancellation_decision,cancellation_reviewed_by,cancellation_reviewed_at,cancellation_note)
    values(target.order_id,decision,p_actor,now(),reason)
    on conflict(order_id) do update set cancellation_decision=excluded.cancellation_decision,cancellation_reviewed_by=excluded.cancellation_reviewed_by,cancellation_reviewed_at=excluded.cancellation_reviewed_at,cancellation_note=excluded.cancellation_note,updated_at=now();
    next_status := target.order_status;
  elsif action='refund' then
    if lower(coalesce(target.payment_status,'')) <> 'refund_required' then raise exception 'Only an order awaiting a refund can be refunded' using errcode='22023'; end if;
    if clean_refund_reference is null then raise exception 'A refund reference is required' using errcode='22023'; end if;
    new_payment := 'refunded'; next_status := target.order_status;
    update public.orders set payment_status='refunded',updated_at=now() where order_id=target.order_id;
    update public.payments set payment_status='refunded',refund_reference=clean_refund_reference,refunded_at=now(),updated_at=now() where order_id=target.order_id;
  elsif action='resolve_exception' then
    insert into private.admin_order_cases(order_id,exception_status,exception_resolution,exception_resolved_by,exception_resolved_at)
    values(target.order_id,'resolved',reason,p_actor,now())
    on conflict(order_id) do update set exception_status='resolved',exception_resolution=excluded.exception_resolution,exception_resolved_by=excluded.exception_resolved_by,exception_resolved_at=excluded.exception_resolved_at,updated_at=now();
    next_status := target.order_status;
  else raise exception 'Unknown order action' using errcode='22023'; end if;

  insert into private.admin_order_events(order_id,command_id,actor,event_type,previous_status,new_status,previous_payment_status,new_payment_status,reason,metadata)
  values(target.order_id,command_key,p_actor,case action when 'status' then 'status_changed' when 'review_cancellation' then 'cancellation_reviewed' when 'refund' then 'refund_completed' else 'exception_resolved' end,
    target.order_status,coalesce(next_status,target.order_status),old_payment,new_payment,reason,
    jsonb_strip_nulls(jsonb_build_object('decision',decision,'refund_reference',clean_refund_reference)));
  return public.admin_order_detail(target.order_id);
end
$$;

revoke all on function public.admin_order_detail(bigint), public.admin_save_order(jsonb,text) from public, anon, authenticated;
grant execute on function public.admin_order_detail(bigint), public.admin_save_order(jsonb,text) to service_role;
commit;
