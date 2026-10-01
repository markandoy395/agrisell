begin;

-- Add promo_code column to product_sales table for voucher and promo code campaigns.
alter table public.product_sales
  add column if not exists promo_code text;

create index if not exists product_sales_promo_code_idx
  on public.product_sales (lower(promo_code));

commit;
