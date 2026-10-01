begin;
create or replace function private.rider_owns_delivery(target_delivery_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.rider_delivery_assignments as assignment
    where assignment.delivery_id = target_delivery_id
      and assignment.rider_id = private.current_rider_id()
  )
$$;
create table public.delivery_proofs (
  proof_id uuid primary key default extensions.gen_random_uuid(),
  delivery_id bigint not null references public.deliveries(delivery_id) on delete cascade,
  rider_id uuid not null references public.riders(rider_id) on delete cascade,
  proof_stage text not null check (proof_stage in ('pickup', 'delivery')),
  proof_type text not null check (proof_type in ('photo', 'confirmation_code', 'signature')),
  file_path text,
  confirmation_code_hash text,
  remarks text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((file_path is not null) <> (confirmation_code_hash is not null))
);
create unique index delivery_proofs_file_path_uidx
  on public.delivery_proofs(delivery_id, file_path) where file_path is not null;
create unique index delivery_proofs_confirmation_uidx
  on public.delivery_proofs(delivery_id, proof_stage, proof_type)
  where proof_type = 'confirmation_code';
create index delivery_proofs_delivery_created_idx
  on public.delivery_proofs(delivery_id, created_at);
create table public.rider_incidents (
  report_id text primary key,
  rider_id uuid not null references public.riders(rider_id) on delete cascade,
  delivery_id bigint references public.deliveries(delivery_id) on delete cascade,
  report_type text not null check (report_type in (
    'safety_action', 'safety_report', 'pickup_problem',
    'destination_problem', 'delivery_problem'
  )),
  category text not null,
  stage text,
  description text not null default '',
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  requested_actions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(requested_actions) = 'array'),
  status text not null default 'submitted' check (status in (
    'submitted', 'underReview', 'waitingForInformation',
    'resolved', 'rejected', 'escalated'
  )),
  reported_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rider_incidents_rider_reported_idx
  on public.rider_incidents(rider_id, reported_at desc);
create index rider_incidents_delivery_reported_idx
  on public.rider_incidents(delivery_id, reported_at desc)
  where delivery_id is not null;
alter table public.delivery_proofs enable row level security;
alter table public.rider_incidents enable row level security;
create policy delivery_proofs_rider_read on public.delivery_proofs
for select to authenticated using (
  rider_id = private.current_rider_id() and private.rider_owns_delivery(delivery_id)
);
create policy delivery_proofs_rider_insert on public.delivery_proofs
for insert to authenticated with check (
  rider_id = private.current_rider_id() and private.rider_owns_delivery(delivery_id)
);
create policy rider_incidents_owner_read on public.rider_incidents
for select to authenticated using (rider_id = private.current_rider_id());
create policy rider_incidents_owner_insert on public.rider_incidents
for insert to authenticated with check (
  rider_id = private.current_rider_id()
  and (delivery_id is null or private.rider_owns_delivery(delivery_id))
);
create policy delivery_proofs_admin_all on public.delivery_proofs
for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy rider_incidents_admin_all on public.rider_incidents
for all to authenticated using (private.is_admin()) with check (private.is_admin());
revoke all on public.delivery_proofs, public.rider_incidents from public, anon, authenticated;
grant select, insert on public.delivery_proofs to authenticated;
grant select, insert on public.rider_incidents to authenticated;
grant update(status, updated_at) on public.rider_incidents to authenticated;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proofs', 'delivery-proofs', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
create or replace function private.rider_storage_delivery_id(object_name text)
returns bigint language plpgsql immutable set search_path = '' as $$
declare value text := split_part(object_name, '/', 2);
begin
  if value !~ '^[0-9]+$' then return null; end if;
  return value::bigint;
end;
$$;
create policy rider_delivery_proof_storage_read on storage.objects
for select to authenticated using (
  bucket_id = 'delivery-proofs'
  and (
    private.is_admin()
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and private.rider_owns_delivery(private.rider_storage_delivery_id(name))
    )
  )
);
create policy rider_delivery_proof_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'delivery-proofs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.rider_owns_delivery(private.rider_storage_delivery_id(name))
);
create policy rider_delivery_proof_storage_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'delivery-proofs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.rider_owns_delivery(private.rider_storage_delivery_id(name))
);
create or replace function public.save_current_rider_delivery_proof(
  p_delivery_id bigint,
  p_stage text,
  p_type text,
  p_file_path text,
  p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_rider uuid := private.current_rider_id();
declare saved public.delivery_proofs%rowtype;
begin
  if current_rider is null or not private.rider_owns_delivery(p_delivery_id) then
    raise exception 'Delivery is not assigned to this rider' using errcode = '42501';
  end if;
  if p_stage not in ('pickup', 'delivery')
      or p_type not in ('photo', 'signature')
      or btrim(p_file_path) = ''
      or split_part(p_file_path, '/', 1) <> (select auth.uid())::text
      or private.rider_storage_delivery_id(p_file_path) <> p_delivery_id then
    raise exception 'Invalid delivery proof' using errcode = '22023';
  end if;
  insert into public.delivery_proofs(
    delivery_id, rider_id, proof_stage, proof_type, file_path,
    remarks, latitude, longitude, confirmed_at
  ) values (
    p_delivery_id, current_rider, p_stage, p_type, p_file_path,
    p_remarks, p_latitude, p_longitude, now()
  )
  on conflict (delivery_id, file_path) where file_path is not null
  do update set remarks = excluded.remarks,
    latitude = excluded.latitude, longitude = excluded.longitude,
    confirmed_at = excluded.confirmed_at, updated_at = now()
  returning * into saved;
  return to_jsonb(saved);
end;
$$;
create or replace function public.save_current_rider_confirmation_code(
  p_delivery_id bigint, p_stage text, p_code text, p_remarks text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_rider uuid := private.current_rider_id();
declare saved public.delivery_proofs%rowtype;
begin
  if current_rider is null or not private.rider_owns_delivery(p_delivery_id) then
    raise exception 'Delivery is not assigned to this rider' using errcode = '42501';
  end if;
  if p_stage not in ('pickup', 'delivery') or length(btrim(p_code)) < 4 then
    raise exception 'Invalid confirmation code' using errcode = '22023';
  end if;
  insert into public.delivery_proofs(
    delivery_id, rider_id, proof_stage, proof_type,
    confirmation_code_hash, remarks, confirmed_at
  ) values (
    p_delivery_id, current_rider, p_stage, 'confirmation_code',
    encode(extensions.digest(convert_to(btrim(p_code), 'UTF8'), 'sha256'), 'hex'),
    p_remarks, now()
  )
  on conflict (delivery_id, proof_stage, proof_type)
    where proof_type = 'confirmation_code'
  do update set confirmation_code_hash = excluded.confirmation_code_hash,
    remarks = excluded.remarks, confirmed_at = now(), updated_at = now()
  returning * into saved;
  return to_jsonb(saved) - 'confirmation_code_hash';
end;
$$;
revoke all on function public.save_current_rider_confirmation_code(bigint, text, text, text)
  from public, anon;
revoke all on function public.save_current_rider_delivery_proof(
  bigint, text, text, text, text, double precision, double precision
) from public, anon;
grant execute on function public.save_current_rider_confirmation_code(bigint, text, text, text)
  to authenticated;
grant execute on function public.save_current_rider_delivery_proof(
  bigint, text, text, text, text, double precision, double precision
) to authenticated;
commit;
