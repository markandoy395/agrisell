begin;

-- 1. Extend public.marketplace_conversations with moderation and audit metadata
alter table public.marketplace_conversations
  add column if not exists moderation_status text not null default 'active'
    check (moderation_status in ('active', 'flagged', 'under_review', 'resolved', 'suspended')),
  add column if not exists flag_reason text
    check (flag_reason is null or flag_reason in ('potential_scam', 'off_platform_deal', 'harassment_abuse', 'counterfeit_pricing', 'inappropriate_content', 'other')),
  add column if not exists moderation_notes text,
  add column if not exists flagged_at timestamptz,
  add column if not exists flagged_by text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by text;

create index if not exists marketplace_conversations_moderation_idx
  on public.marketplace_conversations (moderation_status, updated_at desc);

-- 2. Allow administrative and system messages in public.marketplace_messages
alter table public.marketplace_messages
  drop constraint if exists marketplace_messages_sender_role_check;

alter table public.marketplace_messages
  add constraint marketplace_messages_sender_role_check
  check (sender_role in ('buyer', 'farmer', 'admin', 'system'));

-- 3. Update private.can_access_marketplace_conversation to grant full access to administrators
create or replace function private.can_access_marketplace_conversation(
  target_conversation_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.marketplace_conversations as conversation
    left join private.auth_identities as buyer_identity
      on buyer_identity.buyer_user_id = conversation.buyer_user_id
    join public.farmers as farmer
      on farmer.farmer_user_id = conversation.farmer_user_id
    where conversation.conversation_id = target_conversation_id
      and (
        buyer_identity.auth_user_id = (select auth.uid())
        or farmer.auth_user_id = (select auth.uid())
        or private.is_admin()
      )
  )
$$;

-- 4. RLS policies on public.marketplace_conversations and public.marketplace_messages
drop policy if exists marketplace_conversations_admin_audit_read on public.marketplace_conversations;
create policy marketplace_conversations_admin_audit_read
on public.marketplace_conversations for select to authenticated
using (private.is_admin());

drop policy if exists marketplace_conversations_admin_update on public.marketplace_conversations;
create policy marketplace_conversations_admin_update
on public.marketplace_conversations for update to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists marketplace_messages_admin_audit_read on public.marketplace_messages;
create policy marketplace_messages_admin_audit_read
on public.marketplace_messages for select to authenticated
using (private.is_admin());

drop policy if exists marketplace_messages_admin_insert on public.marketplace_messages;
create policy marketplace_messages_admin_insert
on public.marketplace_messages for insert to authenticated
with check (private.is_admin());

