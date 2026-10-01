-- Migration: 20260925150000_add_foreign_key_covering_indexes.sql
-- Description: Remediate Supabase database linter warnings:
-- unindexed_foreign_keys (Rule 0001): Add covering indexes on all foreign key columns
-- to prevent full sequential table scans and locking on parent row updates/deletions.

begin;

do $$
begin
  -- 1. private.admin_delivery_commands (delivery_id)
  if to_regclass('private.admin_delivery_commands') is not null then
    create index if not exists admin_delivery_commands_delivery_id_idx
      on private.admin_delivery_commands (delivery_id);
  end if;

  -- 2. private.admin_order_events (order_id)
  if to_regclass('private.admin_order_events') is not null then
    create index if not exists admin_order_events_order_id_idx
      on private.admin_order_events (order_id);
  end if;

  -- 3. private.admin_payment_events (payment_id)
  if to_regclass('private.admin_payment_events') is not null then
    create index if not exists admin_payment_events_payment_id_idx
      on private.admin_payment_events (payment_id);
  end if;

  -- 4. private.commodity_restock_history (performed_by)
  if to_regclass('private.commodity_restock_history') is not null then
    create index if not exists commodity_restock_history_performed_by_idx
      on private.commodity_restock_history (performed_by);
  end if;

  -- 5. private.delivery_cash_collections (rider_id)
  if to_regclass('private.delivery_cash_collections') is not null then
    create index if not exists delivery_cash_collections_rider_id_idx
      on private.delivery_cash_collections (rider_id);
  end if;

  -- 6. private.delivery_location_history (rider_id)
  if to_regclass('private.delivery_location_history') is not null then
    create index if not exists delivery_location_history_rider_id_idx
      on private.delivery_location_history (rider_id);
  end if;

  -- 7. private.farmer_payouts (farmer_user_id)
  if to_regclass('private.farmer_payouts') is not null then
    create index if not exists farmer_payouts_farmer_user_id_idx
      on private.farmer_payouts (farmer_user_id);
  end if;

  -- 8. private.gcash_verified_reference_claims (buyer_user_id)
  if to_regclass('private.gcash_verified_reference_claims') is not null then
    create index if not exists gcash_verified_reference_claims_buyer_user_id_idx
      on private.gcash_verified_reference_claims (buyer_user_id);
  end if;

  -- 9. private.payment_refunds (payment_id)
  if to_regclass('private.payment_refunds') is not null then
    create index if not exists payment_refunds_payment_id_idx
      on private.payment_refunds (payment_id);
  end if;

  -- 10. private.rider_delivery_limit_configuration (updated_by)
  if to_regclass('private.rider_delivery_limit_configuration') is not null then
    create index if not exists rider_delivery_limit_configuration_updated_by_idx
      on private.rider_delivery_limit_configuration (updated_by);
  end if;

  -- 11 & 12. private.seller_order_registry (buyer_user_id, seller_farm_id)
  if to_regclass('private.seller_order_registry') is not null then
    create index if not exists seller_order_registry_buyer_user_id_idx
      on private.seller_order_registry (buyer_user_id);
    create index if not exists seller_order_registry_seller_farm_id_idx
      on private.seller_order_registry (seller_farm_id);
  end if;

  -- 13. public.admin_roles (user_id)
  if to_regclass('public.admin_roles') is not null then
    create index if not exists admin_roles_user_id_idx
      on public.admin_roles (user_id);
  end if;

  -- 14. public.buyers (user_id)
  if to_regclass('public.buyers') is not null then
    create index if not exists buyers_user_id_idx
      on public.buyers (user_id);
  end if;

  -- 15. public.categories (farm_id)
  if to_regclass('public.categories') is not null then
    create index if not exists categories_farm_id_idx
      on public.categories (farm_id);
  end if;

  -- 16. public.commodity_inventory_lots (created_by)
  if to_regclass('public.commodity_inventory_lots') is not null then
    create index if not exists commodity_inventory_lots_created_by_idx
      on public.commodity_inventory_lots (created_by);
  end if;

  -- 17. public.delivery_proofs (rider_id)
  if to_regclass('public.delivery_proofs') is not null then
    create index if not exists delivery_proofs_rider_id_idx
      on public.delivery_proofs (rider_id);
  end if;

  -- 18. public.farm_followers (farm_id)
  if to_regclass('public.farm_followers') is not null then
    create index if not exists farm_followers_farm_id_idx
      on public.farm_followers (farm_id);
  end if;

  -- 19. public.logistics_companies (delivery_id)
  if to_regclass('public.logistics_companies') is not null then
    create index if not exists logistics_companies_delivery_id_idx
      on public.logistics_companies (delivery_id);
  end if;

  -- 20, 21, 22. public.marketplace_conversations (commodity_id, farm_id, order_id)
  if to_regclass('public.marketplace_conversations') is not null then
    create index if not exists marketplace_conversations_commodity_id_idx
      on public.marketplace_conversations (commodity_id);
    create index if not exists marketplace_conversations_farm_id_idx
      on public.marketplace_conversations (farm_id);
    create index if not exists marketplace_conversations_order_id_idx
      on public.marketplace_conversations (order_id);
  end if;

  -- 23. public.payout_requests (user_id)
  if to_regclass('public.payout_requests') is not null then
    create index if not exists payout_requests_user_id_idx
      on public.payout_requests (user_id);
  end if;

  -- 24, 25, 26. public.reviews (buyer_user_id, commodity_id, farmer_user_id)
  if to_regclass('public.reviews') is not null then
    create index if not exists reviews_buyer_user_id_idx
      on public.reviews (buyer_user_id);
    create index if not exists reviews_commodity_id_idx
      on public.reviews (commodity_id);
    create index if not exists reviews_farmer_user_id_idx
      on public.reviews (farmer_user_id);
  end if;

  -- 27. public.rider_conversation_reads (delivery_id)
  if to_regclass('public.rider_conversation_reads') is not null then
    create index if not exists rider_conversation_reads_delivery_id_idx
      on public.rider_conversation_reads (delivery_id);
  end if;

  -- 28. public.rider_ratings (reviewer_auth_id)
  if to_regclass('public.rider_ratings') is not null then
    create index if not exists rider_ratings_reviewer_auth_id_idx
      on public.rider_ratings (reviewer_auth_id);
  end if;

  -- 29. public.user_withdrawal_methods (user_id)
  if to_regclass('public.user_withdrawal_methods') is not null then
    create index if not exists user_withdrawal_methods_user_id_idx
      on public.user_withdrawal_methods (user_id);
  end if;
end;
$$;

commit;
