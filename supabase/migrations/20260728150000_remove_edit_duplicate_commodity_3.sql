begin;
-- Commodity 3 was accidentally inserted while editing commodity 2.
-- Both records belong to farm 2 and represent the same product, "mark".
-- Preserve any cart/order history by repointing cart items to the canonical ID.
alter table public.cart_items
  disable trigger cart_items_validate_ordering;
update public.cart_items as cart_item
set commodity_id = 2
where cart_item.commodity_id = 3
  and exists (
    select 1
    from public.commodities as keep_commodity
    join public.commodities as duplicate_commodity
      on duplicate_commodity.farm_id = keep_commodity.farm_id
     and lower(btrim(duplicate_commodity.commodity_name))
       = lower(btrim(keep_commodity.commodity_name))
    where keep_commodity.commodity_id = 2
      and duplicate_commodity.commodity_id = 3
      and keep_commodity.farm_id = 2
      and lower(btrim(keep_commodity.commodity_name)) = 'mark'
  );
alter table public.cart_items
  enable trigger cart_items_validate_ordering;
delete from public.commodities as duplicate_commodity
where duplicate_commodity.commodity_id = 3
  and duplicate_commodity.farm_id = 2
  and lower(btrim(duplicate_commodity.commodity_name)) = 'mark'
  and exists (
    select 1
    from public.commodities as keep_commodity
    where keep_commodity.commodity_id = 2
      and keep_commodity.farm_id = duplicate_commodity.farm_id
      and lower(btrim(keep_commodity.commodity_name))
        = lower(btrim(duplicate_commodity.commodity_name))
  );
commit;
