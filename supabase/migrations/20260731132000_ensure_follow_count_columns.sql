begin;
alter table public.farms
  add column if not exists follower_count bigint not null default 0;
alter table public.users
  add column if not exists following_count bigint not null default 0;
update public.farms farm
set follower_count = (
  select count(*)
  from public.farm_followers follower
  where follower.farm_id = farm.farm_id
);
update public.users app_user
set following_count = (
  select count(*)
  from public.farm_followers follower
  join public.buyers buyer
    on buyer.buyer_user_id = follower.buyer_user_id
  where buyer.user_id = app_user.user_id
);
notify pgrst, 'reload schema';
commit;
