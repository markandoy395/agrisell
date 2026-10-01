begin;
-- Additive-only application attributes. The original ERD columns, keys, and
-- relationships are intentionally unchanged.
alter table public.users
  add column username text,
  add column address text,
  add column follower_count bigint not null default 0,
  add column following_count bigint not null default 0,
  add column account_role text,
  add column rider_application jsonb;
alter table public.farms
  add column cover_image_url text,
  add column follower_count bigint not null default 0,
  add column updated_at timestamptz not null default now();
alter table public.commodities
  add column previous_price numeric(14,2),
  add column discount_label text,
  add column rating numeric(3,2),
  add column booked_order_count bigint not null default 0,
  add column product_metadata jsonb not null default '{}'::jsonb;
alter table public.orders
  add column contact_number text,
  add column cancellation_reason text,
  add column confirmed_received_at timestamptz,
  add column updated_at timestamptz not null default now();
alter table public.reviews
  add column helpful_count integer not null default 0,
  add column score_lines text[] not null default '{}'::text[],
  add column image_urls text[] not null default '{}'::text[];
alter table public.payments
  add column currency_code text not null default 'PHP',
  add column amount_received numeric(14,2),
  add column collection_status text,
  add column remittance_required boolean,
  add column collection_issue text,
  add column collection_notes text,
  add column authorized_exception_reference text,
  add column recorded_at timestamptz,
  add column updated_at timestamptz not null default now();
alter table public.riders
  add column middle_name text,
  add column date_of_birth date,
  add column gender text,
  add column region text,
  add column province text,
  add column city text,
  add column barangay text,
  add column complete_address text,
  add column current_location text,
  add column service_area text,
  add column service_radius_km numeric(10,2),
  add column capacity_kg numeric(12,3),
  add column handling_capability_keys text[] not null default '{}'::text[],
  add column maximum_active_deliveries integer not null default 1,
  add column vehicle_brand text,
  add column vehicle_model text,
  add column vehicle_color text,
  add column vehicle_registration_number text,
  add column updated_at timestamptz not null default now();
alter table public.deliveries
  add column pickup_lat numeric(10,7),
  add column pickup_long numeric(10,7),
  add column dropoff_lat numeric(10,7),
  add column dropoff_long numeric(10,7),
  add column pickup_deadline timestamptz,
  add column delivery_deadline timestamptz,
  add column total_weight_kg numeric(12,3),
  add column required_capacity_kg numeric(12,3),
  add column estimated_travel_minutes integer,
  add column pickup_to_delivery_distance_km numeric(10,2),
  add column pickup_to_delivery_minutes integer,
  add column delivery_fee numeric(14,2),
  add column priority text,
  add column pickup_instructions text,
  add column delivery_instructions text,
  add column available_at timestamptz,
  add column expires_at timestamptz,
  add column service_area text,
  add column required_vehicle_types text[] not null default '{}'::text[],
  add column handling_requirements jsonb not null default '[]'::jsonb,
  add column package_dimensions jsonb,
  add column fee_breakdown jsonb,
  add column cancellation_conditions text,
  add column transport_compatibility_group text,
  add column requires_exclusive_transport boolean not null default false,
  add column route_payload jsonb,
  add column workflow_state jsonb not null default '{}'::jsonb,
  add column proof_references jsonb not null default '[]'::jsonb,
  add column status_history jsonb not null default '[]'::jsonb,
  add column problem_records jsonb not null default '[]'::jsonb,
  add column offline_actions jsonb not null default '[]'::jsonb,
  add column batch_reference text,
  add column pickup_sequence integer,
  add column delivery_sequence integer,
  add column batch_route jsonb,
  add column estimated_earning numeric(14,2),
  add column final_earning numeric(14,2),
  add column earning_breakdown jsonb,
  add column earning_status text,
  add column payout_status text,
  add column closed_at timestamptz,
  add column updated_at timestamptz not null default now();
grant update (username, address) on public.users to authenticated;
grant update (cover_image_url) on public.farms to authenticated;
grant update (previous_price, discount_label, product_metadata)
  on public.commodities to authenticated;
grant update (middle_name, date_of_birth, gender, region, province, city,
  barangay, complete_address, current_location, service_area,
  service_radius_km, capacity_kg, handling_capability_keys,
  maximum_active_deliveries, vehicle_brand, vehicle_model, vehicle_color,
  vehicle_registration_number) on public.riders to authenticated;
commit;
