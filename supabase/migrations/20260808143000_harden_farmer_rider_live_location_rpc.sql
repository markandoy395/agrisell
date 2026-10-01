begin;
-- Repair already-applied environments where the Farmer Rider RPC still joins
-- public.rider_locations directly. The helper keeps live GPS optional at
-- function-create time and prevents raw relation errors from reaching Farmers.
create or replace function private.rider_current_location_updated_at(
  target_rider_id uuid
) returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  updated_at timestamptz;
begin
  if pg_catalog.to_regclass('public.rider_locations') is null then
    return null;
  end if;

  select current_location.location_updated_at
  into updated_at
  from public.rider_locations as current_location
  where current_location.rider_id = target_rider_id;

  return updated_at;
end
$$;
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.eligible_riders_for_current_farmer_order(text)'::regprocedure
  ) into function_definition;
  if function_definition is null then
    raise exception 'Farmer Rider directory function is missing';
  end if;

  function_definition := regexp_replace(
    function_definition,
    E'\\n\\s*current_location\\.location_updated_at as current_location_updated_at,',
    E'\n          private.rider_current_location_updated_at(rider.rider_id)\n            as current_location_updated_at,',
    'g'
  );
  function_definition := regexp_replace(
    function_definition,
    E'\\n\\s*left join public\\.rider_locations as current_location\\s+on current_location\\.rider_id = rider\\.rider_id',
    '',
    'g'
  );

  if function_definition ilike '%left join public.rider_locations%' then
    raise exception 'Farmer Rider directory still joins public.rider_locations';
  end if;

  execute function_definition;
end
$$;
revoke all on function private.rider_current_location_updated_at(uuid)
  from public, anon, authenticated;
grant execute on function public.eligible_riders_for_current_farmer_order(text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
