begin;
-- Rider approval is represented by the administrator-controlled employment
-- status in the final ERD. Notify the Rider account connected through the
-- private auth identity whenever that status changes.
create or replace function private.notify_rider_employment_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rider_auth_id uuid;
begin
  if new.employment_status is not distinct from old.employment_status then
    return new;
  end if;

  select identity.auth_user_id
  into rider_auth_id
  from private.auth_identities as identity
  where identity.rider_id = new.rider_id;

  if rider_auth_id is null then
    return new;
  end if;

  insert into public.notifications (
    recipient_auth_user_id,
    title,
    description,
    notification_type,
    category,
    destination,
    metadata
  ) values (
    rider_auth_id,
    case new.employment_status
      when 'active' then 'Rider account approved'
      when 'suspended' then 'Rider account suspended'
      else 'Rider account update'
    end,
    case new.employment_status
      when 'active' then
        'Your Rider account has been approved. You can now go online and accept delivery requests.'
      when 'suspended' then
        'Your Rider account has been suspended. Delivery access is unavailable.'
      else
        'Your Rider account status has been updated. Please review your account details.'
    end,
    'verification_update',
    'system',
    'deliveries',
    jsonb_build_object(
      'event_id', new.rider_id::text || ':employment:' ||
        new.employment_status || ':' || txid_current()::text,
      'rider_id', new.rider_id,
      'employment_status', new.employment_status
    )
  );

  return new;
end;
$$;
drop trigger if exists riders_notify_employment_status on public.riders;
create trigger riders_notify_employment_status
after update of employment_status on public.riders
for each row
when (old.employment_status is distinct from new.employment_status)
execute function private.notify_rider_employment_status_change();
-- Give Riders approved before this migration the same notice. The title check
-- keeps this migration idempotent with any manually-created approval notice.
insert into public.notifications (
  recipient_auth_user_id,
  title,
  description,
  notification_type,
  category,
  destination,
  metadata
)
select
  identity.auth_user_id,
  'Rider account approved',
  'Your Rider account has been approved. You can now go online and accept delivery requests.',
  'verification_update',
  'system',
  'deliveries',
  jsonb_build_object(
    'event_id', rider.rider_id::text || ':employment:active:backfill',
    'rider_id', rider.rider_id,
    'employment_status', rider.employment_status,
    'backfilled', true
  )
from public.riders as rider
join private.auth_identities as identity
  on identity.rider_id = rider.rider_id
where rider.employment_status = 'active'
  and not exists (
    select 1
    from public.notifications as notification
    where notification.recipient_auth_user_id = identity.auth_user_id
      and notification.title = 'Rider account approved'
  );
commit;