-- 5. Prevent message submission on suspended conversations in private.send_marketplace_message
create or replace function private.send_marketplace_message(
  p_conversation_id bigint,
  p_body text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text;
  actor_is_buyer boolean;
  actor_is_farmer boolean;
  current_mod_status text;
  saved public.marketplace_messages;
begin
  if not private.can_access_marketplace_conversation(p_conversation_id) then
    raise exception 'Conversation not found';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Messages must contain between 1 and 1000 characters';
  end if;

  select
    conversation.buyer_user_id = private.current_buyer_user_id(),
    conversation.farmer_user_id = private.current_farmer_user_id(),
    conversation.moderation_status
  into actor_is_buyer, actor_is_farmer, current_mod_status
  from public.marketplace_conversations as conversation
  where conversation.conversation_id = p_conversation_id;

  if current_mod_status = 'suspended' then
    raise exception 'This conversation has been suspended by an administrator for review';
  end if;

  if coalesce(actor_is_buyer, false) = coalesce(actor_is_farmer, false) then
    if private.is_admin() then
      actor_role := 'admin';
    else
      raise exception 'Messaging identity is ambiguous or unavailable';
    end if;
  else
    actor_role := case when actor_is_buyer then 'buyer' else 'farmer' end;
  end if;

  insert into public.marketplace_messages (conversation_id, sender_role, body)
  values (p_conversation_id, actor_role, btrim(p_body)) returning * into saved;

  update public.marketplace_conversations
  set updated_at = saved.sent_at,
    buyer_last_read_at = case when actor_role = 'buyer' then saved.sent_at else buyer_last_read_at end,
    farmer_last_read_at = case when actor_role = 'farmer' then saved.sent_at else farmer_last_read_at end
  where conversation_id = p_conversation_id;

  return jsonb_build_object('message_id', saved.message_id::text,
    'sender_role', saved.sender_role, 'body', saved.body, 'sent_at', saved.sent_at);
end;
$$;

-- 6. Admin RPC: Retrieve list of marketplace conversations with search and filters
create or replace function public.admin_get_marketplace_conversations(
  p_filter text default 'all',
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  v_search text := nullif(btrim(p_search), '');
begin
  select coalesce(jsonb_agg(row_to_json(sub)), '[]'::jsonb)
  into result
  from (
    select
      c.conversation_id::text as conversation_id,
      c.created_at,
      c.updated_at,
      c.moderation_status,
      c.flag_reason,
      c.moderation_notes,
      c.flagged_at,
      c.flagged_by,
      c.moderated_at,
      c.moderated_by,
      -- Buyer details
      c.buyer_user_id::text as buyer_user_id,
      coalesce(nullif(btrim(concat_ws(' ', bu.first_name, bu.last_name)), ''), 'Buyer #' || c.buyer_user_id) as buyer_name,
      bu.email as buyer_email,
      bu.contact_number as buyer_phone,
      bu.profile_photo_url as buyer_image_url,
      -- Farmer & Farm details
      c.farmer_user_id::text as farmer_user_id,
      coalesce(nullif(btrim(concat_ws(' ', f.first_name, f.last_name)), ''), nullif(farm.farm_name, ''), 'Farmer #' || c.farmer_user_id) as farmer_name,
      f.phone_number as farmer_phone,
      f.profile_image_url as farmer_image_url,
      c.farm_id::text as farm_id,
      coalesce(nullif(farm.farm_name, ''), 'Farm') as farm_name,
      coalesce(nullif(farm.farm_location, ''), 'Location unavailable') as farm_location,
      -- Commodity details
      c.commodity_id::text as commodity_id,
      cmd.commodity_name,
      cmd.image_url as commodity_image_url,
      cmd.unit_type,
      cmd.price_per_unit,
      -- Order details
      c.order_id::text as order_id,
      o.client_order_id,
      o.order_status,
      ci.quantity as order_quantity,
      coalesce(ci.price_at_time, cmd.price_per_unit) as order_unit_price,
      -- Message stats & last message
      coalesce(msg_stats.message_count, 0) as message_count,
      last_msg.body as last_message_body,
      last_msg.sender_role as last_message_sender,
      coalesce(last_msg.sent_at, c.updated_at) as last_message_at
    from public.marketplace_conversations c
    join public.buyers b on b.buyer_user_id = c.buyer_user_id
    join public.users bu on bu.user_id = b.user_id
    join public.farmers f on f.farmer_user_id = c.farmer_user_id
    join public.farms farm on farm.farm_id = c.farm_id
    left join public.commodities cmd on cmd.commodity_id = c.commodity_id
    left join public.orders o on o.order_id = c.order_id
    left join public.cart_items ci on ci.cart_item_id = o.cart_item_id
    left join lateral (
      select count(*)::integer as message_count
      from public.marketplace_messages m
      where m.conversation_id = c.conversation_id
    ) msg_stats on true
    left join lateral (
      select m.body, m.sender_role, m.sent_at
      from public.marketplace_messages m
      where m.conversation_id = c.conversation_id
      order by m.sent_at desc, m.message_id desc
      limit 1
    ) last_msg on true
    where (
      p_filter = 'all'
      or (p_filter = 'flagged' and c.moderation_status in ('flagged', 'under_review', 'suspended'))
      or (p_filter = 'active' and c.moderation_status = 'active')
      or (p_filter = 'under_review' and c.moderation_status = 'under_review')
      or (p_filter = 'suspended' and c.moderation_status = 'suspended')
      or (p_filter = 'resolved' and c.moderation_status = 'resolved')
    )
    and (
      v_search is null
      or bu.first_name ilike '%' || v_search || '%'
      or bu.last_name ilike '%' || v_search || '%'
      or bu.email ilike '%' || v_search || '%'
      or bu.contact_number ilike '%' || v_search || '%'
      or f.first_name ilike '%' || v_search || '%'
      or f.last_name ilike '%' || v_search || '%'
      or f.phone_number ilike '%' || v_search || '%'
      or farm.farm_name ilike '%' || v_search || '%'
      or cmd.commodity_name ilike '%' || v_search || '%'
      or o.client_order_id ilike '%' || v_search || '%'
      or c.flag_reason ilike '%' || v_search || '%'
      or c.moderation_notes ilike '%' || v_search || '%'
      or exists (
        select 1 from public.marketplace_messages sm
        where sm.conversation_id = c.conversation_id
          and sm.body ilike '%' || v_search || '%'
      )
    )
    order by coalesce(last_msg.sent_at, c.updated_at) desc
    limit p_limit
    offset p_offset
  ) sub;

  return result;
end;
$$;

-- 7. Admin RPC: Retrieve complete conversation detail with chronological transcript
create or replace function public.admin_get_marketplace_conversation_detail(
  p_conversation_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conv_record jsonb;
  messages_json jsonb;
begin
  -- Fetch conversation metadata and participant info
  select row_to_json(sub)::jsonb
  into conv_record
  from (
    select
      c.conversation_id::text as conversation_id,
      c.created_at,
      c.updated_at,
      c.moderation_status,
      c.flag_reason,
      c.moderation_notes,
      c.flagged_at,
      c.flagged_by,
      c.moderated_at,
      c.moderated_by,
      -- Buyer details
      c.buyer_user_id::text as buyer_user_id,
      coalesce(nullif(btrim(concat_ws(' ', bu.first_name, bu.last_name)), ''), 'Buyer #' || c.buyer_user_id) as buyer_name,
      bu.email as buyer_email,
      bu.contact_number as buyer_phone,
      bu.profile_photo_url as buyer_image_url,
      -- Farmer & Farm details
      c.farmer_user_id::text as farmer_user_id,
      coalesce(nullif(btrim(concat_ws(' ', f.first_name, f.last_name)), ''), nullif(farm.farm_name, ''), 'Farmer #' || c.farmer_user_id) as farmer_name,
      f.phone_number as farmer_phone,
      f.profile_image_url as farmer_image_url,
      c.farm_id::text as farm_id,
      coalesce(nullif(farm.farm_name, ''), 'Farm') as farm_name,
      coalesce(nullif(farm.farm_location, ''), 'Location unavailable') as farm_location,
      -- Commodity details
      c.commodity_id::text as commodity_id,
      cmd.commodity_name,
      cmd.image_url as commodity_image_url,
      cmd.unit_type,
      cmd.price_per_unit,
      -- Order details
      c.order_id::text as order_id,
      o.client_order_id,
      o.order_status,
      ci.quantity as order_quantity,
      coalesce(ci.price_at_time, cmd.price_per_unit) as order_unit_price
    from public.marketplace_conversations c
    join public.buyers b on b.buyer_user_id = c.buyer_user_id
    join public.users bu on bu.user_id = b.user_id
    join public.farmers f on f.farmer_user_id = c.farmer_user_id
    join public.farms farm on farm.farm_id = c.farm_id
    left join public.commodities cmd on cmd.commodity_id = c.commodity_id
    left join public.orders o on o.order_id = c.order_id
    left join public.cart_items ci on ci.cart_item_id = o.cart_item_id
    where c.conversation_id = p_conversation_id
  ) sub;

  if conv_record is null then
    return null;
  end if;

  -- Fetch chronological message transcript
  select coalesce(jsonb_agg(jsonb_build_object(
    'message_id', m.message_id::text,
    'conversation_id', m.conversation_id::text,
    'sender_role', m.sender_role,
    'sender_name', case
      when m.sender_role = 'buyer' then conv_record->>'buyer_name'
      when m.sender_role = 'farmer' then conv_record->>'farmer_name'
      when m.sender_role = 'admin' then 'AgriSell Trust & Safety Administrator'
      else 'System Notice'
    end,
    'body', m.body,
    'sent_at', m.sent_at
  ) order by m.sent_at asc, m.message_id asc), '[]'::jsonb)
  into messages_json
  from public.marketplace_messages m
  where m.conversation_id = p_conversation_id;

  return jsonb_build_object(
    'conversation', conv_record,
    'messages', messages_json
  );
end;
$$;

-- 8. Admin RPC: Moderate conversation
create or replace function public.admin_moderate_marketplace_conversation(
  p_conversation_id bigint,
  p_status text,
  p_flag_reason text default null,
  p_notes text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conv public.marketplace_conversations%rowtype;
begin
  if p_status not in ('active', 'flagged', 'under_review', 'resolved', 'suspended') then
    raise exception 'Invalid moderation status';
  end if;

  select * into target_conv
  from public.marketplace_conversations
  where conversation_id = p_conversation_id;

  if not found then
    raise exception 'Marketplace conversation not found';
  end if;

  update public.marketplace_conversations
  set
    moderation_status = p_status,
    flag_reason = coalesce(p_flag_reason, flag_reason),
    moderation_notes = coalesce(p_notes, moderation_notes),
    flagged_at = case
      when p_status in ('flagged', 'under_review', 'suspended') and flagged_at is null then now()
      when p_status in ('active', 'resolved') then null
      else flagged_at
    end,
    flagged_by = case
      when p_status in ('flagged', 'under_review', 'suspended') and flagged_by is null then coalesce(p_actor, 'admin')
      when p_status in ('active', 'resolved') then null
      else flagged_by
    end,
    moderated_at = now(),
    moderated_by = coalesce(p_actor, 'admin'),
    updated_at = now()
  where conversation_id = p_conversation_id;

  return public.admin_get_marketplace_conversation_detail(p_conversation_id);
end;
$$;

-- 9. Admin RPC: Send official moderation intervention / warning into conversation
create or replace function public.admin_send_marketplace_intervention(
  p_conversation_id bigint,
  p_body text,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_msg public.marketplace_messages;
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Intervention message must contain between 1 and 1000 characters';
  end if;

  if not exists (select 1 from public.marketplace_conversations where conversation_id = p_conversation_id) then
    raise exception 'Conversation not found';
  end if;

  insert into public.marketplace_messages (conversation_id, sender_role, body)
  values (p_conversation_id, 'admin', btrim(p_body))
  returning * into saved_msg;

  update public.marketplace_conversations
  set updated_at = saved_msg.sent_at,
    moderated_at = now(),
    moderated_by = coalesce(p_actor, 'admin')
  where conversation_id = p_conversation_id;

  return jsonb_build_object(
    'message_id', saved_msg.message_id::text,
    'conversation_id', saved_msg.conversation_id::text,
    'sender_role', saved_msg.sender_role,
    'sender_name', 'AgriSell Trust & Safety Administrator',
    'body', saved_msg.body,
    'sent_at', saved_msg.sent_at
  );
end;
$$;

-- 10. Update public.admin_get_support_hub to include marketplace chat stats
create or replace function public.admin_get_support_hub()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  tickets_json jsonb;
  delivery_chats_json jsonb;
  stats_json jsonb;
  total_marketplace_count integer := 0;
  flagged_marketplace_count integer := 0;
begin
  -- Collect tickets with customer info and last message
  select coalesce(jsonb_agg(jsonb_build_object(
    'ticket_id', t.ticket_id,
    'ticket_number', t.ticket_number,
    'user_id', t.user_id,
    'user_role', t.user_role,
    'customer_name', coalesce(nullif(btrim(u.first_name || ' ' || coalesce(u.last_name, '')), ''), 'Customer ' || t.user_id),
    'customer_email', u.email,
    'customer_phone', u.contact_number,
    'subject', t.subject,
    'category', t.category,
    'status', t.status,
    'priority', t.priority,
    'assigned_admin', t.assigned_admin,
    'order_id', t.order_id,
    'delivery_id', t.delivery_id,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'resolved_at', t.resolved_at,
    'message_count', (select count(*) from public.support_messages m where m.ticket_id = t.ticket_id),
    'last_message_preview', (
      select m.body from public.support_messages m
      where m.ticket_id = t.ticket_id
      order by m.created_at desc limit 1
    ),
    'last_message_time', (
      select m.created_at from public.support_messages m
      where m.ticket_id = t.ticket_id
      order by m.created_at desc limit 1
    ),
    'last_sender_role', (
      select m.sender_role from public.support_messages m
      where m.ticket_id = t.ticket_id
      order by m.created_at desc limit 1
    )
  ) order by t.updated_at desc), '[]'::jsonb)
  into tickets_json
  from public.support_tickets t
  join public.users u on u.user_id = t.user_id;

  -- Collect active rider delivery support chats
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id', 'delivery:' || m.delivery_id || ':support',
    'delivery_id', m.delivery_id,
    'rider_id', a.rider_id,
    'rider_name', r.full_name,
    'rider_phone', r.contact_number,
    'last_message', m.body,
    'last_activity', m.sent_at,
    'last_sender_role', m.sender_role,
    'order_id', d.order_id,
    'delivery_status', d.delivery_status
  ) order by m.sent_at desc), '[]'::jsonb)
  into delivery_chats_json
  from (
    select distinct on (delivery_id) *
    from public.rider_delivery_messages
    where party = 'support'
    order by delivery_id, sent_at desc
  ) m
  join public.deliveries d on d.delivery_id = m.delivery_id
  left join public.delivery_assignments a on a.delivery_id = d.delivery_id and a.assignment_status = 'assigned'
  left join public.riders r on r.rider_id = a.rider_id;

  -- Count marketplace chats
  select count(*)::integer into total_marketplace_count from public.marketplace_conversations;
  select count(*)::integer into flagged_marketplace_count from public.marketplace_conversations where moderation_status in ('flagged', 'under_review', 'suspended');

  -- Aggregate stats
  select jsonb_build_object(
    'total', count(*),
    'open', count(*) filter (where status = 'open'),
    'in_progress', count(*) filter (where status = 'in_progress'),
    'waiting_on_customer', count(*) filter (where status = 'waiting_on_customer'),
    'resolved', count(*) filter (where status in ('resolved', 'closed')),
    'urgent', count(*) filter (where priority = 'urgent'),
    'delivery_support_chats', coalesce(jsonb_array_length(delivery_chats_json), 0),
    'marketplace_chats', total_marketplace_count,
    'flagged_marketplace_chats', flagged_marketplace_count
  )
  into stats_json
  from public.support_tickets;

  return jsonb_build_object(
    'tickets', tickets_json,
    'delivery_chats', delivery_chats_json,
    'stats', stats_json
  );
end;
$$;

-- 11. Grant permissions
grant execute on function public.admin_get_marketplace_conversations(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_get_marketplace_conversation_detail(bigint) to authenticated, service_role;
grant execute on function public.admin_moderate_marketplace_conversation(bigint, text, text, text, text) to authenticated, service_role;
grant execute on function public.admin_send_marketplace_intervention(bigint, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
