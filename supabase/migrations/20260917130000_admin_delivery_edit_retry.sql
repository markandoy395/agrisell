begin;

create or replace function public.admin_update_delivery(p_input jsonb, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  command_key text := p_input->>'command_id';
  target public.deliveries%rowtype;
  prior private.admin_delivery_commands%rowtype;
  pickup text := btrim(p_input->>'pickup_location');
  destination text := btrim(p_input->>'dropoff_location');
  schedule timestamptz;
  reason text := nullif(btrim(p_input->>'reason'), '');
begin
  if p_input->>'action' <> 'update' then raise exception 'Unknown delivery action' using errcode='22023'; end if;
  if nullif(btrim(command_key),'') is null or length(command_key)>100 or nullif(btrim(p_actor),'') is null then
    raise exception 'Command ID and actor are required' using errcode='22023';
  end if;
  if pickup is null or length(pickup)>500 then raise exception 'Pickup location is required and must be at most 500 characters' using errcode='22023'; end if;
  if destination is null or length(destination)>500 then raise exception 'Destination is required and must be at most 500 characters' using errcode='22023'; end if;
  begin schedule := (p_input->>'scheduled_at')::timestamptz;
  exception when others then raise exception 'Schedule is invalid' using errcode='22023'; end;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(command_key,0));
  select * into prior from private.admin_delivery_commands where command_id=command_key;
  if found then
    if prior.payload<>p_input or prior.actor<>p_actor then raise exception 'Command ID already used' using errcode='40001'; end if;
    return jsonb_build_object('delivery_id',prior.delivery_id);
  end if;
  select * into target from public.deliveries where delivery_id=(p_input->>'delivery_id')::bigint for update;
  if not found then raise exception 'Delivery not found' using errcode='22023'; end if;
  if target.delivery_status is distinct from p_input->>'previous_status' then raise exception 'Delivery changed; refresh before saving' using errcode='40001'; end if;
  if target.delivery_status in ('completed','delivered','cancelled','canceled','expired','failed','returned') then
    raise exception 'This delivery is already closed and cannot be edited' using errcode='22023';
  end if;

  update public.deliveries set pickup_location=pickup, dropoff_location=destination,
    estimated_delivery_time=schedule where delivery_id=target.delivery_id;
  insert into private.delivery_status_events(delivery_id,idempotency_key,previous_status,new_status,remarks)
    values(target.delivery_id,'admin:'||command_key,target.delivery_status,target.delivery_status,
      'Admin '||p_actor||' · update: '||coalesce(reason,'Delivery details updated'));
  insert into private.admin_delivery_commands(command_id,actor,payload,delivery_id)
    values(command_key,p_actor,p_input,target.delivery_id);
  return jsonb_build_object('delivery_id',target.delivery_id,'updated',true);
end;
$$;

create or replace function public.admin_reopen_delivery(p_input jsonb, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  command_key text := p_input->>'command_id';
  target public.deliveries%rowtype;
  prior private.admin_delivery_commands%rowtype;
  old_rider uuid;
  reason text := nullif(btrim(p_input->>'reason'), '');
begin
  if p_input->>'action' <> 'reopen' then raise exception 'Unknown delivery action' using errcode='22023'; end if;
  if nullif(btrim(command_key),'') is null or length(command_key)>100 or nullif(btrim(p_actor),'') is null or reason is null then
    raise exception 'Command ID, actor, and retry reason are required' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(command_key,0));
  select * into prior from private.admin_delivery_commands where command_id=command_key;
  if found then
    if prior.payload<>p_input or prior.actor<>p_actor then raise exception 'Command ID already used' using errcode='40001'; end if;
    return jsonb_build_object('delivery_id',prior.delivery_id);
  end if;
  select * into target from public.deliveries where delivery_id=(p_input->>'delivery_id')::bigint for update;
  if not found then raise exception 'Delivery not found' using errcode='22023'; end if;
  if target.delivery_status is distinct from p_input->>'previous_status' then raise exception 'Delivery changed; refresh before retrying' using errcode='40001'; end if;
  if target.delivery_status not in ('failed','cancelled','canceled','expired','returned') then
    raise exception 'Only failed, cancelled, expired, or returned deliveries can be reopened' using errcode='22023';
  end if;

  select rider_id into old_rider from private.rider_delivery_assignments where delivery_id=target.delivery_id;
  update public.rider_assignment_requests set status='cancelled',responded_at=now(),updated_at=now(),failure_reason=reason
    where delivery_id=target.delivery_id and status in ('pending','accepted');
  delete from private.rider_delivery_assignments where delivery_id=target.delivery_id;
  update public.deliveries set delivery_status='available',actual_delivery_time=null where delivery_id=target.delivery_id;
  if old_rider is not null then
    update public.riders r set availability_status='online' where r.rider_id=old_rider and not exists (
      select 1 from private.rider_delivery_assignments a join public.deliveries d using(delivery_id)
      where a.rider_id=r.rider_id and d.delivery_status not in ('completed','delivered','cancelled','canceled','expired','failed','returned')
    );
  end if;
  insert into private.delivery_status_events(delivery_id,idempotency_key,previous_status,new_status,remarks)
    values(target.delivery_id,'admin:'||command_key,target.delivery_status,'available','Admin '||p_actor||' · reopen: '||reason);
  insert into private.admin_delivery_commands(command_id,actor,payload,delivery_id)
    values(command_key,p_actor,p_input,target.delivery_id);
  return jsonb_build_object('delivery_id',target.delivery_id,'reopened',true);
end;
$$;

revoke all on function public.admin_update_delivery(jsonb,text), public.admin_reopen_delivery(jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_update_delivery(jsonb,text), public.admin_reopen_delivery(jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
