alter table public.admins
  add column if not exists session_version integer not null default 1
  check (session_version > 0);

create table if not exists public.admin_sessions (
  session_id uuid primary key,
  admin_email text not null,
  admin_user_id text not null,
  session_version integer not null check (session_version > 0),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > issued_at)
);

create index if not exists admin_sessions_email_active_idx
  on public.admin_sessions (admin_email, expires_at desc)
  where revoked_at is null;

alter table public.admin_sessions enable row level security;
revoke all on public.admin_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.admin_sessions to service_role;

create or replace function public.admin_increment_session_version(p_email text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version integer;
begin
  update public.admins as administrator
  set session_version = administrator.session_version + 1
  from public.users as application_user
  where application_user.user_id = administrator.user_id
    and lower(application_user.email) = lower(trim(p_email))
  returning administrator.session_version into v_version;

  if v_version is null then
    raise exception 'Administrator account not found.' using errcode = 'P0002';
  end if;
  return v_version;
end;
$$;

revoke all on function public.admin_increment_session_version(text)
  from public, anon, authenticated;
grant execute on function public.admin_increment_session_version(text) to service_role;

create or replace function public.admin_invalidate_sessions(p_email text)
returns table (session_version integer, revoked_sessions integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  session_version := public.admin_increment_session_version(v_email);
  update public.admin_sessions
  set revoked_at = clock_timestamp()
  where lower(admin_email) = v_email and revoked_at is null;
  get diagnostics revoked_sessions = row_count;
  return next;
end;
$$;

revoke all on function public.admin_invalidate_sessions(text)
  from public, anon, authenticated;
grant execute on function public.admin_invalidate_sessions(text) to service_role;
