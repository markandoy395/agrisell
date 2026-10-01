begin;
-- Return every dashboard section from authoritative Rider data. Payment table
-- names differ between legacy and current deployments, so resolve the table
-- dynamically and leave Earnings unavailable if its schema is not present.
create or replace function public.current_rider_dashboard()
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
  select count(*) into payment_columns
  from information_schema.columns
  where table_schema = 'public'
    and to_regclass(format('%I.%I', table_schema, table_name)) = payment_table
    and column_name in ('final_earning', 'earning_status', 'payout_status');
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
revoke all on function public.current_rider_dashboard() from public, anon;
grant execute on function public.current_rider_dashboard() to authenticated;
notify pgrst, 'reload schema';
commit;
