begin;

alter table public.payout_requests
  add column if not exists payout_reference text,
  add column if not exists paid_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists paid_by text,
  add column if not exists rejected_by text,
  add column if not exists client_request_id uuid;
create unique index if not exists payout_requests_client_request_idx
  on public.payout_requests(user_id, client_request_id) where client_request_id is not null;
create unique index if not exists payout_requests_reference_idx
  on public.payout_requests(payout_method, payout_reference)
  where payout_reference is not null;

-- Reservations are an internal ledger, never writable through the client API.
create table private.rider_payout_allocations (
  request_id uuid not null references public.payout_requests(request_id),
  delivery_id bigint not null references public.delivery_payments(delivery_id),
  amount numeric(14,2) not null check (amount > 0),
  primary key (request_id, delivery_id)
);
create index rider_payout_allocations_delivery_idx
  on private.rider_payout_allocations(delivery_id);
alter table private.rider_payout_allocations enable row level security;
revoke all on private.rider_payout_allocations from public, anon, authenticated;
create policy application_table_requires_login on private.rider_payout_allocations
  as restrictive for all to public
  using (auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false') = 'false')
  with check (auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false') = 'false');
create policy application_default_owner_boundary on private.rider_payout_allocations
  as restrictive for all to authenticated using (false) with check (false);
revoke insert, update, delete on public.payout_requests from anon, authenticated;

create function private.require_payment_session()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null
    or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false'
    or coalesce((auth.jwt()->>'exp')::numeric, 0) <= extract(epoch from now()) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform public.require_rate_limited_gateway();
end;
$$;
revoke all on function private.require_payment_session() from public, anon, authenticated;

create function private.rider_payment_balances(p_rider_id uuid, p_auth_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with credits as (
    select p.delivery_id, p.final_earning, p.payout_status,
      coalesce(sum(a.amount) filter (where r.status in ('pending','approved','paid')),0) allocated,
      coalesce(sum(a.amount) filter (where r.status = 'paid'),0) paid
    from public.delivery_payments p
    join public.deliveries d using (delivery_id)
    join private.rider_delivery_assignments owner using (delivery_id)
    left join private.rider_payout_allocations a using (delivery_id)
    left join public.payout_requests r on r.request_id = a.request_id
    where owner.rider_id = p_rider_id and d.delivery_status = 'completed'
      and p.earning_status in ('calculated','approved')
    group by p.delivery_id, p.final_earning, p.payout_status
  ), legacy as (
    select coalesce(sum(r.amount),0) reserved
    from public.payout_requests r where r.user_id = p_auth_id
      and r.user_role = 'rider' and r.status in ('pending','approved')
      and not exists (select 1 from private.rider_payout_allocations a where a.request_id = r.request_id)
  )
  select jsonb_build_object(
    'reconciliation_required', exists(select 1 from public.payout_requests r
      where r.user_id = p_auth_id and r.user_role = 'rider' and r.status = 'paid'
        and not exists(select 1 from private.rider_payout_allocations a where a.request_id = r.request_id)),
    'available', case when exists(select 1 from public.payout_requests r
      where r.user_id = p_auth_id and r.user_role = 'rider' and r.status = 'paid'
        and not exists(select 1 from private.rider_payout_allocations a where a.request_id = r.request_id))
      then 0 else greatest(coalesce(sum(case when payout_status = 'paid' then 0
      else greatest(final_earning - allocated,0) end),0) - (select reserved from legacy),0) end,
    'reserved', (select coalesce(sum(amount),0) from public.payout_requests
      where user_id = p_auth_id and user_role = 'rider' and status in ('pending','approved')),
    'paid', coalesce(sum(case when payout_status = 'paid' then final_earning else paid end),0)
  ) from credits;
$$;
revoke all on function private.rider_payment_balances(uuid,uuid) from public, anon, authenticated;

create function public.current_rider_wallet()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare rider uuid;
begin
  perform private.require_payment_session();
  rider := private.current_rider_id();
  if rider is null then raise exception 'Rider account required' using errcode = '42501'; end if;
  return private.rider_payment_balances(rider, auth.uid());
end;
$$;
revoke all on function public.current_rider_wallet() from public, anon;
grant execute on function public.current_rider_wallet() to authenticated;

create function public.submit_rider_payout_request(
  p_method_id uuid, p_amount numeric, p_request_key uuid, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  rider uuid;
  method public.user_withdrawal_methods%rowtype;
  saved public.payout_requests%rowtype;
  credit record;
  remaining numeric;
  portion numeric;
begin
  perform private.require_payment_session();
  rider := private.current_rider_id();
  if rider is null then raise exception 'Rider account required' using errcode = '42501'; end if;
  if p_request_key is null or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <= 0 or p_amount <> round(p_amount,2) then
    raise exception 'A positive amount with at most two decimals and a request key are required';
  end if;
  if length(coalesce(p_notes,'')) > 1000 then raise exception 'Notes must be at most 1000 characters'; end if;
  -- Serialize all reservations and payouts for this authenticated account.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 151000));
  select * into method from public.user_withdrawal_methods
    where method_id = p_method_id and user_id = auth.uid() and user_role = 'rider';
  if not found then raise exception 'An owned rider withdrawal method is required' using errcode = '42501'; end if;
  if nullif(btrim(method.account_name),'') is null or nullif(btrim(method.account_number),'') is null
    or (method.payout_method = 'bank_transfer' and nullif(btrim(method.bank_name),'') is null) then
    raise exception 'A complete withdrawal destination is required';
  end if;
  select * into saved from public.payout_requests
    where user_id = auth.uid() and client_request_id = p_request_key;
  if found then
    if saved.amount <> p_amount or saved.payout_method <> method.payout_method
      or saved.account_number <> method.account_number or saved.account_name <> method.account_name
      or saved.bank_name is distinct from method.bank_name
      or saved.notes is distinct from nullif(btrim(p_notes),'') then
      raise exception 'Request key already used for a different payout' using errcode = '40001';
    end if;
    return jsonb_build_object('requestId',saved.request_id,'amount',saved.amount,
      'payoutMethod',saved.payout_method,'accountName',saved.account_name,
      'accountNumber',saved.account_number,'bankName',saved.bank_name,'status',saved.status,
      'createdAt',saved.created_at);
  end if;
  if p_amount > (private.rider_payment_balances(rider, auth.uid())->>'available')::numeric then
    raise exception 'Cash-out amount exceeds available earnings' using errcode = '22023';
  end if;
  insert into public.payout_requests(user_id,user_role,amount,payout_method,account_name,
    account_number,bank_name,client_request_id,notes)
  values(auth.uid(),'rider',p_amount,method.payout_method,method.account_name,
    method.account_number,method.bank_name,p_request_key,nullif(btrim(p_notes),'')) returning * into saved;
  remaining := p_amount;
  for credit in
    select p.* from public.delivery_payments p
    join public.deliveries d using(delivery_id)
    join private.rider_delivery_assignments owner using(delivery_id)
    where owner.rider_id = rider and d.delivery_status = 'completed'
      and p.earning_status in ('calculated','approved') and p.payout_status <> 'paid'
    order by p.delivery_id for update of p
  loop
    select greatest(credit.final_earning - coalesce(sum(a.amount),0),0) into portion
    from private.rider_payout_allocations a join public.payout_requests r using(request_id)
    where a.delivery_id = credit.delivery_id and r.status in ('pending','approved','paid');
    portion := least(portion, remaining);
    if portion > 0 then
      insert into private.rider_payout_allocations values(saved.request_id,credit.delivery_id,portion);
      remaining := remaining - portion;
    end if;
    exit when remaining = 0;
  end loop;
  if remaining <> 0 then raise exception 'Earnings changed; refresh and retry' using errcode = '40001'; end if;
  return jsonb_build_object('requestId',saved.request_id,'amount',saved.amount,
    'payoutMethod',saved.payout_method,'accountName',saved.account_name,
    'accountNumber',saved.account_number,'bankName',saved.bank_name,'status',saved.status,
    'createdAt',saved.created_at);
end;
$$;
revoke all on function public.submit_rider_payout_request(uuid,numeric,uuid,text) from public, anon;
grant execute on function public.submit_rider_payout_request(uuid,numeric,uuid,text) to authenticated;

-- Keep the farmer contract; riders must use the balance-backed endpoint.
revoke all on function private.api_impl_20260925_submit_payout_request(numeric,text,text,text,text,text,text)
  from public, anon, authenticated;
create or replace function public.submit_payout_request(
  p_amount numeric, p_payout_method text, p_account_name text, p_account_number text,
  p_bank_name text default null, p_notes text default null, p_user_role text default 'farmer'
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_payment_session();
  if p_user_role is distinct from 'farmer' or private.current_farmer_user_id() is null then
    raise exception 'Use the rider cash-out flow with a saved withdrawal method' using errcode = '42501';
  end if;
  return private.api_impl_20260925_submit_payout_request(p_amount,p_payout_method,
    p_account_name,p_account_number,p_bank_name,p_notes,p_user_role);
end;
$$;
revoke all on function public.submit_payout_request(numeric,text,text,text,text,text,text) from public, anon;
grant execute on function public.submit_payout_request(numeric,text,text,text,text,text,text) to authenticated;

-- Enforce financial transitions even when a trusted backend writes the table.
create function private.guard_payout_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare allocated numeric;
begin
  if old.status in ('paid','rejected') and new is distinct from old then
    raise exception 'A paid or rejected payout cannot be changed';
  end if;
  if (new.user_id,new.user_role,new.amount,new.payout_method,new.account_name,new.account_number,new.bank_name)
    is distinct from (old.user_id,old.user_role,old.amount,old.payout_method,old.account_name,old.account_number,old.bank_name) then
    raise exception 'Payout amount, owner and destination cannot be changed';
  end if;
  if new.status = old.status then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,151000));
  if not ((old.status = 'pending' and new.status in ('approved','rejected'))
    or (old.status = 'approved' and new.status in ('paid','rejected'))) then
    raise exception 'Invalid payout status transition';
  end if;
  if new.status = 'rejected' and nullif(btrim(new.rejection_reason),'') is null then
    raise exception 'Rejection reason required';
  end if;
  if new.user_role = 'rider' and new.status in ('approved','paid') then
    select coalesce(sum(amount),0) into allocated from private.rider_payout_allocations
      where request_id = new.request_id;
    if allocated <> new.amount then
      raise exception 'Legacy payout reconciliation required; reject and submit a balance-backed request';
    end if;
  end if;
  if new.status = 'paid' then
    if nullif(btrim(new.payout_reference),'') is null then raise exception 'Payment reference required'; end if;
    new.paid_at := now();
  end if;
  return new;
end;
$$;
create trigger guard_payout_transition before update on public.payout_requests
  for each row execute function private.guard_payout_transition();

create function private.sync_rider_payout_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_role = 'rider' and new.status = 'paid' then
    update public.delivery_payments p set payout_status = 'paid'
    where exists (select 1 from private.rider_payout_allocations a
      where a.request_id = new.request_id and a.delivery_id = p.delivery_id)
      and p.final_earning <= (select coalesce(sum(a.amount),0)
        from private.rider_payout_allocations a join public.payout_requests r using(request_id)
        where a.delivery_id = p.delivery_id and r.status = 'paid');
  end if;
  return new;
end;
$$;
create trigger sync_rider_payout_earnings after update of status on public.payout_requests
  for each row when (new.status = 'paid' and old.status <> 'paid')
  execute function private.sync_rider_payout_earnings();

create or replace function private.admin_update_payout_request(
  p_input jsonb, p_actor text default 'Administrator'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.payout_requests%rowtype; action text; reference text; result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted administrator backend required' using errcode = '42501';
  end if;
  if nullif(btrim(p_actor),'') is null then raise exception 'Administrator required'; end if;
  action := p_input->>'action';
  reference := nullif(btrim(p_input->>'payout_reference'),'');
  select * into target from public.payout_requests where request_id = (p_input->>'request_id')::uuid;
  if not found then raise exception 'Payout request not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target.user_id::text,151000));
  select * into target from public.payout_requests where request_id = target.request_id for update;
  if action not in ('approve','reject','mark_paid') or action is null then raise exception 'Invalid payout action'; end if;
  if action = 'mark_paid' and (reference is null or length(reference) > 200) then
    raise exception 'Payment reference of at most 200 characters required';
  end if;
  if target.status = 'paid' and action = 'mark_paid' and target.payout_reference = reference then
    return jsonb_build_object('success',true,'request_id',target.request_id,'status','paid');
  end if;
  if target.status = 'approved' and action = 'approve' then
    return jsonb_build_object('success',true,'request_id',target.request_id,'status','approved');
  end if;
  if target.status = 'rejected' and action = 'reject'
    and target.rejection_reason = nullif(btrim(p_input->>'rejection_reason'),'') then
    return jsonb_build_object('success',true,'request_id',target.request_id,'status','rejected');
  end if;
  update public.payout_requests set
    status = case action when 'approve' then 'approved' when 'reject' then 'rejected' else 'paid' end,
    payout_reference = case when action = 'mark_paid' then reference else payout_reference end,
    approved_by = case when action = 'approve' then p_actor else approved_by end,
    paid_by = case when action = 'mark_paid' then p_actor else paid_by end,
    rejected_by = case when action = 'reject' then p_actor else rejected_by end,
    rejection_reason = case when action = 'reject' then nullif(btrim(p_input->>'rejection_reason'),'') else rejection_reason end,
    notes = coalesce(nullif(btrim(p_input->>'notes'),''),notes), updated_at = now()
  where request_id = target.request_id returning to_jsonb(payout_requests.*) into result;
  insert into public.notifications(recipient_auth_user_id,title,description,
    notification_type,category,destination,metadata)
  values(target.user_id,'Cash-out request updated',
    format('Your PHP %s cash-out request is now %s.',target.amount,result->>'status'),
    'payout_status_update','payment','profile',jsonb_build_object(
      'event_id',target.request_id::text || ':' || (result->>'status'),
      'request_id',target.request_id,'status',result->>'status'));
  return result || jsonb_build_object('success',true);
end;
$$;
revoke all on function private.admin_update_payout_request(jsonb,text),
  public.admin_update_payout_request(jsonb,text) from public, anon, authenticated;
grant execute on function private.admin_update_payout_request(jsonb,text),
  public.admin_update_payout_request(jsonb,text) to service_role;

create or replace function private.admin_get_payout_requests()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted administrator backend required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'summary',(select jsonb_build_object('total_requests',count(*),
      'pending_count',count(*) filter(where status = 'pending'),
      'approved_count',count(*) filter(where status = 'approved'),
      'paid_count',count(*) filter(where status = 'paid'),
      'rejected_count',count(*) filter(where status = 'rejected'),
      'total_pending_amount',coalesce(sum(amount) filter(where status in ('pending','approved')),0),
      'total_paid_amount',coalesce(sum(amount) filter(where status = 'paid'),0)) from public.payout_requests),
    'requests',(select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object(
      'requester_name',coalesce(nullif(concat_ws(' ',u.raw_user_meta_data->>'first_name',
        u.raw_user_meta_data->>'last_name'),''),u.email,'User'),
      'requester_email',u.email,
      'requires_reconciliation',r.user_role = 'rider' and r.status in ('pending','approved','paid')
        and not exists(select 1 from private.rider_payout_allocations a where a.request_id = r.request_id),
      'deliveries',(select coalesce(jsonb_agg(jsonb_build_object(
        'delivery_id',a.delivery_id,'amount',a.amount)),'[]'::jsonb)
        from private.rider_payout_allocations a where a.request_id = r.request_id)
    ) order by r.created_at desc),'[]'::jsonb)
    from public.payout_requests r left join auth.users u on u.id = r.user_id));
