begin;

-- Completion is a distinct, explicit administrator command. Rider-generated
-- pickup stages remain protected by admin_save_delivery's transition rules.
create or replace function public.admin_complete_delivery(p_input jsonb, p_actor text) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  command_key text := p_input->>'command_id';
  reason text := nullif(btrim(p_input->>'reason'),'');
  target public.deliveries%rowtype;
  command private.admin_delivery_commands%rowtype;
  old_rider uuid;
begin
  if p_input->>'action' <> 'complete' then
    raise exception 'Unknown delivery action' using errcode='22023';
  end if;
  if nullif(btrim(command_key),'') is null or length(command_key)>100 or nullif(btrim(p_actor),'') is null then
    raise exception 'Command ID and actor are required' using errcode='22023';
  end if;
  if reason is null then
    raise exception 'A reason is required for admin completion' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(command_key,0));
  select * into command from private.admin_delivery_commands where command_id=command_key;
  if found then
    if command.payload<>p_input or command.actor<>p_actor then
      raise exception 'Command ID already used' using errcode='40001';
    end if;
    return jsonb_build_object('delivery_id',command.delivery_id);
  end if;

  select * into target
  from public.deliveries
  where delivery_id=(p_input->>'delivery_id')::bigint
  for update;
  if not found then
    raise exception 'Delivery not found' using errcode='22023';
  end if;
  if target.delivery_status is distinct from p_input->>'previous_status' then
    raise exception 'Delivery changed; refresh before saving' using errcode='40001';
  end if;
  if target.delivery_status in ('completed','delivered','cancelled','failed','returned') then
    raise exception 'This delivery is already closed' using errcode='22023';
  end if;

  select rider_id into old_rider
  from private.rider_delivery_assignments
  where delivery_id=target.delivery_id;

  update public.deliveries
  set delivery_status='completed', actual_delivery_time=coalesce(actual_delivery_time,now())
  where delivery_id=target.delivery_id;

  insert into private.delivery_status_events(delivery_id,idempotency_key,previous_status,new_status,remarks)
  values(target.delivery_id,'admin:'||command_key,target.delivery_status,'completed',
    'Admin '||p_actor||' · complete: '||reason);

  insert into private.admin_delivery_commands(command_id,actor,payload,delivery_id)
  values(command_key,p_actor,p_input,target.delivery_id);

  if old_rider is not null then
    update public.riders r
    set availability_status='online'
    where r.rider_id=old_rider
      and not exists (
        select 1
        from private.rider_delivery_assignments a
        join public.deliveries d using(delivery_id)
        where a.rider_id=r.rider_id
          and d.delivery_status not in ('completed','delivered','cancelled','failed','returned')
      );
  end if;

  return jsonb_build_object('delivery_id',target.delivery_id);
end;
$$;

revoke all on function public.admin_complete_delivery(jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_complete_delivery(jsonb,text) to service_role;

notify pgrst, 'reload schema';
commit;
