begin;
-- Keep the Rider directory broad, but allow a request only when the Rider
-- meets every delivery requirement except their current online/offline state.
-- A request is persisted and notifies an offline Rider; acceptance still
-- requires the Rider to be online.
do $$
declare
  selection_definition text;
  request_definition text;
begin
  select pg_get_functiondef(
    'public.eligible_riders_for_current_farmer_order(text)'::regprocedure
  ) into selection_definition;
  if selection_definition is null then
    raise exception 'Rider directory function is missing';
  end if;
  selection_definition := replace(
    selection_definition,
    'private.rider_is_eligible_for_delivery(',
    'private.rider_is_visible_for_delivery('
  );
  execute selection_definition;

  select pg_get_functiondef(
    'public.request_current_farmer_rider(text,uuid,timestamp with time zone,numeric)'::regprocedure
  ) into request_definition;
  if request_definition is null then
    raise exception 'Rider request function is missing';
  end if;
  request_definition := replace(
    request_definition,
    'private.rider_is_eligible_for_delivery(',
    'private.rider_is_visible_for_delivery('
  );
  request_definition := replace(
    request_definition,
    'The selected rider is no longer eligible or available',
    'The selected rider can no longer receive delivery requests'
  );
  execute request_definition;
end
$$;
notify pgrst, 'reload schema';
commit;
