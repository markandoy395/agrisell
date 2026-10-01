begin;
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
      )
  )
$$;
drop policy if exists marketplace_conversations_participant_read
  on public.marketplace_conversations;
create policy marketplace_conversations_participant_read
on public.marketplace_conversations for select to authenticated
using (private.can_access_marketplace_conversation(conversation_id));
drop policy if exists marketplace_messages_participant_read
  on public.marketplace_messages;
create policy marketplace_messages_participant_read
on public.marketplace_messages for select to authenticated
using (private.can_access_marketplace_conversation(conversation_id));
create or replace function private.mark_marketplace_conversation_read(
  p_conversation_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_auth_id uuid := (select auth.uid());
  buyer_auth_id uuid;
  farmer_auth_id uuid;
begin
  select buyer_identity.auth_user_id, farmer.auth_user_id
  into buyer_auth_id, farmer_auth_id
  from public.marketplace_conversations as conversation
  left join private.auth_identities as buyer_identity
    on buyer_identity.buyer_user_id = conversation.buyer_user_id
  join public.farmers as farmer
    on farmer.farmer_user_id = conversation.farmer_user_id
  where conversation.conversation_id = p_conversation_id;

  if actor_auth_id = buyer_auth_id
      and actor_auth_id is distinct from farmer_auth_id then
    update public.marketplace_conversations
    set buyer_last_read_at = now()
    where conversation_id = p_conversation_id;
  elsif actor_auth_id = farmer_auth_id
      and actor_auth_id is distinct from buyer_auth_id then
    update public.marketplace_conversations
    set farmer_last_read_at = now()
    where conversation_id = p_conversation_id;
  else
    raise exception 'Conversation not found';
  end if;
end;
$$;
create or replace function public.start_marketplace_conversation(
  commodity_id bigint default null,
  farm_id bigint default null,
  client_order_id text default null
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select private.start_marketplace_conversation(
    commodity_id,
    farm_id,
    client_order_id
  )
$$;
create or replace function public.current_marketplace_conversations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_marketplace_conversations()
$$;
create or replace function public.marketplace_conversation_messages(
  conversation_id bigint
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.marketplace_conversation_messages(conversation_id)
$$;
create or replace function public.mark_marketplace_conversation_read(
  conversation_id bigint
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.mark_marketplace_conversation_read(conversation_id)
$$;
create or replace function public.send_marketplace_message(
  conversation_id bigint,
  body text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.send_marketplace_message(conversation_id, body)
$$;
revoke all on function private.start_marketplace_conversation(bigint, bigint, text)
  from authenticated;
revoke all on function private.current_marketplace_conversations()
  from authenticated;
revoke all on function private.marketplace_conversation_messages(bigint)
  from authenticated;
revoke all on function private.mark_marketplace_conversation_read(bigint)
  from authenticated;
revoke all on function private.send_marketplace_message(bigint, text)
  from authenticated;
revoke all on function public.start_marketplace_conversation(bigint, bigint, text)
  from public, anon;
revoke all on function public.current_marketplace_conversations()
  from public, anon;
revoke all on function public.marketplace_conversation_messages(bigint)
  from public, anon;
revoke all on function public.mark_marketplace_conversation_read(bigint)
  from public, anon;
revoke all on function public.send_marketplace_message(bigint, text)
  from public, anon;
grant execute on function public.start_marketplace_conversation(bigint, bigint, text)
  to authenticated;
grant execute on function public.current_marketplace_conversations()
  to authenticated;
grant execute on function public.marketplace_conversation_messages(bigint)
  to authenticated;
grant execute on function public.mark_marketplace_conversation_read(bigint)
  to authenticated;
grant execute on function public.send_marketplace_message(bigint, text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
