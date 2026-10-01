begin;
-- A home carousel promotes campaigns, not every product row. Keep one banner
-- per active sale and summarize large product selections so a campaign with
-- hundreds of products does not create hundreds of carousel pages.
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
    case
      when products.product_count = 1 then products.featured_name
      else products.featured_name || ' + ' ||
        (products.product_count - 1)::text || ' more'
    end as commodity_name,
    products.featured_image_url,
    sale.ends_at
  from public.product_sales as sale
  join lateral (
    select
      count(*) as product_count,
      (array_agg(
        commodity.commodity_name order by item.commodity_id
      ))[1] as featured_name,
      (array_agg(
        commodity.image_url order by item.commodity_id
      ) filter (where commodity.image_url is not null))[1]
        as featured_image_url
    from public.product_sale_items as item
    join public.commodities as commodity
      on commodity.commodity_id = item.commodity_id
    where item.sale_id = sale.sale_id
  ) as products on products.product_count > 0
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
  order by sale.starts_at nulls first, sale.created_at desc
$$;
revoke all on function public.marketplace_promotion_banners()
  from public, anon, authenticated;
grant execute on function public.marketplace_promotion_banners()
  to anon, authenticated;
notify pgrst, 'reload schema';
commit;
