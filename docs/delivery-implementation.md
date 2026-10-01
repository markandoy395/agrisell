# Delivery management and tracking

## Implemented

| Area | Behavior |
| --- | --- |
| Delivery creation | Select a preparing/ready order and scheduled arrival; persist the delivery and fulfillment through the existing order-ready function. Duplicate commands replay safely; duplicate orders are rejected. |
| Assignment | Approved riders, availability and capacity indicators; database validation of capacity, vehicle, deadlines and handling requirements. Reassignment requires a reason and the previous rider to match. |
| Status | Allowed transitions, required admin reason, previous-status checks, transactional audit history and command idempotency. |
| Delivery List | Customer, rider/contact, pickup, destination, full date/time, overdue state, search, rider/status/date filters, pagination and CSV export. |
| Details | Order items, contacts, timestamps, assignment/status controls and status timeline. |
| Proof | Existing rider photos/signatures and recipient-confirmation timestamps; private images use five-minute signed URLs. Confirmation hashes are excluded. |
| Tracking | Rider locations load independently of deliveries every 15 seconds. The map stays visible with no deliveries; riders with GPS appear whether assigned or unassigned. Search, rider selection/follow, manual refresh, missing/stale GPS and refresh-error states are supported. Delivery routes are optional and a delivery API failure does not block rider locations. |
| Map | Drag/pan, zoom, fit markers, follow rider, pickup/destination markers, road route, remaining distance and travel-based arrival estimate. |
| History | Valid GPS fixes recorded against active assigned deliveries; time slider and playback. |
| Access | Both admin backends require logistics/admin permission; new database RPCs are service-role-only. Rider GPS writes retain existing own-rider RLS. |

Pickup remains in the rider app and the admin's generic status control cannot bypass
its evidence/checklists. Final completion is also available as a separate, explicit
administrator command with a required reason, actor audit event, idempotency, and
completion timestamp. This narrowly scoped command bypasses the rider-photo trigger;
ordinary rider completion continues to require delivery photo evidence. Completion also
synchronizes every related order to `delivered`, and the migration repairs previously
completed deliveries whose orders were left active. Creation uses the order's saved coordinates;
missing pickup/destination details must be corrected in the originating order/farm.

## Database integration

The live schema was inspected read-only. Existing assignments are stored in
`private.rider_delivery_assignments`, delivery coordinates in
`private.order_delivery_fulfillments`, and live GPS in `public.rider_locations`.
`riders.gps_lat/gps_long` describe registered locations and are not a live feed.
The earlier draft migration that added another GPS timestamp was replaced.

The new migration is `supabase/migrations/20260907010000_admin_deliveries.sql`.
It adds admin RPCs, an idempotent command log, GPS validation and trip history.
It does not replace the rider application's location uploader or ownership policies.
Trip history starts when the migration is applied; old movement is not reconstructed.

`supabase/migrations/20260909010000_admin_rider_tracking.sql` adds the service-role-only
`admin_rider_tracking_rows` RPC, exposed to authorized admins at
`GET /api/admin/deliveries/riders`. It reads riders with a left join to their latest
`rider_locations` record, without filtering by assignment or availability. Riders
without GPS remain in the table as "No location"; registered profile coordinates
are never substituted for GPS.

## Verification

Run from `frontend` with Node 24 or newer:

```powershell
npm.cmd run test:deliveries
npm.cmd run test:browser
npm.cmd run test:edge-types
npm.cmd run lint
npm.cmd run build
```

Database tests run the actual migration in PGlite with representative schema fixtures
and snapshots of the application's order-ready and assignment-validation functions.
API tests cover permission checks, validation, error mapping, pagination arguments,
signed evidence paths and GPS state classification. Browser tests run the admin UI
against the same shared API handler and local PostgreSQL fixture, including saving,
reloading, assignment, tracking, proof display, history, filters and CSV export.
Tiles, route responses and proof image downloads are mocked in browser tests.

The fixture does not reproduce every existing application trigger, notification,
storage policy or mobile operating system's GPS behavior. Those require a deployed
integration check. Production records have not been mutated by these tests.

## Rollout

Local verification completed on 2026-09-09: 15 database/API tests, 4 browser
workflows, the frontend production build, frontend lint and Edge Function type
checks passed. The two pre-existing effect-state lint errors and the Edge Function's
map-entry tuple typing were corrected while completing these checks.

In restricted Windows environments, Playwright's automatic web-server cleanup may
stall. Start Vite on port 5199 separately and set `DELIVERY_REUSE_SERVER=1` for the
browser test process to reuse it. This was the setup used for the successful run.

1. Apply the migration to a staging copy of the existing Agrisell application database.
2. Deploy the updated `admin-api` function, including `deliveries.ts`, and build/deploy
   the frontend. For the local backend use Node 24+ and retain the Supabase function
   directory because it contains the shared API handler.
3. Configure `VITE_DELIVERY_ROUTING_URL` with your production OSRM-compatible service.
   Routing remains disabled when this value is absent or invalid; there is no public
   fallback. Complete the provider and retention review in
   `delivery-routing-privacy.md` before enabling it. Routes use the driving profile;
   estimates exclude live traffic and pickup/service time.
4. Use an approved test rider and test order to check assignment visibility in the
   rider app, real GPS movement, evidence uploads, and existing pickup/COD completion.
5. Verify loss of GPS, connection failure, reassignment capacity, and access with an
   administrator lacking logistics permission before promoting to production.

On 2026-09-09, migration `20260907010000` was applied to the linked Agrisell
database using the Supabase CLI's saved login and recorded as applied in migration
history. A transaction that rolled back first verified compatibility with the live
schema, existing order-ready/assignment functions and service-role-only RPC access.
After installation, read-only checks through the shared delivery API handler and
the configured backend credentials passed for Delivery List, Tracking, options and
delivery details (4 deliveries, 1 active at verification time). The missing-migration
error is resolved; refresh the delivery page to fetch current data.

The independent rider tracking migration `20260909010000` was also applied and
recorded on 2026-09-09 after a rollback preflight. Live checks through the shared API
handler passed for rider locations and all existing delivery read endpoints. Both
riders had saved GPS coordinates and neither had an active assigned delivery at
verification time. The browser regression test verifies an unassigned rider marker,
selection/follow, search, the map with no GPS, and continued rider display when the
delivery endpoint fails.

No application deployment or real delivery mutation was performed during this
database fix. Real-device GPS and rider workflow checks from the rollout list above
remain necessary; previously recorded locations do not become fresh when the schema
is installed.

OSRM route response fields follow the [official OSRM Route API](https://project-osrm.org/docs/v5.24.0/api/#route-service).
