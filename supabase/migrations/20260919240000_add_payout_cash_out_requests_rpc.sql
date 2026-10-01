-- Migration: 20260919240000_add_payout_cash_out_requests_rpc.sql
-- Description: Add payout requests and user withdrawal methods for farmers and riders

begin;

-- 1. Create table for user withdrawal methods (GCash / Bank accounts)
create table if not exists public.user_withdrawal_methods (
  method_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_role text not null check (user_role in ('farmer', 'rider')),
  payout_method text not null check (payout_method in ('gcash', 'bank_transfer')),
  account_name text not null,
  account_number text not null,
  bank_name text,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_withdrawal_methods enable row level security;

create policy "Users can view own withdrawal methods"
  on public.user_withdrawal_methods
  for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert own withdrawal methods"
  on public.user_withdrawal_methods
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update own withdrawal methods"
  on public.user_withdrawal_methods
  for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete own withdrawal methods"
  on public.user_withdrawal_methods
  for delete
  using ((select auth.uid()) = user_id);

-- 2. Create table for payout / cash-out requests
create table if not exists public.payout_requests (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_role text not null check (user_role in ('farmer', 'rider')),
  amount numeric(12, 2) not null check (amount > 0),
  payout_method text not null check (payout_method in ('gcash', 'bank_transfer')),
  account_name text not null,
  account_number text not null,
  bank_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  notes text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payout_requests enable row level security;

create policy "Users can view own payout requests"
  on public.payout_requests
  for select
  using ((select auth.uid()) = user_id);

create policy "Users can create own payout requests"
  on public.payout_requests
  for insert
  with check ((select auth.uid()) = user_id);

-- 3. RPC: submit_payout_request
create or replace function public.submit_payout_request(
  p_amount numeric,
  p_payout_method text,
  p_account_name text,
  p_account_number text,
  p_bank_name text default null,
  p_notes text default null,
  p_user_role text default 'farmer'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_record public.payout_requests;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payout amount';
  end if;

  if p_payout_method not in ('gcash', 'bank_transfer') then
    raise exception 'Invalid payout method';
  end if;

  if coalesce(trim(p_account_name), '') = '' then
    raise exception 'Account name is required';
  end if;

  if coalesce(trim(p_account_number), '') = '' then
    raise exception 'Account number is required';
  end if;

  if p_payout_method = 'bank_transfer' and coalesce(trim(p_bank_name), '') = '' then
    raise exception 'Bank name is required for bank transfers';
  end if;

  insert into public.payout_requests (
    user_id,
    user_role,
    amount,
    payout_method,
    account_name,
    account_number,
    bank_name,
    status,
    notes
  ) values (
    v_user_id,
    p_user_role,
    p_amount,
    p_payout_method,
    trim(p_account_name),
    trim(p_account_number),
    trim(p_bank_name),
    'pending',
    trim(p_notes)
  )
  returning * into v_record;

  return jsonb_build_object(
    'requestId', v_record.request_id,
    'userId', v_record.user_id,
    'userRole', v_record.user_role,
    'amount', v_record.amount,
    'payoutMethod', v_record.payout_method,
    'accountName', v_record.account_name,
    'accountNumber', v_record.account_number,
    'bankName', v_record.bank_name,
    'status', v_record.status,
    'notes', v_record.notes,
    'createdAt', v_record.created_at
  );
end;
$$;

-- 4. RPC: current_user_payout_requests
create or replace function public.current_user_payout_requests(
  p_user_role text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'requestId', r.request_id,
    'userId', r.user_id,
    'userRole', r.user_role,
    'amount', r.amount,
    'payoutMethod', r.payout_method,
    'accountName', r.account_name,
    'accountNumber', r.account_number,
    'bankName', r.bank_name,
    'status', r.status,
    'notes', r.notes,
    'rejectionReason', r.rejection_reason,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  ) order by r.created_at desc), '[]'::jsonb)
  into v_result
  from public.payout_requests r
  where r.user_id = v_user_id
    and (p_user_role is null or r.user_role = p_user_role);

  return v_result;
end;
$$;

-- 5. RPC: current_user_withdrawal_methods
create or replace function public.current_user_withdrawal_methods(
  p_user_role text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'methodId', m.method_id,
    'userId', m.user_id,
    'userRole', m.user_role,
    'payoutMethod', m.payout_method,
    'accountName', m.account_name,
    'accountNumber', m.account_number,
    'bankName', m.bank_name,
    'isDefault', m.is_default,
    'createdAt', m.created_at,
    'updatedAt', m.updated_at
  ) order by m.is_default desc, m.created_at desc), '[]'::jsonb)
  into v_result
  from public.user_withdrawal_methods m
  where m.user_id = v_user_id
    and (p_user_role is null or m.user_role = p_user_role);

  return v_result;
end;
$$;

-- 6. RPC: save_user_withdrawal_method
create or replace function public.save_user_withdrawal_method(
  p_payout_method text,
  p_account_name text,
  p_account_number text,
  p_bank_name text default null,
  p_is_default boolean default true,
  p_user_role text default 'rider'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_record public.user_withdrawal_methods;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_payout_method not in ('gcash', 'bank_transfer') then
    raise exception 'Invalid payout method';
  end if;

  if coalesce(trim(p_account_name), '') = '' then
    raise exception 'Account name is required';
  end if;

  if coalesce(trim(p_account_number), '') = '' then
    raise exception 'Account number is required';
  end if;

  if p_is_default then
    update public.user_withdrawal_methods
    set is_default = false, updated_at = now()
    where user_id = v_user_id and user_role = p_user_role;
  end if;

  insert into public.user_withdrawal_methods (
    user_id,
    user_role,
    payout_method,
    account_name,
    account_number,
    bank_name,
    is_default
  ) values (
    v_user_id,
    p_user_role,
    p_payout_method,
    trim(p_account_name),
    trim(p_account_number),
    trim(p_bank_name),
    p_is_default
  )
  returning * into v_record;

  return jsonb_build_object(
    'methodId', v_record.method_id,
    'userId', v_record.user_id,
    'userRole', v_record.user_role,
    'payoutMethod', v_record.payout_method,
    'accountName', v_record.account_name,
    'accountNumber', v_record.account_number,
    'bankName', v_record.bank_name,
    'isDefault', v_record.is_default,
    'createdAt', v_record.created_at
  );
end;
$$;

-- 7. RPC: delete_user_withdrawal_method
create or replace function public.delete_user_withdrawal_method(
  p_method_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.user_withdrawal_methods
  where method_id = p_method_id and user_id = v_user_id;

  return found;
end;
$$;

-- Permissions
grant execute on function public.submit_payout_request(numeric, text, text, text, text, text, text) to authenticated;
grant execute on function public.current_user_payout_requests(text) to authenticated;
grant execute on function public.current_user_withdrawal_methods(text) to authenticated;
grant execute on function public.save_user_withdrawal_method(text, text, text, text, boolean, text) to authenticated;
grant execute on function public.delete_user_withdrawal_method(uuid) to authenticated;

commit;
