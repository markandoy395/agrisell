begin;
-- Farmer order mutations currently arrive as a complete account snapshot.
-- A non-actionable historical order must not roll back a valid acceptance.
do $migration$
declare
  current_definition text;
  updated_definition text;
  blocked_message constant text :=
    'Farmers can only accept orders or mark them ready for pickup';
begin
  select pg_get_functiondef(
    'private.sync_current_farmer_orders(jsonb)'::regprocedure
  ) into current_definition;

  if current_definition is null
      or position(blocked_message in current_definition) = 0 then
    raise exception
      'The expected farmer order sync definition was not found';
  end if;

  updated_definition := regexp_replace(
    current_definition,
    'raise exception\s+''Farmers can only accept orders or mark them ready for pickup''\s+using errcode = ''42501'';',
    'continue;'
  );
  if updated_definition = current_definition then
    raise exception 'The farmer order sync fallback could not be replaced';
  end if;
  execute updated_definition;
end;
$migration$;
notify pgrst, 'reload schema';
commit;
