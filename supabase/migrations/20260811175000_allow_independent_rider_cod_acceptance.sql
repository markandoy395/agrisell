begin;
-- Rider registration allows logistics_company_id to be null and presents
-- that state as an independent Rider who can still receive assignments. Only
-- enforce a company's COD capability when the Rider is linked to a company.
do $migration$
declare
  definition text;
  patched_definition text;
  old_clause constant text := $old$    ) and not exists (
      select 1 from public.logistics_companies as company$old$;
  new_clause constant text := $new$    ) and rider_record.logistics_company_id is not null
    and not exists (
      select 1 from public.logistics_companies as company$new$;
begin
  select pg_get_functiondef(
    'private.validate_delivery_batch_acceptance(bigint,uuid)'::regprocedure
  ) into definition;

  if definition is null then
    raise exception 'Rider batch acceptance validator is missing';
  end if;
  if definition like
      '%and rider_record.logistics_company_id is not null%and not exists (%' then
    return;
  end if;

  patched_definition := replace(definition, old_clause, new_clause);
  if patched_definition = definition then
    raise exception 'Rider COD acceptance clause was not found';
  end if;
  execute patched_definition;
end
$migration$;
revoke all on function private.validate_delivery_batch_acceptance(bigint, uuid)
  from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
