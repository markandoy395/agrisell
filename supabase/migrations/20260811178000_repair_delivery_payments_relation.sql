begin;
-- Some deployed databases retained the singular legacy relation even though
-- their migration history records the plural-name migration as applied.
-- Normalize that drift without replacing or discarding existing payment data.
do $repair$
begin
  if to_regclass('public.delivery_payments') is null then
    if to_regclass('public.delivery_payment') is not null then
      execute 'alter table public.delivery_payment rename to delivery_payments';
    else
      create table public.delivery_payments (
        delivery_payment_id uuid primary key
          default extensions.gen_random_uuid(),
        delivery_id bigint not null unique
          references public.deliveries (delivery_id) on delete cascade,
        delivery_fee numeric not null check (delivery_fee >= 0),
        additional_fee numeric not null default 0 check (additional_fee >= 0),
        deduction_amount numeric not null default 0
          check (deduction_amount >= 0),
        final_earning numeric not null check (final_earning >= 0),
        earning_status text not null default 'pending' check (
          earning_status in ('pending', 'calculated', 'approved', 'cancelled')
        ),
        payout_status text not null default 'unpaid' check (
          payout_status in ('unpaid', 'processing', 'paid', 'failed')
        ),
        paid_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (
          final_earning = greatest(
            delivery_fee + additional_fee - deduction_amount,
            0
          )
        )
      );
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'delivery_payments'
      and column_name = 'payment_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'delivery_payments'
      and column_name = 'delivery_payment_id'
  ) then
    execute 'alter table public.delivery_payments '
      'rename column payment_id to delivery_payment_id';
  end if;
end
$repair$;
drop trigger if exists delivery_payments_set_updated_at
  on public.delivery_payments;
create trigger delivery_payments_set_updated_at
before update on public.delivery_payments
for each row execute function public.set_updated_at();
revoke all on public.delivery_payments from anon, authenticated;
grant select on public.delivery_payments to authenticated;
comment on table public.delivery_payments is
  'Rider earning and payout for a delivery; separate from Buyer order payments.';
notify pgrst, 'reload schema';
commit;
