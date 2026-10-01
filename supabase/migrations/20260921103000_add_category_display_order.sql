begin;

-- Add display_order column to categories for admin category sequencing and marketplace discovery ranking.
alter table public.categories
  add column if not exists display_order integer not null default 0;

create index if not exists categories_display_order_idx
  on public.categories (display_order asc, category_name asc);

notify pgrst, 'reload schema';

commit;
