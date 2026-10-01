begin;
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
revoke all on function private.process_order_acceptance_reminders()
  from public, anon, authenticated;
select cron.schedule(
  'agrisell-order-acceptance-reminders',
  '*/5 * * * *',
  'select private.process_order_acceptance_reminders()'
);
commit;
