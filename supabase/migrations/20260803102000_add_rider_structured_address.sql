begin;
alter table public.riders
  add column if not exists address_line text,
  add column if not exists barangay text,
  add column if not exists city_municipality text,
  add column if not exists province text,
  add column if not exists postal_code text;
grant update (
  address_line,
  barangay,
  city_municipality,
  province,
  postal_code
) on public.riders to authenticated;
commit;
