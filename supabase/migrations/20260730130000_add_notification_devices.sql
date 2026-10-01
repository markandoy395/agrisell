begin;
create table if not exists public.notification_devices (
  device_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, fcm_token)
);
create index if not exists notification_devices_user_updated_at_idx
  on public.notification_devices (user_id, updated_at desc);
alter table public.notification_devices enable row level security;
drop policy if exists notification_devices_owner_access
  on public.notification_devices;
create policy notification_devices_owner_access on public.notification_devices
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.notification_devices
  to authenticated;
drop trigger if exists notification_devices_set_updated_at
  on public.notification_devices;
create trigger notification_devices_set_updated_at
before update on public.notification_devices
for each row execute function public.set_updated_at();
notify pgrst, 'reload schema';
commit;
