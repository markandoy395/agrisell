begin;
create table public.farm_followers (
  buyer_user_id bigint not null,
  farm_id bigint not null,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint farm_followers_pkey primary key (buyer_user_id, farm_id),
  constraint farm_followers_buyer_fk foreign key (buyer_user_id)
    references public.buyers (buyer_user_id) on delete cascade,
  constraint farm_followers_farm_fk foreign key (farm_id)
    references public.farms (farm_id) on delete cascade
);
alter table public.farm_followers enable row level security;
revoke all on public.farm_followers from anon, authenticated;
create or replace function private.refresh_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_buyer_id bigint;
  target_farm_id bigint;
begin
  if tg_op = 'INSERT' then
    target_buyer_id := new.buyer_user_id;
    target_farm_id := new.farm_id;
  else
    target_buyer_id := old.buyer_user_id;
    target_farm_id := old.farm_id;
  end if;

  update public.farms
  set follower_count = (
    select count(*) from public.farm_followers follower
    where follower.farm_id = target_farm_id
  )
  where farm_id = target_farm_id;

  update public.users app_user
  set following_count = (
    select count(*)
    from public.farm_followers follower
    where follower.buyer_user_id = target_buyer_id
  )
  from public.buyers buyer
  where buyer.buyer_user_id = target_buyer_id
    and app_user.user_id = buyer.user_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger farm_followers_refresh_counts
after insert or delete on public.farm_followers
for each row execute function private.refresh_follow_counts();
revoke all on function private.refresh_follow_counts() from public;
create or replace function public.marketplace_farmer_follow_state(
  p_farm_id bigint
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_buyer_id bigint := private.current_buyer_user_id();
  target_follower_count bigint;
begin
  if current_buyer_id is null then
    raise exception 'Buyer account required';
  end if;

  select farm.follower_count into target_follower_count
  from public.farms farm
  where farm.farm_id = p_farm_id;

  if not found then raise exception 'Farm not found'; end if;

  return jsonb_build_object(
    'farm_id', p_farm_id,
    'is_following', exists (
      select 1 from public.farm_followers follower
      where follower.buyer_user_id = current_buyer_id
        and follower.farm_id = p_farm_id
    ),
    'follower_count', target_follower_count
  );
end;
$$;
create or replace function public.set_marketplace_farmer_follow(
  p_farm_id bigint,
  p_following boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_buyer_id bigint := private.current_buyer_user_id();
begin
  if current_buyer_id is null then
    raise exception 'Buyer account required';
  end if;

  if not exists (
    select 1
    from public.farms farm
    join public.farmers farmer
      on farmer.farmer_user_id = farm.farmer_user_id
    where farm.farm_id = p_farm_id
      and lower(coalesce(farmer.verification_status, 'pending')) = 'verified'
      and lower(coalesce(farmer.account_status, 'active')) = 'active'
  ) then
    raise exception 'Farm is not available to follow';
  end if;

  if p_following then
    insert into public.farm_followers (buyer_user_id, farm_id)
    values (current_buyer_id, p_farm_id)
    on conflict (buyer_user_id, farm_id) do nothing;
  else
    delete from public.farm_followers
    where buyer_user_id = current_buyer_id and farm_id = p_farm_id;
  end if;

  return public.marketplace_farmer_follow_state(p_farm_id);
end;
$$;
create or replace function public.current_profile_follow_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_buyer_id bigint := private.current_buyer_user_id();
  current_farmer_id bigint := private.current_farmer_user_id();
  following_total bigint := 0;
  follower_total bigint := 0;
begin
  if current_buyer_id is not null then
    select coalesce(app_user.following_count, 0) into following_total
    from public.buyers buyer
    join public.users app_user on app_user.user_id = buyer.user_id
    where buyer.buyer_user_id = current_buyer_id;
  elsif current_farmer_id is not null then
    select coalesce(sum(farm.follower_count), 0) into follower_total
    from public.farms farm
    where farm.farmer_user_id = current_farmer_id;
  else
    raise exception 'Buyer or farmer account required';
  end if;

  return jsonb_build_object(
    'following_count', following_total,
    'follower_count', follower_total
  );
end;
$$;
create function public.marketplace_farmer_follow_states()
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
    raise exception 'Buyer account required';
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
revoke all on function public.marketplace_farmer_follow_state(bigint)
  from public;
revoke all on function public.set_marketplace_farmer_follow(bigint, boolean)
  from public;
revoke all on function public.current_profile_follow_stats() from public;
revoke all on function public.marketplace_farmer_follow_states() from public;
grant execute on function public.marketplace_farmer_follow_state(bigint)
  to authenticated;
grant execute on function public.set_marketplace_farmer_follow(bigint, boolean)
  to authenticated;
grant execute on function public.current_profile_follow_stats()
  to authenticated;
grant execute on function public.marketplace_farmer_follow_states()
  to authenticated;
commit;
