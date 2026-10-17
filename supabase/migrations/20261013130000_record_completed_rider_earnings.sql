begin;

-- Use the accepted fee only. Product payments and COD collections are separate.
create or replace function private.record_completed_rider_earning(p_delivery_id bigint)
returns void language sql security definer set search_path = '' as $$
  insert into public.delivery_payments (
    delivery_id, delivery_fee, additional_fee, deduction_amount,
    final_earning, earning_status, payout_status
  )
  select delivery.delivery_id, fee.proposed_delivery_fee, 0, 0,
    fee.proposed_delivery_fee, 'calculated', 'unpaid'
  from public.deliveries as delivery
  join private.rider_delivery_assignments as assignment
    on assignment.delivery_id = delivery.delivery_id
  join lateral (
    select request.proposed_delivery_fee
    from public.rider_assignment_requests as request
    where request.delivery_id = delivery.delivery_id
      and request.rider_id = assignment.rider_id
      and request.status = 'accepted'
    order by request.requested_at desc, request.request_id desc limit 1
  ) as fee on true
  where delivery.delivery_id = p_delivery_id
    and delivery.delivery_status = 'completed'
    and fee.proposed_delivery_fee > 0
  on conflict (delivery_id) do nothing;
$$;
revoke all on function private.record_completed_rider_earning(bigint)
  from public, anon, authenticated;

create or replace function private.record_rider_earning_on_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.record_completed_rider_earning(new.delivery_id);
  return new;
end;
$$;
revoke all on function private.record_rider_earning_on_completion()
  from public, anon, authenticated;

drop trigger if exists record_rider_earning_on_completion on public.deliveries;
create trigger record_rider_earning_on_completion
after insert or update of delivery_status on public.deliveries
for each row when (new.delivery_status = 'completed')
execute function private.record_rider_earning_on_completion();

-- Preserve historical adjustments, approvals and paid records during repair.
do $$
declare delivery_record record;
begin
  for delivery_record in select delivery_id from public.deliveries
    where delivery_status = 'completed'
  loop
    perform private.record_completed_rider_earning(delivery_record.delivery_id);
  end loop;
end;
$$;

-- Keep the existing delivery visibility contract; add only the caller's payment.
create or replace function public.current_rider_deliveries(
  include_available boolean default true
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare current_rider uuid;
begin
  if auth.uid() is null
    or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false'
    or coalesce((auth.jwt()->>'exp')::numeric, 0) <= extract(epoch from now()) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform public.require_rate_limited_gateway();
  current_rider := private.current_rider_id();
  if current_rider is null then
    raise exception 'Rider account required' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(item.value || jsonb_build_object(
      'payment', (
        select to_jsonb(payment)
        from public.delivery_payments as payment
        join private.rider_delivery_assignments as assignment
          on assignment.delivery_id = payment.delivery_id
        where payment.delivery_id = (item.value->>'delivery_id')::bigint
          and assignment.rider_id = current_rider
      )
    ) order by item.ordinality), '[]'::jsonb)
    from jsonb_array_elements(private.current_rider_deliveries(include_available))
      with ordinality as item(value, ordinality)
  );
end;
$$;
revoke all on function public.current_rider_deliveries(boolean) from public, anon;
grant execute on function public.current_rider_deliveries(boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
