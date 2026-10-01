begin;
create table public.rider_delivery_messages (
  message_id uuid primary key default extensions.gen_random_uuid(),
  delivery_id bigint not null references public.deliveries(delivery_id) on delete cascade,
  party text not null check (party in ('buyer', 'seller', 'support')),
  sender_role text not null check (sender_role in ('rider', 'participant', 'support', 'system')),
  sender_auth_id uuid references auth.users(id) on delete set null,
  message_kind text not null default 'text' check (
    message_kind in ('text', 'location', 'photo', 'deliveryUpdate', 'system')
  ),
  body text not null default '' check (char_length(body) <= 1000),
  attachment_reference text,
  idempotency_key text,
  sent_at timestamptz not null default now(),
  check (btrim(body) <> '' or attachment_reference is not null)
);
create unique index rider_delivery_messages_idempotency_uidx
  on public.rider_delivery_messages(sender_auth_id, idempotency_key)
  where idempotency_key is not null;
create index rider_delivery_messages_conversation_idx
  on public.rider_delivery_messages(delivery_id, party, sent_at, message_id);
create table public.rider_conversation_reads (
  rider_id uuid not null references public.riders(rider_id) on delete cascade,
  delivery_id bigint not null references public.deliveries(delivery_id) on delete cascade,
  party text not null check (party in ('buyer', 'seller', 'support')),
  last_read_at timestamptz not null default now(),
  primary key (rider_id, delivery_id, party)
);
create or replace function private.can_access_rider_delivery_conversation(
  target_delivery_id bigint, target_party text
) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin()
    or private.rider_owns_delivery(target_delivery_id)
    or (
      target_party = 'buyer' and exists (
        select 1 from private.order_delivery_fulfillments as fulfillment
        where fulfillment.delivery_id = target_delivery_id
          and fulfillment.buyer_user_id = private.current_buyer_user_id()
      )
    )
    or (
      target_party = 'seller' and exists (
        select 1
        from private.order_delivery_fulfillments as fulfillment
        join public.orders as order_record
          on order_record.client_order_id = fulfillment.seller_order_id
        join public.cart_items as cart_item
          on cart_item.cart_item_id = order_record.cart_item_id
        join public.commodities as commodity
          on commodity.commodity_id = cart_item.commodity_id
        join public.farms as farm on farm.farm_id = commodity.farm_id
        where fulfillment.delivery_id = target_delivery_id
          and farm.farmer_user_id = private.current_farmer_user_id()
      )
    )
$$;
alter table public.rider_delivery_messages enable row level security;
alter table public.rider_conversation_reads enable row level security;
create policy rider_delivery_messages_participant_read
on public.rider_delivery_messages for select to authenticated
using (private.can_access_rider_delivery_conversation(delivery_id, party));
create policy rider_conversation_reads_owner_all
on public.rider_conversation_reads for all to authenticated
using (rider_id = private.current_rider_id())
with check (
  rider_id = private.current_rider_id()
  and private.rider_owns_delivery(delivery_id)
);
revoke all on public.rider_delivery_messages, public.rider_conversation_reads
  from public, anon, authenticated;
grant select on public.rider_delivery_messages to authenticated;
grant select, insert, update on public.rider_conversation_reads to authenticated;
create or replace function public.current_rider_conversations()
returns jsonb language sql stable security definer set search_path = '' as $$
  with assigned as (
    select assignment.delivery_id, assignment.rider_id,
      fulfillment.buyer_user_id, fulfillment.seller_order_id
    from private.rider_delivery_assignments as assignment
    left join private.order_delivery_fulfillments as fulfillment
      on fulfillment.delivery_id = assignment.delivery_id
    where assignment.rider_id = private.current_rider_id()
  ), participant_rows as (
    select assigned.delivery_id, assigned.rider_id, 'buyer'::text as party,
      coalesce(nullif(btrim(concat_ws(' ', buyer_user.first_name,
        buyer_user.last_name)), ''), 'Buyer') as participant_label
    from assigned
    left join public.buyers as buyer
      on buyer.buyer_user_id = assigned.buyer_user_id
    left join public.users as buyer_user on buyer_user.user_id = buyer.user_id
    union all
    select distinct assigned.delivery_id, assigned.rider_id, 'seller',
      coalesce(nullif(btrim(concat_ws(' ', farmer.first_name,
        farmer.last_name)), ''), nullif(farm.farm_name, ''), 'Seller')
    from assigned
    left join public.orders as order_record
      on order_record.client_order_id = assigned.seller_order_id
    left join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    left join public.commodities as commodity
      on commodity.commodity_id = cart_item.commodity_id
    left join public.farms as farm on farm.farm_id = commodity.farm_id
    left join public.farmers as farmer
      on farmer.farmer_user_id = farm.farmer_user_id
    union all
    select assigned.delivery_id, assigned.rider_id, 'support', 'Agrisell Support'
    from assigned
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id', 'delivery:' || participant.delivery_id || ':' || participant.party,
    'delivery_id', participant.delivery_id::text,
    'rider_id', participant.rider_id::text,
    'party', participant.party,
    'participant_label', participant.participant_label,
    'support_authorized', participant.party = 'support',
    'last_message_preview', latest.body,
    'last_activity', latest.sent_at,
    'unread_count', (
      select count(*) from public.rider_delivery_messages as unread
      where unread.delivery_id = participant.delivery_id
        and unread.party = participant.party
        and unread.sender_role <> 'rider'
        and unread.sent_at > coalesce(read_state.last_read_at, '-infinity')
    )
  ) order by latest.sent_at desc nulls last), '[]'::jsonb)
  from participant_rows as participant
  left join public.rider_conversation_reads as read_state
    on read_state.rider_id = participant.rider_id
      and read_state.delivery_id = participant.delivery_id
      and read_state.party = participant.party
  left join lateral (
    select message.body, message.sent_at
    from public.rider_delivery_messages as message
    where message.delivery_id = participant.delivery_id
      and message.party = participant.party
    order by message.sent_at desc limit 1
  ) as latest on true
