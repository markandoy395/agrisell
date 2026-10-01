begin;

-- 1. Add farm_id to product_sales so farmers can create and manage their own sales/discounts.
-- If farm_id is null, it indicates an admin platform-wide sale.
alter table public.product_sales
  add column if not exists farm_id bigint references public.farms(farm_id) on delete cascade;

create index if not exists product_sales_farm_id_idx
  on public.product_sales (farm_id);

-- 2. Buyer RPC: marketplace_active_deals
-- Exposes all active, enabled promotions and vouchers for buyers to browse in Deals & Promos and Voucher Wallet.
create or replace function public.marketplace_active_deals()
returns table (
  sale_id bigint,
  name text,
  discount_type text,
  discount_value numeric,
  target_user_group text,
  starts_at timestamptz,
  ends_at timestamptz,
  promo_code text,
  promote_on_home boolean,
  farm_id bigint,
  farm_name text,
  product_count bigint,
  featured_commodity_names text[],
  featured_image_urls text[]
) language sql stable security definer set search_path = '' as $$
  select
    sale.sale_id,
    sale.name,
    sale.discount_type,
    sale.discount_value,
    sale.target_user_group,
    sale.starts_at,
    sale.ends_at,
    sale.promo_code,
    sale.promote_on_home,
    sale.farm_id,
    farm.farm_name,
    coalesce(items.prod_count, 0) as product_count,
    coalesce(items.comm_names, array[]::text[]) as featured_commodity_names,
    coalesce(items.img_urls, array[]::text[]) as featured_image_urls
  from public.product_sales as sale
  left join public.farms as farm on farm.farm_id = sale.farm_id
  left join lateral (
    select
      count(*) as prod_count,
      array_agg(commodity.commodity_name order by item.commodity_id) as comm_names,
      array_agg(commodity.image_url order by item.commodity_id) filter (where commodity.image_url is not null) as img_urls
    from public.product_sale_items as item
    join public.commodities as commodity on commodity.commodity_id = item.commodity_id
    where item.sale_id = sale.sale_id
  ) as items on true
  where sale.is_enabled
    and (sale.starts_at is null or sale.starts_at <= transaction_timestamp())
    and (sale.ends_at is null or sale.ends_at > transaction_timestamp())
  order by
    case when sale.promo_code is not null and length(trim(sale.promo_code)) > 0 then 0 else 1 end,
    sale.starts_at nulls first,
    sale.created_at desc;
$$;

