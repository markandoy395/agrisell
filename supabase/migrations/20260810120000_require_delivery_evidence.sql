create or replace function private.require_delivery_evidence_before_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_status = 'completed'
     and old.delivery_status is distinct from 'completed'
     and not exists (
       select 1
       from public.delivery_proofs proof
       where proof.delivery_id = new.delivery_id
         and proof.proof_stage = 'delivery'
         and proof.proof_type = 'photo'
         and nullif(trim(proof.file_path), '') is not null
     ) then
    raise exception 'A delivery evidence photo is required before completion'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists deliveries_require_completion_evidence
on public.deliveries;
create trigger deliveries_require_completion_evidence
before update of delivery_status on public.deliveries
for each row
execute function private.require_delivery_evidence_before_completion();
revoke all on function private.require_delivery_evidence_before_completion()
from public, anon, authenticated;
drop function if exists public.save_current_rider_delivery_proof(
  bigint, text, text, text, text, double precision, double precision
);
create function public.save_current_rider_delivery_proof(
  p_delivery_id bigint,
  p_stage text,
  p_type text,
  p_file_path text,
  p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_captured_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_rider uuid := private.current_rider_id();
declare saved public.delivery_proofs%rowtype;
declare captured_at timestamptz := coalesce(p_captured_at, now());
begin
  if current_rider is null
     or not private.rider_owns_delivery(p_delivery_id) then
    raise exception 'Delivery is not assigned to this rider'
      using errcode = '42501';
  end if;
  if p_stage not in ('pickup', 'delivery')
     or p_type not in ('photo', 'signature')
     or btrim(p_file_path) = ''
     or split_part(p_file_path, '/', 1) <> (select auth.uid())::text
     or private.rider_storage_delivery_id(p_file_path) <> p_delivery_id
     or captured_at > now() + interval '1 minute' then
    raise exception 'Invalid delivery proof' using errcode = '22023';
  end if;
  insert into public.delivery_proofs(
    delivery_id, rider_id, proof_stage, proof_type, file_path,
    remarks, latitude, longitude, confirmed_at
  ) values (
    p_delivery_id, current_rider, p_stage, p_type, p_file_path,
    p_remarks, p_latitude, p_longitude, captured_at
  )
  on conflict (delivery_id, file_path) where file_path is not null
  do update set remarks = excluded.remarks,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_current_rider_delivery_proof(
  bigint, text, text, text, text, double precision, double precision,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.save_current_rider_delivery_proof(
  bigint, text, text, text, text, double precision, double precision,
  timestamptz
) to authenticated;
