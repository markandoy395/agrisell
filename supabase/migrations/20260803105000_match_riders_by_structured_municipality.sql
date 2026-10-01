begin;
-- Rider registration now stores the municipality in a dedicated field.  The
-- original selector only searched the legacy free-form location label, so a
-- rider registered in (for example) Esperanza could be excluded when that
-- label was empty or did not repeat the municipality.  Prefer the structured
-- field while retaining legacy labels and company service areas as fallbacks.
create or replace function private.rider_is_eligible_for_delivery(
  target_delivery_id bigint,
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.riders as rider
    join private.auth_identities as identity
      on identity.rider_id = rider.rider_id
    join public.users as app_user on app_user.user_id = identity.user_id
    left join public.logistics_companies as company
      on company.logistics_company_id = rider.logistics_company_id
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.delivery_id = target_delivery_id
    join private.seller_order_registry as registry
      on registry.seller_order_id = fulfillment.seller_order_id
    join public.farms as farm on farm.farm_id = registry.seller_farm_id
    where rider.rider_id = target_rider_id
      and app_user.account_status = 'active'
      and rider.employment_status = 'active'
      and rider.availability_status = 'online'
      and nullif(btrim(rider.first_name), '') is not null
      and nullif(btrim(rider.last_name), '') is not null
      and nullif(btrim(rider.contact_number), '') is not null
      and nullif(btrim(rider.vehicle_type), '') is not null
      and nullif(btrim(farm.city_municipality), '') is not null
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
      )
      and regexp_replace(lower(rider.vehicle_type), '[^a-z0-9]', '', 'g') =
          regexp_replace(
            lower(fulfillment.required_vehicle_type), '[^a-z0-9]', '', 'g'
          )
      and not exists (
        select 1
        from private.rider_delivery_assignments as assignment
        join public.deliveries as active_delivery
          on active_delivery.delivery_id = assignment.delivery_id
        where assignment.rider_id = rider.rider_id
          and active_delivery.delivery_status not in (
            'completed', 'delivered', 'cancelled', 'failed', 'returned'
          )
      )
  )
$$;
commit;
