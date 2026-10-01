begin;
-- The three mobile application roles live on the existing users attribute.
-- Admin authorization remains separate in admins/admin_roles.
do $$
begin
  if exists (
    select 1
    from private.auth_identities identity
    where num_nonnulls(
      identity.buyer_user_id,
      identity.farmer_user_id,
      identity.rider_id
    ) > 1
  ) then
    raise exception 'An authentication identity has multiple application roles';
  end if;
end;
$$;
update public.users app_user
set account_role = case
  when identity.buyer_user_id is not null then 'buyer'
  when identity.farmer_user_id is not null then 'farmer'
  when identity.rider_id is not null then 'rider'
  when app_user.rider_application is not null then 'rider'
  else app_user.account_role
end,
updated_at = now()
from private.auth_identities identity
where identity.user_id = app_user.user_id
  and app_user.account_role is null
  and (
    identity.buyer_user_id is not null
    or identity.farmer_user_id is not null
    or identity.rider_id is not null
    or app_user.rider_application is not null
  );
alter table public.users
  add constraint users_account_role_check
  check (account_role in ('buyer', 'farmer', 'rider'));
comment on column public.users.account_role is
  'Mobile application role: buyer, farmer, or rider. Admin access is separate.';
create index users_account_role_idx on public.users (account_role)
where account_role is not null;
commit;
