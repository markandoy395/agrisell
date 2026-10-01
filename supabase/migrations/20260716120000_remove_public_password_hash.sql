begin;
-- Supabase Auth owns password verification in the protected auth schema.
-- Keeping another password hash in an application-readable profile table
-- would duplicate sensitive credentials and risk exposing them through RLS.
alter table public.users drop column if exists password_hash;
comment on table public.users is
  'Application profile data only. Login credentials are managed by Supabase Auth.';
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'password_hash'
  ) then
    raise exception 'public.users.password_hash must not store authentication credentials';
  end if;
end $$;
commit;
