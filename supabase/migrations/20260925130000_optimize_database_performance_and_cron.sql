begin;

-- =============================================================================
-- Database Performance Optimization Migration
-- 1. Index cron.job_run_details(end_time) for sub-millisecond retention deletes
-- 2. Add partial indexes & short-circuit guards for high-frequency pg_cron jobs
-- 3. Replace slow information_schema query in rider dashboard with pg_attribute
-- 4. Add delivery assignment & status composite indexes for fast rider lookups
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Index cron.job_run_details to eliminate sequential scans in history cleanup
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_namespace n
    join pg_class c on c.relnamespace = n.oid
    where n.nspname = 'cron'
      and c.relname = 'job_run_details'
      and (
        c.relowner = (select oid from pg_roles where rolname = current_user)
        or exists (
          select 1 from pg_roles
          where rolname = current_user
            and rolsuper
        )
      )
  ) then
    begin
      execute 'create index if not exists cron_job_run_details_end_time_idx on cron.job_run_details (end_time)';
    exception
      when insufficient_privilege then
        null;
      when others then
        null;
    end;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Optimize private.expire_stale_rider_availability()
-- -----------------------------------------------------------------------------
create index if not exists riders_active_online_idx
  on public.riders (rider_id)
  where availability_status = 'online' and employment_status = 'active';

create index if not exists rider_locations_rider_updated_idx
  on public.rider_locations (rider_id, location_updated_at);

create or replace function private.expire_stale_rider_availability()
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  expired_count integer;
begin
  -- Fast guard: If no riders are currently online and active, exit immediately
  -- avoiding expensive location freshness subqueries and lock checks.
  if not exists (
    select 1
    from public.riders
    where availability_status = 'online'
      and employment_status = 'active'
  ) then
    return 0;
  end if;

  update public.riders as rider
  set availability_status = 'offline'
  where rider.availability_status = 'online'
    and rider.employment_status = 'active'
    and not private.rider_current_location_is_fresh(rider.rider_id)
    and not exists (
      select 1
      from private.rider_delivery_assignments as assignment
      join public.deliveries as delivery
        on delivery.delivery_id = assignment.delivery_id
      where assignment.rider_id = rider.rider_id
        and delivery.delivery_status not in (
          'completed', 'delivered', 'cancelled', 'failed', 'returned'
        )
    );

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Optimize private.process_rider_assignment_expirations()
-- -----------------------------------------------------------------------------
create index if not exists rider_assignment_requests_pending_expiry_idx
  on public.rider_assignment_requests (expires_at)
  where status = 'pending';

create or replace function private.process_rider_assignment_expirations()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare expired_count integer;
begin
  -- Fast guard: If no pending requests have expired, exit immediately
  if not exists (
    select 1
    from public.rider_assignment_requests
    where status = 'pending'
      and expires_at <= now()
  ) then
    return jsonb_build_object('expired', 0);
  end if;

  update public.rider_assignment_requests
  set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now();

  get diagnostics expired_count = row_count;
  return jsonb_build_object('expired', expired_count);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Optimize order acceptance deadlines and reminders
-- -----------------------------------------------------------------------------
create index if not exists orders_pending_halfway_reminder_idx
  on public.orders (acceptance_halfway_at)
  where order_status = 'toShip' and acceptance_halfway_reminder_sent_at is null;

create index if not exists orders_pending_deadline_reminder_idx
  on public.orders (acceptance_expires_at)
  where order_status = 'toShip' and acceptance_reminder_sent_at is null;

create or replace function private.process_order_acceptance_deadlines()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  candidate record;
  released record;
  deadline timestamptz;
  first_order_id bigint;
  expiry_payment_status text;
  buyer_auth_id uuid;
  farmer_auth_id uuid;
  expired_count integer := 0;
