begin;
-- Persist Rider online/offline changes server-side so the mobile client does
-- not depend on table-update RLS details for its most important work-state
-- transition. The authenticated account is resolved through the private rider
-- identity mapping and the saved row is returned for client verification.
create or replace function public.update_current_rider_availability(
  p_availability_status text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_rider uuid := private.current_rider_id();
  normalized_status text := lower(btrim(coalesce(p_availability_status, '')));
  target public.riders%rowtype;
begin
  if current_rider is null then
    raise exception 'Only a Rider can update Rider availability'
      using errcode = '42501';
  end if;

  if normalized_status not in ('offline', 'online', 'busy') then
    raise exception 'Invalid Rider availability status'
      using errcode = '22023';
  end if;

  select * into target
  from public.riders
  where rider_id = current_rider
  for update;

  if not found then
    raise exception 'The authenticated Rider profile is unavailable'
      using errcode = '42501';
  end if;

  if normalized_status in ('online', 'busy')
     and coalesce(target.employment_status, '') <> 'active' then
    raise exception 'Only an active Rider can go online'
      using errcode = '22023';
  end if;

  update public.riders
  set availability_status = normalized_status
  where rider_id = current_rider
  returning * into target;

  return to_jsonb(target);
end;
$$;
revoke all on function public.update_current_rider_availability(text)
  from public, anon;
grant execute on function public.update_current_rider_availability(text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
