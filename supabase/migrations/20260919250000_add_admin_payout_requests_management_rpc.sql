-- Migration: 20260919250000_add_admin_payout_requests_management_rpc.sql
-- Description: Add admin RPCs to view, approve, reject, and disburse farmer/rider payout cash-out requests

begin;

-- Function: private.admin_get_payout_requests
create or replace function private.admin_get_payout_requests()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_summary jsonb;
  v_requests jsonb;
begin
  select jsonb_build_object(
    'total_requests', count(*),
    'pending_count', count(*) filter (where status = 'pending'),
    'approved_count', count(*) filter (where status = 'approved'),
    'paid_count', count(*) filter (where status = 'paid'),
    'rejected_count', count(*) filter (where status = 'rejected'),
    'total_pending_amount', coalesce(sum(amount) filter (where status in ('pending', 'approved')), 0),
    'total_paid_amount', coalesce(sum(amount) filter (where status = 'paid'), 0)
  )
  into v_summary
  from public.payout_requests;

  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id', r.request_id,
    'user_id', r.user_id,
    'user_role', r.user_role,
    'amount', r.amount,
    'payout_method', r.payout_method,
    'account_name', r.account_name,
    'account_number', r.account_number,
    'bank_name', r.bank_name,
    'status', r.status,
    'notes', r.notes,
    'rejection_reason', r.rejection_reason,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'requester_name', coalesce(
      fp.farm_name,
      nullif(trim(concat(u.raw_user_meta_data->>'first_name', ' ', u.raw_user_meta_data->>'last_name')), ''),
      u.email,
      'User'
    ),
    'requester_email', u.email,
    'requester_phone', coalesce(u.raw_user_meta_data->>'phone_number', u.raw_user_meta_data->>'phone')
  ) order by
    case when r.status = 'pending' then 0 when r.status = 'approved' then 1 else 2 end,
    r.created_at desc
  ), '[]'::jsonb)
  into v_requests
  from public.payout_requests r
  left join auth.users u on u.id = r.user_id
  left join public.farmers fp on fp.auth_id = r.user_id;

  return jsonb_build_object(
    'summary', v_summary,
    'requests', v_requests
  );
end;
$$;

create or replace function public.admin_get_payout_requests()
returns jsonb
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select private.admin_get_payout_requests();
$$;

-- Function: private.admin_update_payout_request
create or replace function private.admin_update_payout_request(
  p_input jsonb,
  p_actor text default 'Administrator'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_request_id uuid;
  v_action text;
  v_notes text;
  v_reason text;
  v_target public.payout_requests;
  v_new_status text;
begin
  v_request_id := (p_input->>'request_id')::uuid;
  v_action := lower(trim(coalesce(p_input->>'action', '')));
  v_notes := nullif(trim(coalesce(p_input->>'notes', '')), '');
  v_reason := nullif(trim(coalesce(p_input->>'rejection_reason', p_input->>'reason', '')), '');

  if v_request_id is null then
    raise exception 'Request ID is required';
  end if;

  if v_action not in ('approve', 'reject', 'mark_paid') then
    raise exception 'Action must be approve, reject, or mark_paid';
  end if;

  select * into v_target
  from public.payout_requests
  where request_id = v_request_id;

  if not found then
    raise exception 'Payout request not found';
  end if;

  if v_action = 'approve' then
    v_new_status := 'approved';
  elsif v_action = 'reject' then
    v_new_status := 'rejected';
    if v_reason is null then
      raise exception 'A rejection reason is required';
    end if;
  elsif v_action = 'mark_paid' then
    v_new_status := 'paid';
  end if;

  update public.payout_requests
  set status = v_new_status,
      notes = coalesce(v_notes, notes),
      rejection_reason = case when v_action = 'reject' then v_reason else rejection_reason end,
      updated_at = now()
  where request_id = v_request_id
  returning * into v_target;

  -- Attempt to insert notification if notifications table exists
  begin
    insert into public.notifications (
      user_id,
      title,
      description,
      notification_type,
      category,
      destination,
      metadata
    ) values (
      v_target.user_id,
      case
        when v_new_status = 'approved' then 'Payout Request Approved'
        when v_new_status = 'paid' then 'Payout Disbursed'
        else 'Payout Request Rejected'
      end,
      case
        when v_new_status = 'approved' then format('Your payout request of ₱%s via %s has been approved and is queued for disbursement.', v_target.amount, upper(v_target.payout_method))
        when v_new_status = 'paid' then format('Your payout request of ₱%s has been successfully disbursed to your %s account (%s).', v_target.amount, upper(v_target.payout_method), v_target.account_number)
        else format('Your payout request of ₱%s was rejected: %s', v_target.amount, coalesce(v_reason, 'Please contact support for more information.'))
      end,
      'payout_status_update',
      'payment',
      'profile',
      jsonb_build_object(
        'request_id', v_target.request_id,
        'status', v_new_status,
        'amount', v_target.amount,
        'actor', p_actor
      )
    );
  exception when others then
    -- Table or columns may vary, ignore notification failure
  end;

  return jsonb_build_object(
    'success', true,
    'request_id', v_target.request_id,
    'status', v_target.status,
    'notes', v_target.notes,
    'rejection_reason', v_target.rejection_reason,
    'updated_at', v_target.updated_at
  );
end;
$$;

create or replace function public.admin_update_payout_request(
  p_input jsonb,
  p_actor text default 'Administrator'
)
returns jsonb
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select private.admin_update_payout_request(p_input, p_actor);
$$;

revoke all on function private.admin_get_payout_requests() from public, anon;
grant execute on function private.admin_get_payout_requests() to authenticated;
revoke all on function public.admin_get_payout_requests() from public, anon;
grant execute on function public.admin_get_payout_requests() to authenticated;

revoke all on function private.admin_update_payout_request(jsonb, text) from public, anon;
grant execute on function private.admin_update_payout_request(jsonb, text) to authenticated;
revoke all on function public.admin_update_payout_request(jsonb, text) from public, anon;
grant execute on function public.admin_update_payout_request(jsonb, text) to authenticated;

commit;
