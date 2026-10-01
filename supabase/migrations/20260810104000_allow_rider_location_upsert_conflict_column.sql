begin;
-- PostgREST upsert includes the conflict column in its UPDATE assignment.
-- RLS still restricts both the old and new rider_id to the current Rider.
grant update (
  rider_id, latitude, longitude, accuracy_meters, heading, speed_kph,
  location_updated_at
) on public.rider_locations to authenticated;
notify pgrst, 'reload schema';
commit;
