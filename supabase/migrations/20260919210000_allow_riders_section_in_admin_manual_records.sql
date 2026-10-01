begin;

alter table public.admin_manual_records
  drop constraint if exists admin_manual_records_section_check;

alter table public.admin_manual_records
  add constraint admin_manual_records_section_check
  check (section in ('Logistics Companies', 'Riders'));

notify pgrst, 'reload schema';

commit;
