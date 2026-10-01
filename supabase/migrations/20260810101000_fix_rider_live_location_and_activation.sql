begin;
-- Rider availability describes whether the Rider is currently accepting work.
-- Employment status should not keep a completed Rider registration hidden.
alter table public.riders
  alter column employment_status set default 'active';
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'private.create_current_rider_registration(jsonb)'::regprocedure
  ) into function_definition;
  if function_definition is null then
    raise exception 'Rider registration function is missing';
  end if;

  function_definition := replace(
    function_definition,
    '0, ''inactive'', null,',
    '0, ''active'', null,'
  );
  if function_definition like '%0, ''inactive'', null,%'
      or function_definition not like '%0, ''active'', null,%' then
    raise exception 'Rider registration employment default was not repaired';
  end if;
  execute function_definition;
end
$$;
-- Preserve suspended Riders, but activate completed registrations that used
-- the former inactive default. They remain offline until they explicitly go
-- online from the Rider app.
update public.riders
set employment_status = 'active',
    availability_status = 'offline'
where employment_status = 'inactive';
notify pgrst, 'reload schema';
commit;
