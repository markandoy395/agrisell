begin;
-- Supabase Auth already withholds an authenticated session until signup email
-- confirmation. Keep the same invariant at the application RPC boundary so a
-- future Auth configuration change cannot activate an unverified account.
create or replace function private.current_email_is_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = (select auth.uid())
      and auth_user.email_confirmed_at is not null
  )
$$;
create or replace function public.current_application_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when private.current_email_is_verified()
      then private.current_application_role()
    else ''
  end
$$;
create or replace function public.provision_current_user_role(
  requested_role text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.current_email_is_verified() then
    raise exception 'Email verification is required'
      using errcode = '42501';
  end if;
  return private.provision_current_user_role(requested_role);
end;
$$;
create or replace function public.create_current_rider_registration(
  rider_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.current_email_is_verified() then
    raise exception 'Email verification is required'
      using errcode = '42501';
  end if;
  return private.create_current_rider_registration(rider_payload);
end;
$$;
revoke all on function private.current_email_is_verified()
from public, anon;
grant execute on function private.current_email_is_verified()
to authenticated, service_role;
revoke all on function public.current_application_role()
from public, anon;
revoke all on function public.provision_current_user_role(text)
from public, anon;
revoke all on function public.create_current_rider_registration(jsonb)
from public, anon;
grant execute on function public.current_application_role()
to authenticated;
grant execute on function public.provision_current_user_role(text)
to authenticated;
grant execute on function public.create_current_rider_registration(jsonb)
to authenticated;
notify pgrst, 'reload schema';
commit;
