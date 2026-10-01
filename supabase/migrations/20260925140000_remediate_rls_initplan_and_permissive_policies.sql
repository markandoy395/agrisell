-- Migration: 20260925140000_remediate_rls_initplan_and_permissive_policies.sql
-- Description: Remediate Supabase database linter warnings:
-- 1. auth_rls_initplan (Lint 0003): wrap auth.uid() in (select auth.uid()) for user_withdrawal_methods and payout_requests
-- 2. multiple_permissive_policies (Lint 0006): consolidate multiple permissive SELECT and INSERT policies on marketplace_conversations, marketplace_messages, and rider_incidents

begin;

-- ============================================================================
-- 1. Remediate auth_rls_initplan on public.user_withdrawal_methods
-- Wrap auth.uid() in (select auth.uid()) to evaluate once per query as an InitPlan
-- ============================================================================
drop policy if exists "Users can view own withdrawal methods" on public.user_withdrawal_methods;
create policy "Users can view own withdrawal methods"
  on public.user_withdrawal_methods
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own withdrawal methods" on public.user_withdrawal_methods;
create policy "Users can insert own withdrawal methods"
  on public.user_withdrawal_methods
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own withdrawal methods" on public.user_withdrawal_methods;
create policy "Users can update own withdrawal methods"
  on public.user_withdrawal_methods
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own withdrawal methods" on public.user_withdrawal_methods;
create policy "Users can delete own withdrawal methods"
  on public.user_withdrawal_methods
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================================
-- 2. Remediate auth_rls_initplan on public.payout_requests
-- Wrap auth.uid() in (select auth.uid()) to evaluate once per query as an InitPlan
-- ============================================================================
drop policy if exists "Users can view own payout requests" on public.payout_requests;
create policy "Users can view own payout requests"
  on public.payout_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own payout requests" on public.payout_requests;
create policy "Users can create own payout requests"
  on public.payout_requests
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 3. Remediate multiple_permissive_policies on public.marketplace_conversations
-- Drop redundant admin audit read policy and keep single consolidated participant/admin read
-- ============================================================================
drop policy if exists marketplace_conversations_admin_audit_read on public.marketplace_conversations;
drop policy if exists marketplace_conversations_participant_read on public.marketplace_conversations;

create policy marketplace_conversations_participant_read
  on public.marketplace_conversations
  for select
  to authenticated
  using (
    (select private.is_admin())
    or private.can_access_marketplace_conversation(conversation_id)
  );

-- ============================================================================
-- 4. Remediate multiple_permissive_policies on public.marketplace_messages
-- Drop redundant admin audit read policy and keep single consolidated participant/admin read
-- ============================================================================
drop policy if exists marketplace_messages_admin_audit_read on public.marketplace_messages;
drop policy if exists marketplace_messages_participant_read on public.marketplace_messages;

create policy marketplace_messages_participant_read
  on public.marketplace_messages
  for select
  to authenticated
  using (
    (select private.is_admin())
    or private.can_access_marketplace_conversation(conversation_id)
  );

-- ============================================================================
-- 5. Remediate multiple_permissive_policies on public.rider_incidents
-- Consolidate duplicate SELECT policies ({authenticated_select, rider_incidents_reporter_read})
-- and duplicate INSERT policies ({authenticated_insert, rider_incidents_reporter_insert})
-- into single unified policies with subselect guards
-- ============================================================================
drop policy if exists rider_incidents_reporter_read on public.rider_incidents;
drop policy if exists authenticated_select on public.rider_incidents;

create policy authenticated_select
  on public.rider_incidents
  for select
  to authenticated
  using (
    (select private.is_admin())
    or reporter_auth_id = (select auth.uid())
    or (rider_id is not null and rider_id = private.current_rider_id())
  );

drop policy if exists rider_incidents_reporter_insert on public.rider_incidents;
drop policy if exists authenticated_insert on public.rider_incidents;

create policy authenticated_insert
  on public.rider_incidents
  for insert
  to authenticated
  with check (
    (select private.is_admin())
    or reporter_auth_id = (select auth.uid())
    or (rider_id is not null and rider_id = private.current_rider_id())
  );

notify pgrst, 'reload schema';

commit;
