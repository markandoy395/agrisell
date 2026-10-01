begin;
-- Start from riders so GPS visibility does not depend on a delivery assignment.
create or replace function public.admin_rider_tracking_rows(p_offset integer default 0, p_limit integer default 200)
returns jsonb language sql stable security definer set search_path = '' as $$
  with selected as (
    select r.rider_id,
      coalesce(nullif(r.full_name,''),nullif(concat_ws(' ',r.first_name,r.last_name),''),'Rider') as rider_name,
      r.contact_number as rider_phone, r.availability_status, r.employment_status,
      l.latitude, l.longitude, l.accuracy_meters, l.location_updated_at
    from public.riders r
    left join public.rider_locations l using (rider_id)
  ) select jsonb_build_object('total',(select count(*) from selected),'rows',coalesce((
    select jsonb_agg(to_jsonb(page) order by page.rider_id)
    from (select * from selected order by rider_id
      limit greatest(1,least(p_limit,500)) offset greatest(p_offset,0)) page
  ),'[]'::jsonb));
$$;
revoke all on function public.admin_rider_tracking_rows(integer,integer) from public, anon, authenticated;
grant execute on function public.admin_rider_tracking_rows(integer,integer) to service_role;
notify pgrst, 'reload schema';
commit;
