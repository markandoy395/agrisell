begin;
-- Product edits may change the category, but the RLS policy still requires
-- the selected category and existing farm to belong to the signed-in farmer.
-- farm_id remains immutable from the application update payload.
grant update (category_id) on public.commodities to authenticated;
commit;
