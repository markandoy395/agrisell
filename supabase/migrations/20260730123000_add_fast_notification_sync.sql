begin;
alter table public.notifications
  add column if not exists deleted_at timestamptz;
create index if not exists notifications_active_recipient_created_at_idx
  on public.notifications (recipient_auth_user_id, created_at desc)
  where deleted_at is null;
drop policy if exists notifications_recipient_mark_read
  on public.notifications;
drop policy if exists notifications_recipient_update
  on public.notifications;
create policy notifications_recipient_update on public.notifications
  for update to authenticated
  using (recipient_auth_user_id = (select auth.uid()))
  with check (recipient_auth_user_id = (select auth.uid()));
grant select on public.notifications to authenticated;
grant update (read_at, deleted_at) on public.notifications to authenticated;
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
notify pgrst, 'reload schema';
commit;
