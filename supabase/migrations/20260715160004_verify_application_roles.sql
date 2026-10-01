begin;
do $$
declare role_constraint text;
begin
  select pg_get_constraintdef(constraint_record.oid)
  into role_constraint
  from pg_constraint constraint_record
  join pg_class table_record
    on table_record.oid = constraint_record.conrelid
  join pg_namespace schema_record
    on schema_record.oid = table_record.relnamespace
  where schema_record.nspname = 'public'
    and table_record.relname = 'users'
    and constraint_record.conname = 'users_account_role_check'
    and constraint_record.contype = 'c';

  if role_constraint is null
     or role_constraint not like '%buyer%'
     or role_constraint not like '%farmer%'
     or role_constraint not like '%rider%' then
    raise exception 'The three application roles are not database-enforced';
  end if;

  if exists (
    select 1 from public.users
    where account_role is not null
      and account_role not in ('buyer', 'farmer', 'rider')
  ) then
    raise exception 'An unsupported application role exists';
  end if;

  if exists (
    select 1 from private.auth_identities identity
    join public.users app_user on app_user.user_id = identity.user_id
    where (identity.buyer_user_id is not null
        and app_user.account_role is distinct from 'buyer')
       or (identity.farmer_user_id is not null
        and app_user.account_role is distinct from 'farmer')
       or (identity.rider_id is not null
        and app_user.account_role is distinct from 'rider')
  ) then
    raise exception 'An application role does not match its identity mapping';
  end if;
end;
$$;
rollback;