begin
  -- Fast guard: If no orders are pending acceptance past deadline, exit immediately
  if not exists (
    select 1 from public.orders as pending_order
    where pending_order.order_status = 'toShip'
      and pending_order.acceptance_expires_at <= now()
  ) then
    return jsonb_build_object('expired', 0);
  end if;

  for candidate in
    select registry.seller_order_id, registry.buyer_user_id,
      registry.seller_farm_id
    from private.seller_order_registry as registry
    where exists (
      select 1 from public.orders as pending_order
      where pending_order.client_order_id = registry.seller_order_id
        and pending_order.order_status = 'toShip'
        and pending_order.acceptance_expires_at <= now()
    )
    order by registry.seller_order_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        candidate.buyer_user_id::text || ':' || candidate.seller_order_id, 0
      )
    );
    perform 1 from public.orders as locked_order
    where locked_order.client_order_id = candidate.seller_order_id
    order by locked_order.order_id for update;

    if not found or exists (
      select 1 from public.orders as changed_order
      where changed_order.client_order_id = candidate.seller_order_id
        and changed_order.order_status <> 'toShip'
    ) then
      continue;
    end if;

    select min(order_record.acceptance_expires_at),
      min(order_record.order_id),
      case
        when bool_or(
          order_record.payment_method = 'gcash'
          and order_record.payment_status = 'verified'
        ) then 'refund_required'
        when bool_or(
          order_record.payment_method = 'gcash'
          and order_record.payment_status = 'submitted_for_verification'
        ) then 'payment_review_required'
        else 'cancelled'
      end
    into deadline, first_order_id, expiry_payment_status
    from public.orders as order_record
    where order_record.client_order_id = candidate.seller_order_id;

    select buyer_identity.auth_user_id, farmer.auth_user_id
    into buyer_auth_id, farmer_auth_id
    from private.seller_order_registry as registry
    join private.auth_identities as buyer_identity
      on buyer_identity.buyer_user_id = registry.buyer_user_id
    join public.farms as farm on farm.farm_id = registry.seller_farm_id
    join public.farmers as farmer
      on farmer.farmer_user_id = farm.farmer_user_id
    where registry.seller_order_id = candidate.seller_order_id;

    for released in
      select cart_item.commodity_id, sum(cart_item.quantity) as quantity
      from public.orders as order_record
      join public.cart_items as cart_item
        on cart_item.cart_item_id = order_record.cart_item_id
      where order_record.client_order_id = candidate.seller_order_id
        and order_record.stock_reserved_at is not null
        and order_record.stock_released_at is null
      group by cart_item.commodity_id order by cart_item.commodity_id
    loop
      update public.commodities
      set available_quantity = available_quantity + released.quantity
      where commodity_id = released.commodity_id;
    end loop;

    update public.orders set order_status = 'expired',
      payment_status = expiry_payment_status,
      stock_released_at = case when stock_reserved_at is not null
        then coalesce(stock_released_at, now()) else stock_released_at end,
      acceptance_expired_at = coalesce(acceptance_expired_at, now()),
      updated_at = now()
    where client_order_id = candidate.seller_order_id
      and order_status = 'toShip';

    update public.payments as payment
    set payment_status = expiry_payment_status, updated_at = now()
    from public.orders as order_record
    where payment.order_id = order_record.order_id
      and order_record.client_order_id = candidate.seller_order_id;

    insert into private.order_acceptance_events (
      seller_order_id, event_type, metadata
    ) values (
      candidate.seller_order_id, 'expired',
      jsonb_build_object('acceptance_expires_at', deadline,
        'payment_status', expiry_payment_status)
    ) on conflict do nothing;

    if buyer_auth_id is not null then
      insert into public.notifications (
        recipient_auth_user_id, title, description, notification_type,
        category, destination, order_id, metadata
      ) values (
        buyer_auth_id, 'Order expired',
        'The farmer did not accept in time. Reserved stock was released.',
        'order_expired', 'orders', 'orders', first_order_id,
        jsonb_build_object('client_order_id', candidate.seller_order_id,
          'payment_status', expiry_payment_status)
      );
    end if;
    if farmer_auth_id is not null then
      insert into public.notifications (
        recipient_auth_user_id, title, description, notification_type,
        category, destination, order_id, metadata
      ) values (
        farmer_auth_id, 'Order expired',
        'The acceptance deadline passed and reserved stock was released.',
        'order_expired', 'orders', 'orders', first_order_id,
        jsonb_build_object('client_order_id', candidate.seller_order_id,
          'payment_status', expiry_payment_status)
      );
    end if;
    expired_count := expired_count + 1;
  end loop;
  return jsonb_build_object('expired', expired_count);
