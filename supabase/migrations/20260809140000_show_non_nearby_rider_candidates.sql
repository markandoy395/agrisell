begin;
-- Keep the 15 km service-area rule for requesting a Rider, but do not use it
-- to hide otherwise visible Rider profiles from the Farmer directory.
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
    E'\\n\\s+and private\\.rider_registered_service_area_contains\\(\\s*target\\.pickup_lat::double precision,\\s*target\\.pickup_long::double precision,\\s*rider\\.rider_id\\s*\\)',
    '',
    'g'
  );
  function_definition := regexp_replace(
    function_definition,
    E'\\n\\s+and private\\.rider_registered_service_area_contains\\(\\s*target\\.dropoff_lat::double precision,\\s*target\\.dropoff_long::double precision,\\s*rider\\.rider_id\\s*\\)',
    '',
    'g'
  );
  function_definition := replace(
    function_definition,
    '''destination_supported'', true,',
    '''destination_supported'', candidate.destination_supported,'
  );
  function_definition := replace(
    function_definition,
    ') as is_requestable,',
    ') as is_requestable,
          private.rider_registered_service_area_contains(
            target.pickup_lat::double precision,
            target.pickup_long::double precision,
            rider.rider_id
          ) and private.rider_registered_service_area_contains(
            target.dropoff_lat::double precision,
            target.dropoff_long::double precision,
            rider.rider_id
          ) as destination_supported,'
  );

  if function_definition not like
      '%''destination_supported'', candidate.destination_supported%' then
    raise exception 'Farmer Rider directory route support was not exposed';
  end if;
  if function_definition like '%''destination_supported'', true%' then
    raise exception 'Farmer Rider directory still assumes every route is supported';
  end if;
  if (
    length(function_definition) - length(replace(
      function_definition,
      'private.rider_registered_service_area_contains',
      ''
    ))
  ) / length('private.rider_registered_service_area_contains') <> 2 then
    raise exception 'Farmer Rider directory still filters out non-nearby Riders';
  end if;

  execute function_definition;
end
$$;
grant execute on function public.eligible_riders_for_current_farmer_order(text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
