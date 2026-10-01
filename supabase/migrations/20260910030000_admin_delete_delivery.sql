begin;

create table if not exists private.admin_delivery_deletions (
  command_id text primary key,
  actor text not null,
  payload jsonb not null,
  deleted_delivery_id bigint not null,
  order_id bigint,
  deleted_at timestamptz not null default now()
);
alter table private.admin_delivery_deletions enable row level security;
revoke all on private.admin_delivery_deletions from public, anon, authenticated;

create or replace function public.admin_delete_delivery(p_input jsonb, p_actor text) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  command_key text := p_input->>'command_id';
  target public.deliveries%rowtype;
  prior private.admin_delivery_deletions%rowtype;
  old_rider uuid;
begin
  if p_input->>'action' <> 'delete' then raise exception 'Unknown delivery action' using errcode='22023'; end if;
  if nullif(btrim(command_key),'') is null or length(command_key)>100 or nullif(btrim(p_actor),'') is null then
    raise exception 'Command ID and actor are required' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(command_key,0));
  select * into prior from private.admin_delivery_deletions where command_id=command_key;
  if found then
    if prior.payload<>p_input or prior.actor<>p_actor then raise exception 'Command ID already used' using errcode='40001'; end if;
    return jsonb_build_object('delivery_id',prior.deleted_delivery_id,'deleted',true);
  end if;

  select * into target from public.deliveries where delivery_id=(p_input->>'delivery_id')::bigint for update;
  if not found then raise exception 'Delivery not found' using errcode='22023'; end if;
  if target.delivery_status is distinct from p_input->>'previous_status' then
    raise exception 'Delivery changed; refresh before deleting' using errcode='40001';
  end if;
  select rider_id into old_rider from private.rider_delivery_assignments where delivery_id=target.delivery_id;

  insert into private.admin_delivery_deletions(command_id,actor,payload,deleted_delivery_id,order_id)
  values(command_key,p_actor,p_input,target.delivery_id,target.order_id);
  delete from private.admin_delivery_commands where delivery_id=target.delivery_id;
  delete from private.rider_delivery_assignments where delivery_id=target.delivery_id;
  delete from private.delivery_status_events where delivery_id=target.delivery_id;
  delete from private.order_delivery_fulfillments where delivery_id=target.delivery_id;
  delete from public.deliveries where delivery_id=target.delivery_id;

  if old_rider is not null then
    update public.riders r set availability_status='online'
    where r.rider_id=old_rider and not exists (
      select 1 from private.rider_delivery_assignments a join public.deliveries d using(delivery_id)
      where a.rider_id=r.rider_id and d.delivery_status not in ('completed','delivered','cancelled','failed','returned')
    );
  end if;
  return jsonb_build_object('delivery_id',target.delivery_id,'deleted',true);
end;
$$;
revoke all on function public.admin_delete_delivery(jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_delete_delivery(jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
