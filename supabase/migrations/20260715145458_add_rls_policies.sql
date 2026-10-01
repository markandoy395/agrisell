begin;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.admin_roles, public.admins, public.users, public.buyers,
  public.farmers, public.farms, public.categories, public.commodities,
  public.carts, public.cart_items, public.orders, public.order_items,
  public.reviews, public.payments, public.deliveries, public.riders,
  public.logistics_companies to authenticated;
grant insert on public.farms, public.categories, public.commodities,
  public.carts, public.cart_items, public.reviews to authenticated;
grant update (first_name, middle_name, last_name, extension_name, contact_number,
  profile_photo_url, gender, date_of_birth, e_wallet_details) on public.users to authenticated;
grant update (shipping_address, preferred_payment_method, gps_lat, gps_long,
  business_name) on public.buyers to authenticated;
grant update (years_of_experience, bank_details, certification, registration_date)
  on public.farmers to authenticated;
grant update (farm_name, farm_location, gps_lat, gps_long, total_crops,
  farm_size_hectares, farming_type, soil_type, irrigation_type, main_crops,
  certifications, farm_images) on public.farms to authenticated;
grant update (category_name, description, status) on public.categories to authenticated;
grant update (commodity_name, description, price_per_unit, unit_type,
  available_quantity, harvest_date, production_status, is_organic, image_url,
  commodity_status, minimum_order_quantity, grade_quality) on public.commodities to authenticated;
grant update (cart_status) on public.carts to authenticated;
grant update (quantity) on public.cart_items to authenticated;
grant update (rating, comment) on public.reviews to authenticated;
grant update (license_number, full_name, vehicle_type, vehicle_plate_number,
  availability_status, first_name, last_name, contact_number, email, gps_lat,
  gps_long, employment_status, profile_photo_url) on public.riders to authenticated;
grant delete on public.carts, public.cart_items, public.reviews to authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'admin_roles','admins','users','buyers','farmers','farms','categories',
    'commodities','carts','cart_items','orders','order_items','reviews',
    'payments','deliveries','riders','logistics_companies'
  ] loop
    execute format(
      'create policy admin_full_access on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())',
      table_name
    );
  end loop;
end $$;
create policy marketplace_read on public.farms for select to authenticated using (true);
create policy marketplace_read on public.categories for select to authenticated using (true);
create policy marketplace_read on public.commodities for select to authenticated using (true);
create policy marketplace_read on public.logistics_companies for select to authenticated using (true);
create policy users_own_read on public.users for select to authenticated
  using (user_id = private.current_user_id());
create policy users_own_update on public.users for update to authenticated
  using (user_id = private.current_user_id()) with check (user_id = private.current_user_id());
create policy buyers_own_read on public.buyers for select to authenticated
  using (buyer_user_id = private.current_buyer_user_id());
create policy buyers_own_update on public.buyers for update to authenticated
  using (buyer_user_id = private.current_buyer_user_id()) with check (buyer_user_id = private.current_buyer_user_id());
create policy farmers_own_read on public.farmers for select to authenticated
  using (farmer_user_id = private.current_farmer_user_id());
create policy farmers_own_update on public.farmers for update to authenticated
  using (farmer_user_id = private.current_farmer_user_id()) with check (farmer_user_id = private.current_farmer_user_id());
create policy riders_own_read on public.riders for select to authenticated
  using (rider_id = private.current_rider_id());
create policy riders_own_update on public.riders for update to authenticated
  using (rider_id = private.current_rider_id()) with check (rider_id = private.current_rider_id());
create policy farms_owner_insert on public.farms for insert to authenticated
  with check (farmer_user_id = private.current_farmer_user_id());
create policy farms_owner_update on public.farms for update to authenticated
  using (private.owns_farm(farm_id)) with check (private.owns_farm(farm_id));
create policy categories_owner_insert on public.categories for insert to authenticated
  with check (private.owns_farm(farm_id));
create policy categories_owner_update on public.categories for update to authenticated
  using (private.owns_farm(farm_id)) with check (private.owns_farm(farm_id));
create policy commodities_owner_insert on public.commodities for insert to authenticated
  with check (private.owns_category(category_id, farm_id));
create policy commodities_owner_update on public.commodities for update to authenticated
  using (private.owns_category(category_id, farm_id))
  with check (private.owns_category(category_id, farm_id));
create policy carts_owner_read on public.carts for select to authenticated
  using (private.owns_cart(cart_id));
create policy carts_owner_insert on public.carts for insert to authenticated
  with check (buyer_user_id = private.current_buyer_user_id());
create policy carts_owner_update on public.carts for update to authenticated
  using (private.owns_cart(cart_id)) with check (private.owns_cart(cart_id));
create policy carts_owner_delete on public.carts for delete to authenticated
  using (private.owns_cart(cart_id));
create policy cart_items_owner_read on public.cart_items for select to authenticated
  using (private.owns_cart(cart_id));
create policy cart_items_owner_insert on public.cart_items for insert to authenticated
  with check (private.owns_cart(cart_id));
create policy cart_items_owner_update on public.cart_items for update to authenticated
  using (private.owns_cart(cart_id)) with check (private.owns_cart(cart_id));
create policy cart_items_owner_delete on public.cart_items for delete to authenticated
  using (private.owns_cart(cart_id));
create policy orders_access_read on public.orders for select to authenticated
  using (private.owns_order(order_id));
create policy order_items_access_read on public.order_items for select to authenticated
  using (private.owns_order(order_id));
create policy reviews_access_read on public.reviews for select to authenticated
  using (private.owns_order(order_id));
create policy reviews_buyer_insert on public.reviews for insert to authenticated
  with check (private.current_buyer_user_id() is not null and private.owns_order(order_id));
create policy reviews_buyer_update on public.reviews for update to authenticated
  using (private.current_buyer_user_id() is not null and private.owns_order(order_id))
  with check (private.current_buyer_user_id() is not null and private.owns_order(order_id));
create policy reviews_buyer_delete on public.reviews for delete to authenticated
  using (private.current_buyer_user_id() is not null and private.owns_order(order_id));
create policy payments_access_read on public.payments for select to authenticated
  using (private.can_access_payment(payment_id));
create policy deliveries_access_read on public.deliveries for select to authenticated
  using (private.can_access_delivery(delivery_id));
commit;
