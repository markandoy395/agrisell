begin;
-- Guests may see only promotions explicitly targeted to all users. The RPC's
-- new-user predicate still requires the authenticated buyer identity.
grant execute on function public.marketplace_promotion_banners() to anon;
notify pgrst, 'reload schema';
commit;