end;
$$;
revoke all on function private.admin_get_payout_requests(),public.admin_get_payout_requests()
  from public,anon,authenticated;
grant execute on function private.admin_get_payout_requests(),public.admin_get_payout_requests()
  to service_role;

-- Expose transfer references in the existing owner-scoped history response.
create or replace function public.current_user_payout_requests(p_user_role text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_payment_session();
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'requestId',r.request_id,'amount',r.amount,'payoutMethod',r.payout_method,
    'accountName',r.account_name,'accountNumber',r.account_number,'bankName',r.bank_name,
    'status',r.status,'notes',r.notes,'rejectionReason',r.rejection_reason,
    'payoutReference',r.payout_reference,'paidAt',r.paid_at,'createdAt',r.created_at
  ) order by r.created_at desc),'[]'::jsonb) from public.payout_requests r
    where r.user_id = auth.uid() and (p_user_role is null or r.user_role = p_user_role));
end;
$$;
revoke all on function public.current_user_payout_requests(text) from public, anon;
grant execute on function public.current_user_payout_requests(text) to authenticated;

create function private.require_agreed_rider_fee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The existing admin assignment RPC omits the fee when replacing a request.
  -- Carry forward a stored delivery offer; never invent a rate for an empty job.
  if tg_op = 'INSERT' and new.proposed_delivery_fee is null
    and auth.role() = 'service_role' then
    select request.proposed_delivery_fee into new.proposed_delivery_fee
    from public.rider_assignment_requests request
    where request.delivery_id = new.delivery_id and request.proposed_delivery_fee > 0
    order by request.requested_at desc,request.request_id desc limit 1;
    if new.proposed_delivery_fee is null then
      select payment.delivery_fee into new.proposed_delivery_fee
      from public.delivery_payments payment where payment.delivery_id = new.delivery_id
        and payment.delivery_fee > 0;
    end if;
  end if;
  if new.status in ('pending','accepted') and (new.proposed_delivery_fee is null
    or new.proposed_delivery_fee::text = 'NaN' or new.proposed_delivery_fee <= 0) then
    raise exception 'A positive agreed delivery fee is required; set it in the farmer rider request before assignment';
  end if;
  if tg_op = 'UPDATE' and old.status = 'accepted'
    and new.proposed_delivery_fee is distinct from old.proposed_delivery_fee then
    raise exception 'An accepted delivery fee cannot be changed';
  end if;
  return new;
