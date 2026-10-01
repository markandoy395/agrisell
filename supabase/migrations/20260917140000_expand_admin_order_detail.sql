begin;

create or replace function public.admin_order_detail(p_order_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order', jsonb_build_object(
      'order_id', o.order_id, 'client_order_id', o.client_order_id,
      'buyer_name', o.buyer_name_snapshot, 'contact_number', o.contact_number,
      'order_status', o.order_status, 'payment_status', o.payment_status,
      'payment_method', o.payment_method, 'total_amount', o.total_amount,
      'delivery_address', o.delivery_address, 'order_date', o.order_date,
      'created_at', o.created_at, 'updated_at', o.updated_at,
      'cancellation_reason', o.cancellation_reason,
      'cancelled_by_role', o.cancelled_by_role, 'cancelled_at', o.cancelled_at
    ),
    'payment', coalesce((select to_jsonb(p) - 'order_id' from public.payments p where p.order_id=o.order_id order by p.payment_id desc limit 1), 'null'::jsonb),
    'delivery', coalesce((
      select jsonb_build_object(
        'delivery_id',d.delivery_id,'delivery_status',d.delivery_status,
        'estimated_delivery_time',d.estimated_delivery_time,'actual_delivery_time',d.actual_delivery_time,
        'pickup_location',d.pickup_location,'dropoff_location',d.dropoff_location,
        'pickup_contact',f.pickup_contact,'dropoff_contact',f.dropoff_contact,
        'rider_id',a.rider_id,'rider_name',r.full_name,'rider_phone',r.contact_number
      )
      from public.deliveries d
      left join private.order_delivery_fulfillments f using(delivery_id)
      left join private.rider_delivery_assignments a using(delivery_id)
      left join public.riders r using(rider_id)
      where d.order_id=o.order_id order by d.delivery_id desc limit 1
    ), 'null'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'commodity_id',c.commodity_id,'name',coalesce(c.commodity_name,'Item '||c.commodity_id),
        'quantity',ci.quantity,'total',o.total_amount
      ))
      from public.cart_items ci join public.commodities c using(commodity_id)
      where ci.cart_item_id=o.cart_item_id
    ), '[]'::jsonb),
    'case', jsonb_build_object(
      'cancellation_decision', cse.cancellation_decision,
      'cancellation_reviewed_by', cse.cancellation_reviewed_by,
      'cancellation_reviewed_at', cse.cancellation_reviewed_at,
      'cancellation_note', cse.cancellation_note,
      'exception_status', coalesce(cse.exception_status, case when lower(coalesce(o.order_status,'')) in ('failed','expired') or lower(coalesce(o.payment_status,'')) in ('refund_required','payment_review_required','rejected') then 'open' else 'resolved' end),
      'exception_resolution', cse.exception_resolution,
      'exception_resolved_by', cse.exception_resolved_by,
      'exception_resolved_at', cse.exception_resolved_at
    ),
    'history', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.event_id desc) from private.admin_order_events e where e.order_id=o.order_id), '[]'::jsonb)
  )
  from public.orders o
  left join private.admin_order_cases cse on cse.order_id=o.order_id
  where o.order_id=p_order_id
$$;

revoke all on function public.admin_order_detail(bigint) from public, anon, authenticated;
grant execute on function public.admin_order_detail(bigint) to service_role;
notify pgrst, 'reload schema';
commit;
