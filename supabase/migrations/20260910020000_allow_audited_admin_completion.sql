begin;

-- Rider completion still requires a delivery photo. Only the service-role-only,
-- audited administrator completion RPC may intentionally bypass that trigger.
create or replace function private.require_delivery_evidence_before_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_status = 'completed'
     and old.delivery_status is distinct from 'completed'
     and coalesce(current_setting('app.admin_delivery_completion_override', true), '') <> 'on'
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
revoke all on function private.require_delivery_evidence_before_completion()
from public, anon, authenticated;

alter function public.admin_complete_delivery(jsonb,text)
rename to admin_complete_delivery_guarded;
revoke all on function public.admin_complete_delivery_guarded(jsonb,text)
from public, anon, authenticated, service_role;

create function public.admin_complete_delivery(p_input jsonb, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform set_config('app.admin_delivery_completion_override','on',true);
  return public.admin_complete_delivery_guarded(p_input,p_actor);
end;
$$;
revoke all on function public.admin_complete_delivery(jsonb,text)
from public, anon, authenticated;
grant execute on function public.admin_complete_delivery(jsonb,text) to service_role;

notify pgrst, 'reload schema';
commit;