end;
$$;

create or replace function private.process_order_acceptance_reminders()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  candidate record;
  first_order_id bigint;
  farmer_auth_id uuid;
  deadline timestamptz;
  halfway timestamptz;
  event_kind text;
  notification_title text;
  notification_description text;
  affected_count integer;
  reminder_count integer := 0;
begin
  -- Fast guard: If no orders are eligible for halfway or deadline reminders, exit immediately
  if not exists (
    select 1 from public.orders as pending_order
    where pending_order.order_status = 'toShip'
      and (
        (pending_order.acceptance_halfway_at <= now()
          and pending_order.acceptance_halfway_reminder_sent_at is null)
        or (pending_order.acceptance_expires_at <= now() + interval '30 minutes'
          and pending_order.acceptance_reminder_sent_at is null)
      )
  ) then
    return jsonb_build_object('reminders', 0);
  end if;

  for candidate in
    select registry.seller_order_id, registry.buyer_user_id,
      registry.seller_farm_id
    from private.seller_order_registry as registry
    where exists (
      select 1 from public.orders as pending_order
      where pending_order.client_order_id = registry.seller_order_id
        and pending_order.order_status = 'toShip'
        and (
          (pending_order.acceptance_halfway_at <= now()
            and pending_order.acceptance_halfway_reminder_sent_at is null)
          or (pending_order.acceptance_expires_at <= now() + interval '30 minutes'
            and pending_order.acceptance_reminder_sent_at is null)
        )
    )
    order by registry.seller_order_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        candidate.buyer_user_id::text || ':' || candidate.seller_order_id, 0
      )
    );
    perform 1 from public.orders as locked_order
    where locked_order.client_order_id = candidate.seller_order_id
    order by locked_order.order_id for update;
    if not found or exists (
      select 1 from public.orders as changed_order
      where changed_order.client_order_id = candidate.seller_order_id
        and changed_order.order_status <> 'toShip'
    ) then
      continue;
    end if;

    select min(order_record.order_id),
      min(order_record.acceptance_expires_at),
      min(order_record.acceptance_halfway_at)
    into first_order_id, deadline, halfway
    from public.orders as order_record
    where order_record.client_order_id = candidate.seller_order_id;
    if deadline <= now() then continue; end if;

    if deadline <= now() + interval '30 minutes' then
      event_kind := 'deadline_reminder';
      notification_title := 'Order acceptance deadline approaching';
      notification_description :=
        'Accept this order within 30 minutes or reserved stock will be released.';
    elsif halfway <= now() then
      event_kind := 'halfway_reminder';
      notification_title := 'Order still needs your response';
      notification_description :=
        'Half of the acceptance window has passed. Review this order soon.';
    else
      continue;
    end if;

    insert into private.order_acceptance_events (
      seller_order_id, event_type, metadata
    ) values (
      candidate.seller_order_id, event_kind,
      jsonb_build_object('acceptance_expires_at', deadline)
    ) on conflict do nothing;
    get diagnostics affected_count = row_count;
    if affected_count = 0 then continue; end if;

    update public.orders set
      acceptance_halfway_reminder_sent_at = case
        when event_kind in ('halfway_reminder', 'deadline_reminder')
          then coalesce(acceptance_halfway_reminder_sent_at, now())
        else acceptance_halfway_reminder_sent_at end,
      acceptance_reminder_sent_at = case
        when event_kind = 'deadline_reminder' then now()
        else acceptance_reminder_sent_at end
    where client_order_id = candidate.seller_order_id;

    select farmer.auth_user_id into farmer_auth_id
    from public.farms as farm
    join public.farmers as farmer
      on farmer.farmer_user_id = farm.farmer_user_id
    where farm.farm_id = candidate.seller_farm_id;

    if farmer_auth_id is not null then
      insert into public.notifications (
        recipient_auth_user_id, title, description, notification_type,
        category, destination, order_id, metadata
      ) values (
        farmer_auth_id, notification_title, notification_description,
        'order_expiring', 'orders', 'orders', first_order_id,
        jsonb_build_object('client_order_id', candidate.seller_order_id,
          'acceptance_expires_at', deadline, 'reminder', event_kind)
      );
    end if;
    reminder_count := reminder_count + 1;
  end loop;
  return jsonb_build_object('reminders', reminder_count);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Optimize commodity inventory lots expiration
