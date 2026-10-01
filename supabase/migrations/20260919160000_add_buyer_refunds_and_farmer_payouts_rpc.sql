begin;

create or replace function private.current_account_refund_snapshots()
returns jsonb language sql stable security definer set search_path = '' as $$
  with refunds as (
    select
      o.order_id,
      o.client_order_id,
      coalesce(r.refund_id, 0) as refund_id,
      coalesce(r.amount, p.amount, o.total_amount) as amount,
      coalesce(r.refund_status, case when o.payment_status = 'refunded' then 'completed' when o.payment_status = 'refund_required' then 'approved' else 'pending' end) as refund_status,
      coalesce(r.refund_reference, p.refund_reference, '') as refund_reference,
      coalesce(r.reason, o.cancellation_reason, 'Order refund') as reason,
      coalesce(r.created_at, o.cancelled_at, o.created_at) as created_at,
      coalesce(r.completed_at, p.refunded_at) as completed_at,
      p.payment_method,
      coalesce(p.transaction_reference, '') as transaction_reference
    from public.orders o
    left join public.payments p on p.order_id = o.order_id
    left join private.payment_refunds r on r.payment_id = p.payment_id
    where private.owns_order(o.order_id)
      and (
        o.payment_status in ('refund_required', 'refunded')
        or o.order_status in ('cancelled', 'expired')
        or r.refund_id is not null
      )
    order by coalesce(r.completed_at, r.created_at, o.updated_at) desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', order_id::text,
    'clientOrderId', client_order_id,
    'refundId', refund_id,
    'amount', amount,
    'refundStatus', refund_status,
    'refundReference', refund_reference,
    'reason', reason,
    'createdAt', created_at,
    'completedAt', completed_at,
    'paymentMethod', payment_method,
    'transactionReference', transaction_reference
  )), '[]'::jsonb) from refunds;
$$;

create or replace function public.current_account_refund_snapshots()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.current_account_refund_snapshots();
$$;

create or replace function private.current_farmer_payouts()
returns jsonb language sql stable security definer set search_path = '' as $$
  with payouts as (
    select
      x.payout_id,
      x.payment_id,
      o.order_id,
      o.client_order_id,
      x.amount,
      x.payout_status,
      coalesce(x.payout_reference, '') as payout_reference,
      x.approved_at,
      x.paid_at,
      coalesce(x.failure_reason, '') as failure_reason,
      coalesce(o.total_amount, p.amount) as order_total,
      coalesce(o.buyer_name_snapshot, 'Marketplace Buyer') as buyer_name,
      x.updated_at as created_at
    from private.farmer_payouts x
    join public.payments p on p.payment_id = x.payment_id
    join public.orders o on o.order_id = p.order_id
    where x.farmer_user_id = private.current_farmer_user_id()
    order by coalesce(x.paid_at, x.approved_at, x.updated_at) desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'payoutId', payout_id,
    'paymentId', payment_id,
    'orderId', order_id::text,
    'clientOrderId', client_order_id,
    'amount', amount,
    'payoutStatus', payout_status,
    'payoutReference', payout_reference,
    'approvedAt', approved_at,
    'paidAt', paid_at,
    'failureReason', failure_reason,
    'orderTotal', order_total,
    'buyerName', buyer_name,
    'createdAt', created_at
  )), '[]'::jsonb) from payouts;
$$;

create or replace function public.current_farmer_payouts()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.current_farmer_payouts();
$$;

revoke all on function private.current_account_refund_snapshots() from public, anon;
grant execute on function private.current_account_refund_snapshots() to authenticated;
revoke all on function public.current_account_refund_snapshots() from public, anon;
grant execute on function public.current_account_refund_snapshots() to authenticated;

revoke all on function private.current_farmer_payouts() from public, anon;
grant execute on function private.current_farmer_payouts() to authenticated;
revoke all on function public.current_farmer_payouts() from public, anon;
grant execute on function public.current_farmer_payouts() to authenticated;

commit;
