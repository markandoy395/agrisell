begin;
-- Return every product selected in every currently active Admin sale. The
-- previous lateral join selected only the first product from each promotion,
-- which made additional configured sale items invisible on the Buyer home.
create or replace function public.marketplace_promotion_banners()
returns table (
  sale_id bigint, sale_name text, discount_type text, discount_value numeric,
  commodity_name text, image_url text, ends_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select
    sale.sale_id,
    sale.name,
    sale.discount_type,
    sale.discount_value,
    commodity.commodity_name,
    commodity.image_url,
    sale.ends_at
  from public.product_sales as sale
  join public.product_sale_items as item on item.sale_id = sale.sale_id
  join public.commodities as commodity
    on commodity.commodity_id = item.commodity_id
  where sale.is_enabled
    and (sale.starts_at is null or sale.starts_at <= transaction_timestamp())
    and (sale.ends_at is null or sale.ends_at > transaction_timestamp())
    and (
      sale.target_user_group = 'all_users'
      or (
        sale.target_user_group = 'new_users_only'
        and private.is_new_buyer_sale_eligible(
          private.current_buyer_user_id()
        )
      )
    )
  order by sale.starts_at nulls first, sale.created_at desc,
    item.commodity_id
$$;
revoke all on function public.marketplace_promotion_banners()
  from public, anon, authenticated;
grant execute on function public.marketplace_promotion_banners()
  to anon, authenticated;
notify pgrst, 'reload schema';
commit;
