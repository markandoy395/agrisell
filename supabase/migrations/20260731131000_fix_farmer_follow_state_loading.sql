begin;
create or replace function public.marketplace_farmer_follow_states()
returns table (
  farm_id bigint,
  follower_count bigint,
  is_following boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  current_buyer_id bigint := private.current_buyer_user_id();
begin
  if current_buyer_id is null then
    return;
  end if;

  return query
  select
    farm.farm_id::bigint,
    farm.follower_count::bigint,
    (follower.buyer_user_id is not null)::boolean
  from public.farms farm
  left join public.farm_followers follower
    on follower.farm_id = farm.farm_id
    and follower.buyer_user_id = current_buyer_id;
end;
$$;
revoke all on function public.marketplace_farmer_follow_states() from public;
grant execute on function public.marketplace_farmer_follow_states()
  to authenticated;
commit;
