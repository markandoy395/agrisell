begin;
create table public.rider_ratings (
  rating_id uuid primary key default extensions.gen_random_uuid(),
  delivery_id bigint not null references public.deliveries(delivery_id) on delete cascade,
  rider_id uuid not null references public.riders(rider_id) on delete cascade,
  reviewer_auth_id uuid not null references auth.users(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('buyer', 'farmer')),
  rating numeric(2,1) not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique(delivery_id, reviewer_auth_id)
);
create index rider_ratings_rider_created_idx
  on public.rider_ratings(rider_id, created_at desc);
alter table public.rider_ratings enable row level security;
create policy rider_ratings_visible_to_rider_and_reviewer
on public.rider_ratings for select to authenticated using (
  rider_id = private.current_rider_id()
  or reviewer_auth_id = (select auth.uid())
  or private.is_admin()
);
revoke all on public.rider_ratings from public, anon, authenticated;
grant select on public.rider_ratings to authenticated;
create or replace function public.submit_rider_rating(
  p_delivery_id bigint, p_rating numeric, p_comment text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_rider uuid; actor_role text; saved public.rider_ratings%rowtype;
begin
  select assignment.rider_id into target_rider
  from private.rider_delivery_assignments as assignment
  join public.deliveries as delivery on delivery.delivery_id = assignment.delivery_id
  where assignment.delivery_id = p_delivery_id
    and delivery.delivery_status in ('completed', 'delivered');
  if target_rider is null then
    raise exception 'Ratings require a completed delivery' using errcode = '22023';
  end if;
  if exists (
    select 1 from private.order_delivery_fulfillments as fulfillment
    where fulfillment.delivery_id = p_delivery_id
      and fulfillment.buyer_user_id = private.current_buyer_user_id()
  ) then actor_role := 'buyer';
  elsif exists (
    select 1
    from private.order_delivery_fulfillments as fulfillment
    join public.orders as order_record
      on order_record.client_order_id = fulfillment.seller_order_id
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.commodities as commodity
      on commodity.commodity_id = cart_item.commodity_id
    join public.farms as farm on farm.farm_id = commodity.farm_id
    where fulfillment.delivery_id = p_delivery_id
      and farm.farmer_user_id = private.current_farmer_user_id()
  ) then actor_role := 'farmer';
  else
    raise exception 'Only delivery participants can rate this rider'
      using errcode = '42501';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;
  insert into public.rider_ratings(
    delivery_id, rider_id, reviewer_auth_id, reviewer_role, rating, comment
  ) values (
    p_delivery_id, target_rider, (select auth.uid()), actor_role,
    p_rating, nullif(btrim(p_comment), '')
  ) returning * into saved;
  update public.riders set rating = (
    select round(avg(value.rating), 2)
    from public.rider_ratings as value where value.rider_id = target_rider
  ) where rider_id = target_rider;
  return to_jsonb(saved);
end;
$$;
create or replace function public.current_rider_ratings()
returns jsonb language sql stable security definer set search_path = '' as $$
  with actor as (select private.current_rider_id() as rider_id),
  delivery_stats as (
    select count(*) as total,
      count(*) filter (
        where delivery.delivery_status in ('completed', 'delivered')
      ) as completed,
      count(*) filter (
        where delivery.delivery_status in ('cancelled', 'failed')
      ) as cancelled_failed,
      count(*) filter (
        where delivery.delivery_status in ('completed', 'delivered')
          and delivery.actual_delivery_time is not null
          and delivery.estimated_delivery_time is not null
          and delivery.actual_delivery_time <= delivery.estimated_delivery_time
      ) as on_time
    from private.rider_delivery_assignments as assignment
    join public.deliveries as delivery on delivery.delivery_id = assignment.delivery_id
    where assignment.rider_id = (select rider_id from actor)
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'average_rating', coalesce((select avg(rating) from public.rider_ratings
        where rider_id = (select rider_id from actor)), 0),
      'total_ratings', (select count(*) from public.rider_ratings
        where rider_id = (select rider_id from actor)),
      'completed_deliveries', delivery_stats.completed,
      'cancellation_rate', case when delivery_stats.total = 0 then 0
        else delivery_stats.cancelled_failed * 100.0 / delivery_stats.total end,
      'on_time_delivery_rate', case when delivery_stats.completed = 0 then 0
        else delivery_stats.on_time * 100.0 / delivery_stats.completed end,
      'acceptance_rate', case when delivery_stats.total = 0 then 0 else 100 end,
      'completion_rate', case when delivery_stats.total = 0 then 0
        else delivery_stats.completed * 100.0 / delivery_stats.total end
    ),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating_id', rating.rating_id::text,
        'delivery_id', rating.delivery_id::text,
        'reviewer_role', rating.reviewer_role,
        'rating', rating.rating,
        'comment', rating.comment,
        'created_at', rating.created_at
      ) order by rating.created_at desc)
      from public.rider_ratings as rating
      where rating.rider_id = (select rider_id from actor)
    ), '[]'::jsonb)
  )
  from delivery_stats
$$;
create or replace function public.current_rider_dashboard()
returns jsonb language sql stable security definer set search_path = '' as $$
  with actor as (
    select private.current_rider_id() as rider_id, (select auth.uid()) as auth_id
  ), stats as (
    select count(*) as total,
      count(*) filter (where delivery.delivery_status in ('completed', 'delivered')) as completed,
      count(*) filter (where delivery.delivery_status in ('cancelled', 'failed')) as cancelled,
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
    where assignment.rider_id = (select rider_id from actor)
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
          where reads.rider_id = (select rider_id from actor)
            and reads.delivery_id = message.delivery_id
            and reads.party = message.party
        ), '-infinity')
    ),
    'unread_notification_count', (
      select count(*) from public.notifications as notification
      where notification.recipient_auth_user_id = (select auth_id from actor)
        and notification.read_at is null and notification.deleted_at is null
    ),
    'cancelled_or_failed_deliveries', stats.cancelled,
    'pending_earnings', null,
    'average_rating', coalesce((
      select avg(rating.rating) from public.rider_ratings as rating
      where rating.rider_id = (select rider_id from actor)
    ), 0),
    'completed_delivery_count', stats.completed,
    'on_time_delivery_rate', case when stats.completed = 0 then 0
      else stats.on_time * 100.0 / stats.completed end,
    'cancellation_rate', case when stats.total = 0 then 0
      else stats.cancelled * 100.0 / stats.total end,
    'unavailable_sections', jsonb_build_array('Earnings'),
    'fetched_at', now()
  ) from stats
$$;
revoke all on function public.submit_rider_rating(bigint, numeric, text)
  from public, anon;
revoke all on function public.current_rider_ratings() from public, anon;
revoke all on function public.current_rider_dashboard() from public, anon;
grant execute on function public.submit_rider_rating(bigint, numeric, text)
  to authenticated;
grant execute on function public.current_rider_ratings() to authenticated;
grant execute on function public.current_rider_dashboard() to authenticated;
commit;
