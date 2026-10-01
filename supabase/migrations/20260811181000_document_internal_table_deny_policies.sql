begin;
-- These tables are implementation details accessed only by trusted trigger and
-- SECURITY DEFINER routines. Explicit restrictive policies preserve the
-- existing default-deny behavior while documenting that direct Data API access
-- is never intended.

revoke all privileges on table private.auth_identities
  from public, anon, authenticated;
create policy "deny direct client access"
on private.auth_identities
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table private.commodity_restock_history
  from public, anon, authenticated;
create policy "deny direct client access"
on private.commodity_restock_history
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table private.delivery_cash_collections
  from public, anon, authenticated;
create policy "deny direct client access"
on private.delivery_cash_collections
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table private.delivery_status_events
  from public, anon, authenticated;
create policy "deny direct client access"
on private.delivery_status_events
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table private.gcash_verified_reference_claims
  from public, anon, authenticated;
create policy "deny direct client access"
on private.gcash_verified_reference_claims
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table private.order_acceptance_events
  from public, anon, authenticated;
create policy "deny direct client access"
on private.order_acceptance_events
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table private.order_checkout_keys
  from public, anon, authenticated;
create policy "deny direct client access"
on private.order_checkout_keys
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table private.order_delivery_fulfillments
  from public, anon, authenticated;
create policy "deny direct client access"
on private.order_delivery_fulfillments
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table private.rider_delivery_assignments
  from public, anon, authenticated;
create policy "deny direct client access"
on private.rider_delivery_assignments
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table private.seller_order_registry
  from public, anon, authenticated;
create policy "deny direct client access"
on private.seller_order_registry
as restrictive
for all
to public
using (false)
with check (false);
revoke all privileges on table public.farm_followers
  from public, anon, authenticated;
create policy "deny direct client access"
on public.farm_followers
as restrictive
for all
to public
using (false)
with check (false);
commit;
