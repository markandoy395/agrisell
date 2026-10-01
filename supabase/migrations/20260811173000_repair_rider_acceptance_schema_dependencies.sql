begin;
-- PL/pgSQL record fields are resolved when the function runs, so a remote
-- database that has migration-history/schema drift can create the acceptance
-- validator successfully and then fail only when a Rider taps Accept.
alter table public.deliveries
  add column if not exists delivery_deadline timestamptz,
  add column if not exists cold_chain_available boolean;
notify pgrst, 'reload schema';
commit;
