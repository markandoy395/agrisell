begin;
-- The relation-repair migration can create this table from scratch in a
-- drifted deployment. Reapply the security contract that existed on the
-- legacy singular relation before it was renamed.
alter table public.delivery_payments enable row level security;
drop policy if exists delivery_admin_access on public.delivery_payments;
drop policy if exists rider_delivery_child_read on public.delivery_payments;
drop policy if exists delivery_payments_authenticated_select
  on public.delivery_payments;
-- A single permissive policy avoids duplicate-policy evaluation while
-- preserving the original administrator-or-assigned-rider access rule.
create policy delivery_payments_authenticated_select
on public.delivery_payments
for select
to authenticated
using (
  private.is_admin()
  or private.rider_owns_delivery(delivery_id)
);
revoke all privileges on table public.delivery_payments
  from public, anon, authenticated;
grant select on table public.delivery_payments to authenticated;
commit;
