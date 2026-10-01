begin;

alter table public.payments
  add column if not exists amount_received numeric(14,2),
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_by text,
  add column if not exists verified_at timestamptz,
  add column if not exists settlement_status text not null default 'pending',
  add column if not exists settlement_reference text,
  add column if not exists settlement_approved_by text,
  add column if not exists settlement_approved_at timestamptz,
  add column if not exists settled_at timestamptz;

create table if not exists private.admin_payment_events (
  event_id bigint generated always as identity primary key,
  payment_id bigint not null references public.payments(payment_id) on delete cascade,
  command_id text not null unique,
  actor text not null,
  event_type text not null check (event_type in ('verified','verification_rejected','settlement_approved','settled','payout_approved','payout_paid','payout_failed','refund_approved','refund_completed','refund_failed','dispute_opened','dispute_resolved','retry_requested','failure_resolved')),
  reason text not null,
  reference text,
  amount numeric(14,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists private.admin_payment_cases (
  payment_id bigint primary key references public.payments(payment_id) on delete cascade,
  dispute_status text not null default 'none' check (dispute_status in ('none','open','resolved')),
  dispute_outcome text,
  dispute_reason text,
  failure_status text not null default 'none' check (failure_status in ('none','open','retry_requested','resolved')),
  failure_resolution text,
  updated_by text,
  updated_at timestamptz not null default now()
);
create table if not exists private.farmer_payouts (
  payout_id bigint generated always as identity primary key,
  payment_id bigint not null unique references public.payments(payment_id) on delete cascade,
  farmer_user_id bigint not null references public.farmers(farmer_user_id),
  amount numeric(14,2) not null check (amount > 0),
  payout_status text not null check (payout_status in ('approved','paid','failed')),
  payout_reference text,
  approved_by text,
  approved_at timestamptz,
  paid_at timestamptz,
  failure_reason text,
  updated_at timestamptz not null default now()
);
create table if not exists private.payment_refunds (
  refund_id bigint generated always as identity primary key,
  payment_id bigint not null references public.payments(payment_id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  refund_status text not null check (refund_status in ('approved','completed','failed')),
  refund_reference text,
  reason text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists payment_refunds_reference_unique on private.payment_refunds(refund_reference) where refund_reference is not null;

alter table private.admin_payment_events enable row level security;
alter table private.admin_payment_cases enable row level security;
alter table private.farmer_payouts enable row level security;
alter table private.payment_refunds enable row level security;
revoke all on private.admin_payment_events, private.admin_payment_cases, private.farmer_payouts, private.payment_refunds from public, anon, authenticated;

create or replace function public.admin_payment_detail(p_payment_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'payment', to_jsonb(p) || jsonb_build_object('version',(floor(extract(epoch from p.updated_at)*1000)::bigint)::text),
    'order', jsonb_build_object('order_id',o.order_id,'order_status',o.order_status,'payment_status',o.payment_status,'total_amount',o.total_amount,'payment_method',o.payment_method),
    'farmer', coalesce((select jsonb_build_object('farmer_user_id',f.farmer_user_id,'bank_details',f.bank_details) from public.cart_items ci join public.commodities c on c.commodity_id=ci.commodity_id join public.farms farm on farm.farm_id=c.farm_id join public.farmers f on f.farmer_user_id=farm.farmer_user_id where ci.cart_item_id=o.cart_item_id), 'null'::jsonb),
    'payout', coalesce((select to_jsonb(x) from private.farmer_payouts x where x.payment_id=p.payment_id), 'null'::jsonb),
    'refunds', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from private.payment_refunds r where r.payment_id=p.payment_id), '[]'::jsonb),
    'case', coalesce((select to_jsonb(c) from private.admin_payment_cases c where c.payment_id=p.payment_id), jsonb_build_object('dispute_status','none','failure_status',case when lower(coalesce(p.payment_status,'')) in ('failed','rejected','cancelled') then 'open' else 'none' end)),
    'history', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.event_id desc) from private.admin_payment_events e where e.payment_id=p.payment_id), '[]'::jsonb)
  ) from public.payments p join public.orders o on o.order_id=p.order_id where p.payment_id=p_payment_id
$$;

