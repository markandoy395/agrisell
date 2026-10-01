begin;
-- A farmer may notify any registered Rider in the pickup municipality or
-- province. Availability, verification, vehicle, and assignment checks are
-- enforced only when the Rider accepts the delivery.
create or replace function private.rider_can_receive_assignment_request(
  target_delivery_id bigint,
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.riders as rider
    join private.auth_identities as identity
      on identity.rider_id = rider.rider_id
    left join public.logistics_companies as company
      on company.logistics_company_id = rider.logistics_company_id
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.delivery_id = target_delivery_id
    join private.seller_order_registry as registry
      on registry.seller_order_id = fulfillment.seller_order_id
    join public.farms as farm on farm.farm_id = registry.seller_farm_id
    where rider.rider_id = target_rider_id
      and identity.auth_user_id is not null
      and (
        lower(btrim(coalesce(rider.city_municipality, '')))
          = lower(btrim(farm.city_municipality))
        or strpos(
          lower(coalesce(rider.location_label, '')),
          lower(btrim(farm.city_municipality))
        ) > 0
        or strpos(
          lower(coalesce(array_to_string(company.service_areas, ','), '')),
          lower(btrim(farm.city_municipality))
        ) > 0
        or (
          nullif(btrim(farm.province), '') is not null
          and lower(btrim(coalesce(rider.province, '')))
            = lower(btrim(farm.province))
        )
        or (
          nullif(btrim(farm.province), '') is not null
          and strpos(
            lower(coalesce(rider.location_label, '')),
            lower(btrim(farm.province))
          ) > 0
        )
        or (
          nullif(btrim(farm.province), '') is not null
          and strpos(
            lower(coalesce(array_to_string(company.service_areas, ','), '')),
            lower(btrim(farm.province))
          ) > 0
        )
      )
  )
$$;
do $$
declare
  selection_definition text;
  request_definition text;
begin
  select pg_get_functiondef(
    'public.eligible_riders_for_current_farmer_order(text)'::regprocedure
  ) into selection_definition;
  selection_definition := replace(
    selection_definition,
    'private.rider_is_eligible_for_delivery(',
    'private.rider_can_receive_assignment_request('
  );
  selection_definition := replace(
    selection_definition,
    'private.rider_is_visible_for_delivery(',
    'private.rider_can_receive_assignment_request('
  );
  execute selection_definition;

  select pg_get_functiondef(
    'public.request_current_farmer_rider(text,uuid,timestamp with time zone,numeric)'::regprocedure
  ) into request_definition;
  request_definition := replace(
    request_definition,
    'private.rider_is_eligible_for_delivery(',
    'private.rider_can_receive_assignment_request('
  );
  request_definition := replace(
    request_definition,
    'private.rider_is_visible_for_delivery(',
    'private.rider_can_receive_assignment_request('
  );
  execute request_definition;
end
$$;
notify pgrst, 'reload schema';
commit;
