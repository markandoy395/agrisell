begin;
-- This follow-up is safe for databases that already applied the initial
-- notification migration before approval alerts were added to the app.
drop policy if exists notifications_recipient_mark_read on public.notifications;
create policy notifications_recipient_mark_read on public.notifications
  for update to authenticated
  using (recipient_auth_user_id = (select auth.uid()))
  with check (recipient_auth_user_id = (select auth.uid()));
grant update (read_at) on public.notifications to authenticated;
insert into public.notifications (
  recipient_auth_user_id, title, description
)
select
  farmer.auth_user_id,
  'Farmer account approved',
  'Your farmer account has been approved. You can now add products.'
from public.farmers farmer
where lower(farmer.verification_status) = 'verified'
  and not exists (
    select 1 from public.notifications notification
    where notification.recipient_auth_user_id = farmer.auth_user_id
      and notification.title = 'Farmer account approved'
  );
commit;