create or replace function public.admin_save_payment_action(p_input jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.payments%rowtype;
  action text := p_input->>'action'; decision text := p_input->>'decision';
  command_key text := nullif(btrim(p_input->>'command_id'),''); reason text := nullif(btrim(p_input->>'reason'),'');
  reference text := nullif(btrim(p_input->>'reference'),''); action_amount numeric := nullif(p_input->>'amount','')::numeric;
  farmer_id bigint; refundable numeric; event_name text; outcome text := nullif(btrim(p_input->>'outcome'),'');
  payout_state text; approved_refund_id bigint;
begin
  if command_key is null or reason is null or nullif(btrim(p_actor),'') is null then raise exception 'Command ID, actor, and reason are required' using errcode='22023'; end if;
  if exists(select 1 from private.admin_payment_events where command_id=command_key) then return public.admin_payment_detail((select payment_id from private.admin_payment_events where command_id=command_key)); end if;
  select * into target from public.payments where payment_id=(p_input->>'payment_id')::bigint for update;
  if not found then raise exception 'Payment not found' using errcode='22023'; end if;
  if (floor(extract(epoch from target.updated_at)*1000)::bigint)::text is distinct from p_input->>'previous_version' then raise exception 'Payment changed; refresh before saving' using errcode='40001'; end if;

  if action='verify' then
    if target.verification_status <> 'unverified' then raise exception 'Only an unverified payment can be verified' using errcode='22023'; end if;
    if decision='verified' and reference is null then raise exception 'A transaction reference is required' using errcode='22023'; end if;
    if decision not in ('verified','rejected') then raise exception 'Invalid verification decision' using errcode='22023'; end if;
    update public.payments set verification_status=decision,verified_by=p_actor,verified_at=now(),transaction_reference=coalesce(reference,transaction_reference),payment_status=case when decision='verified' then 'verified' else 'failed' end,settlement_status=case when decision='rejected' then 'held' else settlement_status end,updated_at=now() where payment_id=target.payment_id;
    update public.orders set payment_status=case when decision='verified' then 'verified' else 'payment_failed' end,updated_at=now() where order_id=target.order_id;
    if decision='rejected' then insert into private.admin_payment_cases(payment_id,failure_status,failure_resolution,updated_by) values(target.payment_id,'open',reason,p_actor) on conflict(payment_id) do update set failure_status='open',failure_resolution=excluded.failure_resolution,updated_by=p_actor,updated_at=now(); end if;
    event_name := case when decision='verified' then 'verified' else 'verification_rejected' end;
  elsif action='settlement' then
    if target.verification_status <> 'verified' then raise exception 'Only a verified payment is eligible for settlement' using errcode='22023'; end if;
    if decision not in ('approved','settled') or (decision='settled' and reference is null) then raise exception 'A valid settlement decision and reference are required' using errcode='22023'; end if;
    if decision='approved' and target.settlement_status not in ('pending','held') then raise exception 'Settlement cannot be approved from its current state' using errcode='22023'; end if;
    if decision='settled' and target.settlement_status <> 'approved' then raise exception 'Settlement must be approved before it is completed' using errcode='22023'; end if;
    update public.payments set settlement_status=decision,settlement_reference=coalesce(reference,settlement_reference),settlement_approved_by=case when decision='approved' then p_actor else settlement_approved_by end,settlement_approved_at=case when decision='approved' then now() else settlement_approved_at end,settled_at=case when decision='settled' then now() else settled_at end,collection_status=decision,updated_at=now() where payment_id=target.payment_id;
    event_name := case when decision='approved' then 'settlement_approved' else 'settled' end;
  elsif action='payout' then
    if target.verification_status <> 'verified' or target.settlement_status not in ('approved','settled') then raise exception 'Payment is not eligible for a farmer payout' using errcode='22023'; end if;
    select farm.farmer_user_id into farmer_id from public.orders o join public.cart_items ci on ci.cart_item_id=o.cart_item_id join public.commodities c on c.commodity_id=ci.commodity_id join public.farms farm on farm.farm_id=c.farm_id where o.order_id=target.order_id;
    if farmer_id is null then raise exception 'Farmer payout account not found' using errcode='22023'; end if;
    if action_amount is null or action_amount<=0 or action_amount>coalesce(target.amount_received,target.amount,0) then raise exception 'Payout amount exceeds the available net amount' using errcode='22023'; end if;
    if decision not in ('approved','paid','failed') or (decision='paid' and reference is null) then raise exception 'A valid payout decision and reference are required' using errcode='22023'; end if;
    select payout_status into payout_state from private.farmer_payouts where payment_id=target.payment_id;
    if decision='approved' and payout_state is not null then raise exception 'A payout decision already exists for this payment' using errcode='22023'; end if;
    if decision in ('paid','failed') and payout_state <> 'approved' then raise exception 'The farmer payout must be approved before completion' using errcode='22023'; end if;
    insert into private.farmer_payouts(payment_id,farmer_user_id,amount,payout_status,payout_reference,approved_by,approved_at,paid_at,failure_reason) values(target.payment_id,farmer_id,action_amount,decision,reference,p_actor,now(),case when decision='paid' then now() end,case when decision='failed' then reason end)
    on conflict(payment_id) do update set amount=excluded.amount,payout_status=excluded.payout_status,payout_reference=coalesce(excluded.payout_reference,private.farmer_payouts.payout_reference),paid_at=excluded.paid_at,failure_reason=excluded.failure_reason,updated_at=now();
    update public.payments set updated_at=now() where payment_id=target.payment_id; event_name := 'payout_'||decision;
  elsif action='refund' then
    if target.verification_status <> 'verified' then raise exception 'Only a verified payment can be refunded' using errcode='22023'; end if;
    select coalesce(target.amount,0)-coalesce(sum(r.amount) filter(where r.refund_status in ('approved','completed')),0) into refundable from private.payment_refunds r where r.payment_id=target.payment_id;
    if action_amount is null or action_amount<=0 then raise exception 'A positive refund amount is required' using errcode='22023'; end if;
    if decision not in ('approved','completed','failed') or (decision='completed' and reference is null) then raise exception 'A valid refund decision and reference are required' using errcode='22023'; end if;
    if decision='approved' then
      if action_amount>refundable then raise exception 'Refund amount exceeds the refundable balance' using errcode='22023'; end if;
      insert into private.payment_refunds(payment_id,amount,refund_status,refund_reference,reason,created_by) values(target.payment_id,action_amount,'approved',reference,reason,p_actor);
    else
      select r.refund_id into approved_refund_id from private.payment_refunds r where r.payment_id=target.payment_id and r.refund_status='approved' and r.amount=action_amount order by r.created_at limit 1 for update;
      if approved_refund_id is null then raise exception 'The refund must be approved before completion' using errcode='22023'; end if;
      update private.payment_refunds set refund_status=decision,refund_reference=reference,reason=btrim(p_input->>'reason'),completed_at=case when decision='completed' then now() end where refund_id=approved_refund_id;
    end if;
    if decision='completed' and action_amount>=(select coalesce(target.amount,0)-coalesce(sum(r.amount) filter(where r.refund_status='completed' and r.refund_id<>approved_refund_id),0) from private.payment_refunds r where r.payment_id=target.payment_id) then update public.payments set payment_status='refunded',refund_reference=reference,refunded_at=now(),updated_at=now() where payment_id=target.payment_id; update public.orders set payment_status='refunded',updated_at=now() where order_id=target.order_id; else update public.payments set updated_at=now() where payment_id=target.payment_id; end if;
    event_name := 'refund_'||decision;
  elsif action='dispute' then
    if decision not in ('open','resolved') then raise exception 'Invalid dispute action' using errcode='22023'; end if;
    insert into private.admin_payment_cases(payment_id,dispute_status,dispute_outcome,dispute_reason,updated_by) values(target.payment_id,decision,case when decision='resolved' then outcome end,reason,p_actor) on conflict(payment_id) do update set dispute_status=excluded.dispute_status,dispute_outcome=excluded.dispute_outcome,dispute_reason=excluded.dispute_reason,updated_by=p_actor,updated_at=now();
    update public.payments set settlement_status=case when decision='open' then 'held' when settlement_status='held' then 'pending' else settlement_status end,updated_at=now() where payment_id=target.payment_id; event_name := 'dispute_'||case when decision='open' then 'opened' else 'resolved' end;
  elsif action='failed' then
    if lower(coalesce(target.payment_status,'')) not in ('failed','rejected','cancelled') and target.verification_status <> 'rejected' then raise exception 'Only a failed payment can use failure handling' using errcode='22023'; end if;
    if decision not in ('retry_requested','resolved') then raise exception 'Invalid failed-payment action' using errcode='22023'; end if;
    insert into private.admin_payment_cases(payment_id,failure_status,failure_resolution,updated_by) values(target.payment_id,decision,reason,p_actor) on conflict(payment_id) do update set failure_status=excluded.failure_status,failure_resolution=excluded.failure_resolution,updated_by=p_actor,updated_at=now();
    update public.payments set updated_at=now() where payment_id=target.payment_id; event_name := case when decision='retry_requested' then 'retry_requested' else 'failure_resolved' end;
  else raise exception 'Unknown payment action' using errcode='22023'; end if;
  insert into private.admin_payment_events(payment_id,command_id,actor,event_type,reason,reference,amount,metadata) values(target.payment_id,command_key,p_actor,event_name,reason,reference,action_amount,jsonb_strip_nulls(jsonb_build_object('decision',decision,'outcome',outcome)));
  return public.admin_payment_detail(target.payment_id);
end
$$;

create or replace function public.admin_payment_report()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('payment_id',p.payment_id,'order_id',p.order_id,'payment_date',p.payment_date,'method',p.payment_method,'transaction_reference',p.transaction_reference,'gross_amount',p.amount,'net_amount',coalesce(p.amount_received,p.amount),'verification_status',p.verification_status,'settlement_status',p.settlement_status,'settlement_reference',p.settlement_reference,'payout_amount',x.amount,'payout_status',x.payout_status,'payout_reference',x.payout_reference,'refunded_amount',coalesce(r.refunded,0),'payment_status',p.payment_status) order by p.payment_id desc),'[]'::jsonb)
  from public.payments p left join private.farmer_payouts x on x.payment_id=p.payment_id left join (select payment_id,sum(amount) filter(where refund_status='completed') refunded from private.payment_refunds group by payment_id) r on r.payment_id=p.payment_id
$$;

revoke all on function public.admin_payment_detail(bigint), public.admin_save_payment_action(jsonb,text), public.admin_payment_report() from public,anon,authenticated;
grant execute on function public.admin_payment_detail(bigint), public.admin_save_payment_action(jsonb,text), public.admin_payment_report() to service_role;
commit;