end;
$$;
create trigger require_agreed_rider_fee before insert or update of proposed_delivery_fee,status
  on public.rider_assignment_requests for each row execute function private.require_agreed_rider_fee();

create function private.guard_reserved_delivery_earning()
returns trigger language plpgsql security definer set search_path = '' as $$
declare allocated numeric; paid numeric;
begin
  select coalesce(sum(a.amount),0),coalesce(sum(a.amount) filter(where r.status = 'paid'),0)
  into allocated,paid from private.rider_payout_allocations a
  join public.payout_requests r using(request_id)
  where a.delivery_id = old.delivery_id and r.status in ('pending','approved','paid');
  if allocated > 0 then
    if new.final_earning < allocated or new.earning_status not in ('calculated','approved') then
      raise exception 'Earnings reserved for payout cannot be reduced or cancelled';
    end if;
    new.payout_status := case when paid >= new.final_earning then 'paid' else 'unpaid' end;
  end if;
  return new;
end;
$$;
create trigger guard_reserved_delivery_earning before update on public.delivery_payments
  for each row execute function private.guard_reserved_delivery_earning();
create function private.guard_allocated_delivery_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.delivery_status <> 'completed' and exists (
    select 1 from private.rider_payout_allocations a join public.payout_requests r using(request_id)
    where a.delivery_id = old.delivery_id and r.status in ('pending','approved','paid')) then
    raise exception 'A delivery reserved for payout cannot be reopened or cancelled';
  end if;
  return new;
end;
$$;
create trigger guard_allocated_delivery_status before update of delivery_status on public.deliveries
  for each row execute function private.guard_allocated_delivery_status();
create function private.guard_allocated_delivery_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.rider_payout_allocations a
    join public.payout_requests r using(request_id) where a.delivery_id = old.delivery_id
    and r.status in ('pending','approved','paid')) then
    if tg_op = 'DELETE' then raise exception 'A rider reserved for payout cannot be removed'; end if;
    if (new.delivery_id,new.rider_id) is distinct from (old.delivery_id,old.rider_id) then
      raise exception 'A rider reserved for payout cannot be reassigned';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_allocated_delivery_assignment before update or delete on private.rider_delivery_assignments
  for each row execute function private.guard_allocated_delivery_assignment();
revoke all on function private.guard_payout_transition(),private.sync_rider_payout_earnings(),
  private.require_agreed_rider_fee(),private.guard_reserved_delivery_earning(),
  private.guard_allocated_delivery_status(),private.guard_allocated_delivery_assignment()
  from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;