$$;
create or replace function private.parse_rider_conversation(conversation_id text)
returns table(delivery_id bigint, party text)
language plpgsql immutable set search_path = '' as $$
begin
  if conversation_id !~ '^delivery:[0-9]+:(buyer|seller|support)$' then
    raise exception 'Invalid Rider conversation' using errcode = '22023';
  end if;
  return query select split_part(conversation_id, ':', 2)::bigint,
    split_part(conversation_id, ':', 3);
end;
$$;
create or replace function public.current_rider_conversation_messages(
  p_conversation_id text
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target record;
begin
  select * into target from private.parse_rider_conversation(p_conversation_id);
  if not private.rider_owns_delivery(target.delivery_id) then
    raise exception 'Conversation access is not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(message) order by message.sent_at, message.message_id)
    from public.rider_delivery_messages as message
    where message.delivery_id = target.delivery_id and message.party = target.party
  ), '[]'::jsonb);
end;
$$;
create or replace function public.send_rider_delivery_message(
  p_conversation_id text, p_body text, p_kind text default 'text',
  p_attachment_reference text default null, p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target record; actor_role text; saved public.rider_delivery_messages%rowtype;
begin
  select * into target from private.parse_rider_conversation(p_conversation_id);
  if private.rider_owns_delivery(target.delivery_id) then actor_role := 'rider';
  elsif private.is_admin() and target.party = 'support' then actor_role := 'support';
  elsif private.can_access_rider_delivery_conversation(target.delivery_id, target.party)
    then actor_role := 'participant';
  else raise exception 'Conversation access is not authorized' using errcode = '42501';
  end if;
  if p_kind not in ('text', 'location', 'photo', 'deliveryUpdate', 'system')
      or (btrim(coalesce(p_body, '')) = '' and p_attachment_reference is null) then
    raise exception 'Message content is required' using errcode = '22023';
  end if;
  insert into public.rider_delivery_messages(
    delivery_id, party, sender_role, sender_auth_id, message_kind,
    body, attachment_reference, idempotency_key
  ) values (
    target.delivery_id, target.party, actor_role, (select auth.uid()), p_kind,
    left(coalesce(p_body, ''), 1000), p_attachment_reference, p_idempotency_key
  )
  on conflict (sender_auth_id, idempotency_key) where idempotency_key is not null
  do update set idempotency_key = excluded.idempotency_key
  returning * into saved;
  return to_jsonb(saved);
end;
$$;
create or replace function public.mark_current_rider_conversation_read(
  p_conversation_id text
) returns void language plpgsql security definer set search_path = '' as $$
declare target record; current_rider uuid := private.current_rider_id();
begin
  select * into target from private.parse_rider_conversation(p_conversation_id);
  if current_rider is null or not private.rider_owns_delivery(target.delivery_id) then
    raise exception 'Conversation access is not authorized' using errcode = '42501';
  end if;
  insert into public.rider_conversation_reads(rider_id, delivery_id, party, last_read_at)
  values (current_rider, target.delivery_id, target.party, now())
  on conflict (rider_id, delivery_id, party)
  do update set last_read_at = excluded.last_read_at;
end;
$$;
revoke all on function public.current_rider_conversations() from public, anon;
revoke all on function public.current_rider_conversation_messages(text) from public, anon;
revoke all on function public.send_rider_delivery_message(text, text, text, text, text)
  from public, anon;
revoke all on function public.mark_current_rider_conversation_read(text)
  from public, anon;
grant execute on function public.current_rider_conversations() to authenticated;
grant execute on function public.current_rider_conversation_messages(text) to authenticated;
grant execute on function public.send_rider_delivery_message(text, text, text, text, text)
  to authenticated;
grant execute on function public.mark_current_rider_conversation_read(text)
  to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.rider_delivery_messages;
exception when duplicate_object then null;
end $$;
commit;