-- -----------------------------------------------------------------------------
create index if not exists commodity_inventory_lots_expiring_idx
  on public.commodity_inventory_lots (sell_until, expires_at)
  where expired_at is null and quantity_remaining > 0;

create or replace function private.expire_commodity_inventory_lots()
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare lot_record record;
declare expired_count integer := 0;
begin
  -- Fast guard: If no lots have passed sell_until or expires_at, exit immediately
  if not exists (
    select 1
    from public.commodity_inventory_lots as lot
    where lot.expired_at is null and lot.quantity_remaining > 0
      and (
        (lot.sell_until is not null and lot.sell_until < current_date)
        or (lot.expires_at is not null and lot.expires_at < current_date)
      )
  ) then
    return 0;
  end if;

  for lot_record in
    select lot.inventory_lot_id, lot.commodity_id, lot.quantity_remaining
    from public.commodity_inventory_lots as lot
    where lot.expired_at is null and lot.quantity_remaining > 0
      and (
        (lot.sell_until is not null and lot.sell_until < current_date)
        or (lot.expires_at is not null and lot.expires_at < current_date)
      )
    order by lot.commodity_id, lot.inventory_lot_id
    for update
  loop
    update public.commodity_inventory_lots
    set quantity_remaining = 0, expired_at = now()
    where inventory_lot_id = lot_record.inventory_lot_id;
    update public.commodities
    set available_quantity = greatest(
      0, available_quantity - lot_record.quantity_remaining
    )
    where commodity_id = lot_record.commodity_id;
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Optimize current_rider_dashboard() by replacing information_schema with pg_attribute
-- -----------------------------------------------------------------------------
create or replace function private.api_impl_current_rider_dashboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_rider uuid := private.current_rider_id();
  current_auth uuid := auth.uid();
  payment_table regclass := coalesce(
    to_regclass('public.delivery_payments'),
    to_regclass('public.delivery_payment')
  );
  dashboard jsonb;
  earned_today numeric := 0;
  pending_earnings numeric;
  payment_columns integer;
