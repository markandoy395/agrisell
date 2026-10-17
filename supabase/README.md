# Supabase Edge Functions deployment

## Account lifecycle and verification

Apply `migrations/20260915100000_admin_account_lifecycle.sql` before deploying
the matching admin API and frontend. It stores immutable administrator audit
events for profile/status changes and farmer/rider verification decisions.
Suspension and deactivation also ban the linked Supabase Auth account; reactivation
removes that ban. Rider documents remain private and are exposed to authorized
administrators only through five-minute signed links. Rejections require a reason,
and missing-information requests require both a message and at least one named item.

## Delivery management and live tracking

Apply migrations/20260907010000_admin_deliveries.sql to the existing Agrisell
application database, then deploy the updated admin-api Edge Function and frontend.
For local development use Node 24+; the Node backend imports the shared TypeScript
API handler directly. The migration depends on the rider application's existing
private fulfillment, assignment and status-history schema.

The admin reads private.rider_delivery_assignments and public.rider_locations,
which the rider app already updates with its own authenticated Supabase session.
Registered address coordinates on riders are not treated as live GPS. The migration
preserves existing rider ownership policies, rejects invalid GPS fixes, ignores
older updates, and records positions for active trips in
private.delivery_location_history. History starts when the migration is applied.

Creation calls the existing order-ready function, preserving pickup, destination,
order grouping and order-state rules. Assignment uses the existing capacity,
deadline and vehicle validator. Admin status changes require a reason and check the
previous state/assignment. Commands are audited and idempotent. Pickup and final
completion remain in the rider app because they require evidence and payment
confirmation. Proof photos use five-minute signed URLs from the private
delivery-proofs bucket. Confirmation hashes are never returned.

Live Tracking refreshes only delivery data every 15 seconds while open. GPS fixes
older than two minutes are stale. Requests stop when the tab closes. Road routing
is disabled unless `VITE_DELIVERY_ROUTING_URL` identifies an approved HTTPS
OSRM-compatible service. There is no public routing fallback. Review and record the
provider's coordinate retention and privacy terms as described in
`../docs/delivery-routing-privacy.md`. Arrival estimates exclude traffic and pickup
time.

Admin RPCs are service-role-only. Both HTTP backends require logistics:manage or
admin:manage. No database deployment credential is bundled.

Verification from frontend:

    npm.cmd run test:deliveries
    npm.cmd run test:browser
    npm.cmd run build
    npm.cmd run lint

Database tests execute the migration in PGlite with representative schema fixtures
and snapshots of the existing order-ready and rider-capacity functions. Browser
tests exercise the UI through the shared API handler against the isolated database;
map tiles, routing responses and evidence images use fixtures. They do not modify
live deliveries. See ../docs/delivery-implementation.md for rollout details.

This folder replaces the deployed Node backend with the `admin-api` Supabase Edge Function. The Node backend can remain for local development, but it is not required after this function is deployed.

Administrator profile-image uploads are decoded with ImageMagick WASM under strict
resource limits and re-encoded as metadata-free WebP. New files use the private
`admin-profile-images-private` bucket; the API stores only the object path and
returns an eight-hour signed URL. The former `admin-profile-images` bucket is not
used for new uploads. After confirming that no older profile records reference it,
remove that legacy public bucket through the Supabase dashboard.

## 1. Protect your Supabase data

Keep Row Level Security enabled for all public tables. The function uses Supabase's server-only `SUPABASE_SERVICE_ROLE_KEY`, which is never added to GitHub or frontend environment files.

An admin must meet both conditions to use this dashboard:

1. Have a valid Supabase Auth email/password account.
2. Have a matching email in `public.users` and an `admin` or `super_admin` record in `public.admins`.

## 2. Set secrets and allowed origins

Run these commands locally after logging into the Supabase CLI. Use your exact GitHub Pages URL; add local Vite URLs only when needed for development.

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set ALLOWED_ORIGINS=https://YOUR_GITHUB_USERNAME.github.io,http://localhost:5173
supabase secrets set SUPABASE_QUERY_LIMIT=1000
supabase functions deploy admin-api
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically supplied to deployed Edge Functions. Do not put a service-role key in GitHub Actions, GitHub Pages variables, or a frontend `.env` file.

Apply `20260917110000_admin_distributed_rate_limits.sql` before deploying this
function. Login attempts and authenticated mutations fail closed when the shared
rate-limit RPC is unavailable.

Also apply `20260917120000_admin_persistent_sessions.sql` before deploying the
Node backend. It creates the shared Node session registry and persistent
administrator session version used for cross-instance revocation. Edge password,
privilege, account-status, and session-revocation operations call the same
invalidation RPC so Node sessions cannot retain stale access.

## 3. Configure the GitHub Pages frontend

In the environment used to build the frontend, set only the API endpoint variable:

```text
VITE_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-api
```

Database URLs, API keys, and service keys must never be exposed to the client. Build and deploy the `frontend` directory to GitHub Pages. Administrators can then sign in using their Supabase Auth credentials. Login, MFA verification, and session management are handled entirely through server-side endpoints on the Edge Function so credentials and keys remain strictly server-side. The browser stores only the returned short-lived access token and sends it to the Edge Function; the function validates the token and checks the `users` and `admins` database records before responding.

## 4. Add administrators

A signed-in `super_admin` has every dashboard privilege and can create regular administrators from **Settings**. Each regular administrator can have any combination of feature privileges, from one through all available dashboard areas; accounts without stored privileges default to Overview, Users, and Farmers. Privileges are stored with the administrator's existing `admin_roles` record, so no additional database column is required. The API deliberately does not allow a superadmin to grant the `admin:manage` privilege to a new regular administrator.

The same **Settings** area lists existing administrator accounts. A superadmin can update a regular administrator's privileges at any time. Superadmin privileges are fixed at full access and cannot be restricted through this endpoint.

The existing local command `npm run provision-admins` remains the bootstrap path for the initial admin and superadmin accounts while the Node backend configuration is available.