-- 3. Farmer RPC: farmer_create_sale
create or replace function public.farmer_create_sale(
  p_farm_id bigint,
  p_name text,
  p_discount_type text,
  p_discount_value numeric,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_promo_code text default null,
  p_commodity_ids bigint[] default '{}'
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_sale_id bigint;
  v_invalid_count int;
begin
  if not private.owns_farm(p_farm_id) and not private.is_admin() then
    raise exception 'You do not have permission to create sales for this farm.' using errcode = '42501';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Sale name cannot be empty.' using errcode = '22023';
  end if;

  if p_discount_type not in ('percentage', 'amount', 'sale_price') then
    raise exception 'Invalid discount type. Must be percentage, amount, or sale_price.' using errcode = '22023';
  end if;

  if p_discount_value is null or p_discount_value <= 0 then
    raise exception 'Discount value must be greater than zero.' using errcode = '22023';
  end if;

  if p_discount_type = 'percentage' and p_discount_value > 90 then
    raise exception 'Percentage discount cannot exceed 90%%.' using errcode = '22023';
  end if;

  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End date must be after start date.' using errcode = '22023';
  end if;

  -- Ensure all commodities belong to this farm
  if cardinality(p_commodity_ids) > 0 then
    select count(*) into v_invalid_count
    from unnest(p_commodity_ids) as cid
    where not exists (
      select 1 from public.commodities
      where commodity_id = cid and farm_id = p_farm_id
    );

    if v_invalid_count > 0 then
      raise exception 'One or more selected products do not belong to your farm.' using errcode = '22023';
    end if;
  end if;

  insert into public.product_sales (
    name,
    discount_type,
    discount_value,
    target_user_group,
    starts_at,
    ends_at,
    promo_code,
    farm_id,
    is_enabled,
    created_at,
    updated_at
  ) values (
    trim(p_name),
    p_discount_type,
    p_discount_value,
    'all_users',
    p_starts_at,
    p_ends_at,
    nullif(upper(trim(coalesce(p_promo_code, ''))), ''),
    p_farm_id,
    true,
    now(),
    now()
  ) returning sale_id into v_sale_id;

  if cardinality(p_commodity_ids) > 0 then
    insert into public.product_sale_items (sale_id, commodity_id)
    select v_sale_id, unnest(p_commodity_ids)
    on conflict do nothing;
  end if;

  return v_sale_id;
end;
$$;

-- 4. Farmer RPC: farmer_update_sale
create or replace function public.farmer_update_sale(
  p_sale_id bigint,
  p_farm_id bigint,
  p_name text,
  p_discount_type text,
  p_discount_value numeric,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_promo_code text default null,
  p_is_enabled boolean default true,
  p_commodity_ids bigint[] default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_invalid_count int;
begin
  if not private.owns_farm(p_farm_id) and not private.is_admin() then
    raise exception 'You do not have permission to modify sales for this farm.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.product_sales where sale_id = p_sale_id and farm_id = p_farm_id
  ) then
    raise exception 'Sale not found or not owned by your farm.' using errcode = '22023';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Sale name cannot be empty.' using errcode = '22023';
  end if;

  if p_discount_type not in ('percentage', 'amount', 'sale_price') then
    raise exception 'Invalid discount type.' using errcode = '22023';
  end if;

  if p_discount_value is null or p_discount_value <= 0 then
    raise exception 'Discount value must be greater than zero.' using errcode = '22023';
  end if;

  if p_discount_type = 'percentage' and p_discount_value > 90 then
    raise exception 'Percentage discount cannot exceed 90%%.' using errcode = '22023';
  end if;

  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End date must be after start date.' using errcode = '22023';
  end if;

  if cardinality(p_commodity_ids) > 0 then
    select count(*) into v_invalid_count
    from unnest(p_commodity_ids) as cid
    where not exists (
      select 1 from public.commodities
      where commodity_id = cid and farm_id = p_farm_id
    );

    if v_invalid_count > 0 then
      raise exception 'One or more selected products do not belong to your farm.' using errcode = '22023';
    end if;
  end if;

  update public.product_sales
  set
    name = trim(p_name),
    discount_type = p_discount_type,
    discount_value = p_discount_value,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    promo_code = nullif(upper(trim(coalesce(p_promo_code, ''))), ''),
    is_enabled = p_is_enabled,
    updated_at = now()
  where sale_id = p_sale_id and farm_id = p_farm_id;

  delete from public.product_sale_items where sale_id = p_sale_id;

  if cardinality(p_commodity_ids) > 0 then
    insert into public.product_sale_items (sale_id, commodity_id)
    select p_sale_id, unnest(p_commodity_ids)
    on conflict do nothing;
  end if;
end;
$$;

-- 5. Farmer RPC: farmer_delete_sale
create or replace function public.farmer_delete_sale(
  p_sale_id bigint,
  p_farm_id bigint
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_farm(p_farm_id) and not private.is_admin() then
    raise exception 'You do not have permission to delete this sale.' using errcode = '42501';
  end if;

  delete from public.product_sales
  where sale_id = p_sale_id and farm_id = p_farm_id;
end;
$$;

-- 6. Farmer RPC: farmer_load_sales
create or replace function public.farmer_load_sales(
  p_farm_id bigint
) returns table (
  sale_id bigint,
  farm_id bigint,
  name text,
  discount_type text,
  discount_value numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  promo_code text,
  is_enabled boolean,
  created_at timestamptz,
  commodities jsonb
) language sql stable security definer set search_path = '' as $$
  select
    sale.sale_id,
    sale.farm_id,
    sale.name,
    sale.discount_type,
    sale.discount_value,
    sale.starts_at,
    sale.ends_at,
    sale.promo_code,
    sale.is_enabled,
    sale.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'commodity_id', commodity.commodity_id,
            'commodity_name', commodity.commodity_name,
            'price_per_unit', commodity.price_per_unit,
            'image_url', commodity.image_url,
            'unit_type', commodity.unit_type
          )
        )
        from public.product_sale_items as item
        join public.commodities as commodity on commodity.commodity_id = item.commodity_id
        where item.sale_id = sale.sale_id
      ),
      '[]'::jsonb
    ) as commodities
  from public.product_sales as sale
  where sale.farm_id = p_farm_id
  order by sale.created_at desc;
$$;

-- Grant permissions
revoke all on function public.marketplace_active_deals(),
  public.farmer_create_sale(bigint, text, text, numeric, timestamptz, timestamptz, text, bigint[]),
  public.farmer_update_sale(bigint, bigint, text, text, numeric, timestamptz, timestamptz, text, boolean, bigint[]),
  public.farmer_delete_sale(bigint, bigint),
  public.farmer_load_sales(bigint)
  from public, anon;

grant execute on function public.marketplace_active_deals() to anon, authenticated;
grant execute on function public.farmer_create_sale(bigint, text, text, numeric, timestamptz, timestamptz, text, bigint[]),
  public.farmer_update_sale(bigint, bigint, text, text, numeric, timestamptz, timestamptz, text, boolean, bigint[]),
  public.farmer_delete_sale(bigint, bigint),
  public.farmer_load_sales(bigint)
  to authenticated;

notify pgrst, 'reload schema';
commit;