begin
  with stats as (
    select count(*) as total,
      count(*) filter (
        where delivery.delivery_status in ('completed', 'delivered')
      ) as completed,
      count(*) filter (
        where delivery.delivery_status in ('cancelled', 'failed')
      ) as cancelled,
      count(*) filter (
        where delivery.delivery_status in ('completed', 'delivered')
          and delivery.actual_delivery_time::date = current_date
      ) as completed_today,
      count(*) filter (
        where delivery.delivery_status in ('completed', 'delivered')
          and delivery.actual_delivery_time <= delivery.estimated_delivery_time
      ) as on_time
    from private.rider_delivery_assignments as assignment
    join public.deliveries as delivery on delivery.delivery_id = assignment.delivery_id
    where assignment.rider_id = current_rider
  )
  select jsonb_build_object(
    'today_completed_deliveries', stats.completed_today,
    'today_estimated_earnings', 0,
    'unread_message_count', (
      select count(*) from public.rider_delivery_messages as message
      where private.rider_owns_delivery(message.delivery_id)
        and message.sender_role <> 'rider'
        and message.sent_at > coalesce((
          select reads.last_read_at from public.rider_conversation_reads as reads
          where reads.rider_id = current_rider
            and reads.delivery_id = message.delivery_id
            and reads.party = message.party
        ), '-infinity')
    ),
    'unread_notification_count', (
      select count(*) from public.notifications as notification
      where notification.recipient_auth_user_id = current_auth
        and notification.read_at is null and notification.deleted_at is null
    ),
    'cancelled_or_failed_deliveries', stats.cancelled,
    'pending_earnings', null,
    'average_rating', coalesce((
      select avg(rating.rating) from public.rider_ratings as rating
      where rating.rider_id = current_rider
    ), 0),
    'completed_delivery_count', stats.completed,
    'on_time_delivery_rate', case when stats.completed = 0 then 0
      else stats.on_time * 100.0 / stats.completed end,
    'cancellation_rate', case when stats.total = 0 then 0
      else stats.cancelled * 100.0 / stats.total end,
    'unavailable_sections', jsonb_build_array('Earnings'),
    'fetched_at', now()
  ) into dashboard from stats;

  if payment_table is null then return dashboard; end if;

  -- High-performance pg_catalog lookup instead of slow information_schema view
  select count(*) into payment_columns
  from pg_catalog.pg_attribute
  where attrelid = payment_table
    and attname in ('final_earning', 'earning_status', 'payout_status')
    and not attisdropped;

  if payment_columns <> 3 then return dashboard; end if;

  execute format(
    $query$
      select
        coalesce(sum(payment.final_earning) filter (
          where delivery.delivery_status in ('completed', 'delivered')
            and (delivery.actual_delivery_time at time zone 'Asia/Manila')::date =
              (now() at time zone 'Asia/Manila')::date
            and payment.earning_status is distinct from 'cancelled'
        ), 0),
        coalesce(sum(payment.final_earning) filter (
          where payment.payout_status is distinct from 'paid'
            and payment.earning_status is distinct from 'cancelled'
        ), 0)
      from private.rider_delivery_assignments as assignment
      join public.deliveries as delivery
        on delivery.delivery_id = assignment.delivery_id
      left join %s as payment on payment.delivery_id = delivery.delivery_id
      where assignment.rider_id = $1
    $query$,
    payment_table
  ) into earned_today, pending_earnings using current_rider;

  return dashboard || jsonb_build_object(
    'today_estimated_earnings', earned_today,
    'pending_earnings', pending_earnings,
    'unavailable_sections', '[]'::jsonb
  );
end;
$$;

revoke all on function private.api_impl_current_rider_dashboard() from public, anon;
grant execute on function private.api_impl_current_rider_dashboard() to authenticated, service_role;

create or replace function public.current_rider_dashboard()
returns jsonb language sql security invoker set search_path = '' as $$
  select private.api_impl_current_rider_dashboard();
$$;

revoke all on function public.current_rider_dashboard() from public, anon;
grant execute on function public.current_rider_dashboard() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Composite indexes for current_rider_deliveries()
-- -----------------------------------------------------------------------------
create index if not exists rider_delivery_assignments_rider_delivery_idx
  on private.rider_delivery_assignments (rider_id, delivery_id);

create index if not exists deliveries_status_created_idx
  on public.deliveries (delivery_status, created_at desc);

-- -----------------------------------------------------------------------------
-- 8. Enforce proper access privileges
-- -----------------------------------------------------------------------------
revoke all on function private.expire_stale_rider_availability() from public, anon, authenticated;
revoke all on function private.process_rider_assignment_expirations() from public, anon, authenticated;
revoke all on function private.process_order_acceptance_deadlines() from public, anon, authenticated;
revoke all on function private.process_order_acceptance_reminders() from public, anon, authenticated;
revoke all on function private.expire_commodity_inventory_lots() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
