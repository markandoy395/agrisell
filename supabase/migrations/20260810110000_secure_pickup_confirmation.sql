begin;
-- Pickup completion has stronger evidence requirements than an ordinary
-- status transition. Keep the generic endpoint from bypassing them.
create or replace function public.update_delivery_status(
  p_delivery_id bigint,
  p_previous_status text,
  p_new_status text,
  p_idempotency_key text,
  p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_new_status = 'picked_up' then
    raise exception 'Pickup must be completed through complete_pickup'
      using errcode = '22023';
  end if;
  return private.update_delivery_status(
    p_delivery_id, p_previous_status, p_new_status, p_idempotency_key,
    p_remarks, p_latitude, p_longitude
  );
end;
$$;
create or replace function public.complete_pickup(
  p_delivery_id bigint,
  p_previous_status text,
  p_idempotency_key text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_location_captured_at timestamptz,
  p_is_mocked boolean,
  p_is_approximate boolean,
  p_checklist jsonb,
  p_quantity integer,
  p_weight_kg double precision
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  required_check text;
begin
  if p_latitude is null or p_longitude is null
      or p_accuracy_meters is null or p_location_captured_at is null
      or p_latitude not between -90 and 90
      or p_longitude not between -180 and 180
      or p_accuracy_meters < 0
      or p_latitude::text in ('NaN', 'Infinity', '-Infinity')
      or p_longitude::text in ('NaN', 'Infinity', '-Infinity')
      or p_accuracy_meters::text in ('NaN', 'Infinity', '-Infinity')
      or coalesce(p_is_mocked, true)
      or coalesce(p_is_approximate, true)
      or p_location_captured_at < now() - interval '45 seconds'
      or p_location_captured_at > now() + interval '10 seconds' then
    raise exception 'Pickup location is unavailable. Please enable Precise Location and try again.'
      using errcode = '22023';
  end if;

  foreach required_check in array array[
    'correct_product', 'correct_quantity', 'correct_weight',
    'secure_packaging', 'not_visibly_damaged', 'matches_request',
    'fits_vehicle', 'handling_instructions_received'
  ] loop
    if coalesce((p_checklist ->> required_check)::boolean, false) is not true then
      raise exception 'Complete all 8 product condition checklist items.'
        using errcode = '22023';
    end if;
  end loop;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a quantity greater than 0.' using errcode = '22023';
  end if;
  if p_weight_kg is null or p_weight_kg < 0
      or p_weight_kg::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Enter a valid weight of 0 kg or greater.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.delivery_proofs proof
    where proof.delivery_id = p_delivery_id
      and proof.rider_id = private.current_rider_id()
      and proof.proof_stage = 'pickup'
      and proof.proof_type = 'photo'
      and proof.remarks = 'pickup_method:productPhoto'
      and nullif(btrim(proof.file_path), '') is not null
  ) then
    raise exception 'Upload the required product photo.' using errcode = '22023';
  end if;

  return private.update_delivery_status(
    p_delivery_id, p_previous_status, 'picked_up', p_idempotency_key,
    'Pickup validation completed.', p_latitude, p_longitude
  );
end;
$$;
revoke all on function private.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) from authenticated;
revoke all on function public.complete_pickup(
  bigint, text, text, double precision, double precision, double precision,
  timestamptz, boolean, boolean, jsonb, integer, double precision
) from public, anon;
grant execute on function public.complete_pickup(
  bigint, text, text, double precision, double precision, double precision,
  timestamptz, boolean, boolean, jsonb, integer, double precision
) to authenticated;
notify pgrst, 'reload schema';
commit;
