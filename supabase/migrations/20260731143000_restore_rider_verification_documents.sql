begin;
create table public.rider_documents (
  document_id uuid primary key default extensions.gen_random_uuid(),
  rider_id uuid not null references public.riders(rider_id) on delete cascade,
  vehicle_id uuid,
  document_type text not null check (document_type in (
    'drivers_license', 'valid_id', 'profile_selfie',
    'vehicle_or', 'vehicle_cr', 'vehicle_photo'
  )),
  document_number text,
  file_path text not null check (btrim(file_path) <> '' and file_path !~* '^https?://'),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  rejection_reason text,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (document_type in ('drivers_license', 'valid_id', 'profile_selfie')
      and vehicle_id is null)
    or
    (document_type in ('vehicle_or', 'vehicle_cr', 'vehicle_photo')
      and vehicle_id = rider_id)
  )
);
create unique index rider_documents_personal_type_uidx
  on public.rider_documents(rider_id, document_type)
  where vehicle_id is null;
create unique index rider_documents_vehicle_type_uidx
  on public.rider_documents(rider_id, vehicle_id, document_type)
  where vehicle_id is not null;
create index rider_documents_rider_created_idx
  on public.rider_documents(rider_id, created_at);
alter table public.rider_documents enable row level security;
create policy rider_documents_owner_read on public.rider_documents
for select to authenticated using (rider_id = private.current_rider_id());
create policy rider_documents_owner_insert on public.rider_documents
for insert to authenticated with check (
  rider_id = private.current_rider_id()
  and split_part(file_path, '/', 1) = (select auth.uid())::text
);
create policy rider_documents_owner_update on public.rider_documents
for update to authenticated using (rider_id = private.current_rider_id())
with check (
  rider_id = private.current_rider_id()
  and split_part(file_path, '/', 1) = (select auth.uid())::text
);
create policy rider_documents_owner_delete on public.rider_documents
for delete to authenticated using (rider_id = private.current_rider_id());
create policy rider_documents_admin_all on public.rider_documents
for all to authenticated using (private.is_admin()) with check (private.is_admin());
revoke all on public.rider_documents from public, anon, authenticated;
grant select, insert, delete on public.rider_documents to authenticated;
grant update(document_number, file_path, expiry_date, updated_at)
  on public.rider_documents to authenticated;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'rider-documents', 'rider-documents', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
create policy rider_document_storage_read on storage.objects
for select to authenticated using (
  bucket_id = 'rider-documents'
  and (
    private.is_admin()
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
);
create policy rider_document_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'rider-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy rider_document_storage_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'rider-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
commit;
