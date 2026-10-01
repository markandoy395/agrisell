begin;
create or replace function private.send_marketplace_message(
  p_conversation_id bigint,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_auth_id uuid := (select auth.uid());
  buyer_auth_id uuid;
  farmer_auth_id uuid;
  recipient_auth_id uuid;
  actor_role text;
  target public.marketplace_conversations;
  saved public.marketplace_messages;
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Messages must contain between 1 and 1000 characters';
  end if;

  select conversation.*
  into target
  from public.marketplace_conversations as conversation
  where conversation.conversation_id = p_conversation_id;

  if target.conversation_id is null then
    raise exception 'Conversation not found';
  end if;

  select identity.auth_user_id
  into buyer_auth_id
  from private.auth_identities as identity
  where identity.buyer_user_id = target.buyer_user_id;

  select farmer.auth_user_id
  into farmer_auth_id
  from public.farmers as farmer
  where farmer.farmer_user_id = target.farmer_user_id;

  if actor_auth_id = buyer_auth_id
      and actor_auth_id is distinct from farmer_auth_id then
    actor_role := 'buyer';
    recipient_auth_id := farmer_auth_id;
  elsif actor_auth_id = farmer_auth_id
      and actor_auth_id is distinct from buyer_auth_id then
    actor_role := 'farmer';
    recipient_auth_id := buyer_auth_id;
  else
    raise exception 'You cannot send messages in this conversation';
  end if;

  insert into public.marketplace_messages (
    conversation_id,
    sender_role,
    body
  )
  values (
    p_conversation_id,
    actor_role,
    btrim(p_body)
  )
  returning * into saved;

  update public.marketplace_conversations
  set updated_at = saved.sent_at,
    buyer_last_read_at = case
      when actor_role = 'buyer' then saved.sent_at
      else buyer_last_read_at
    end,
    farmer_last_read_at = case
      when actor_role = 'farmer' then saved.sent_at
      else farmer_last_read_at
    end
  where conversation_id = p_conversation_id;

  if recipient_auth_id is not null then
    insert into public.notifications (
      recipient_auth_user_id,
      title,
      description,
      notification_type,
      category,
      destination,
      order_id,
      metadata
    )
    values (
      recipient_auth_id,
      'New message',
      left(saved.body, 180),
      'new_message',
      'messages',
      'messages',
      target.order_id,
      jsonb_build_object(
        'conversation_id', target.conversation_id::text,
        'sender_role', actor_role
      )
    );
  end if;

  return jsonb_build_object(
    'message_id', saved.message_id::text,
    'sender_role', saved.sender_role,
    'body', saved.body,
    'sent_at', saved.sent_at
  );
end;
$$;
revoke all on function private.send_marketplace_message(bigint, text)
  from public, anon;
grant execute on function private.send_marketplace_message(bigint, text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
