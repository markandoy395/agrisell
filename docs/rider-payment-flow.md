# Rider payment flow — 2026-10-15

Implementation uses the existing agreed delivery fee and manual GCash/bank
disbursement model. No distance rate, platform commission, automatic charge,
or transfer provider has been invented. A fee records an obligation; it does
not collect money from a buyer or farmer or establish that funds are held.
Admin must arrange funding, send the transfer, and record its provider reference.
Product COD cash remains separate and must be remitted to the farmer.

## Implemented sequence

1. Farmer enters a positive PHP delivery fee before reviewing/sending a rider
   request. The same fee reaches the existing request RPC. The server rejects
   pending/accepted requests without a positive fee and locks an accepted fee.
   Existing admin assignments carry forward a stored offer/payment fee. If no
   positive fee exists, admin must have the farmer set one before assignment.
2. Existing acceptance, proof, COD and completion authorization remains in place.
   The completion migration records the accepted fee once in delivery_payments.
   Duplicate completion does not overwrite adjustments or existing paid amounts.
3. The rider sees an all-time server wallet separately from period-filtered
   earnings. Only completed, calculated/approved payment records are available.
   Paid records and active reservations cannot be withdrawn again.
4. Rider submits a saved, owned withdrawal method, amount, notes and retry UUID.
   The server resolves auth and rider identities independently; it snapshots the
   saved account, locks that account and allocates the request across delivery
   earnings. Fractions of a delivery earning are supported. Overdrafts, invalid
   precision, other-account destinations and reused keys with different inputs
   fail. Replays return the original request and never reserve a second time.
5. Admin sees delivery allocations, account details and reconciliation warnings.
   Only the trusted backend with payment-management permission may approve,
   reject or record payment. A request moves pending → approved → paid, or
   pending/approved → rejected. Rejection requires a reason and releases the
   reservation. Paid/rejected records cannot be reopened or altered.
6. Admin records a completed transfer reference. Method/reference uniqueness and
   idempotent retries prevent duplicate accounting. Actor columns retain who
   approved, paid or rejected a request. Status notifications are transactional.
7. Paid allocations contribute to the wallet's paid total. A delivery becomes
   fully paid only after its entire earning is paid; partially paid deliveries
   retain their unpaid status. Rider cash-out history shows status, rejection
   reason and transfer reference. Refreshing/reopening Earnings reloads the data.

## Accounting and security boundaries

Private rider_payout_allocations links requests to exact delivery amounts.
RLS/default-deny policies and revoked table/function privileges prevent client
ledger changes. Direct payout INSERT/UPDATE/DELETE is revoked; the legacy payout
RPC denies rider requests and retains the existing authenticated farmer contract.
The farmer payout accounting model was not redesigned in this rider change.

Reserved earnings cannot be reduced below allocations or cancelled. Allocated
deliveries cannot be reopened/cancelled or have their rider removed/reassigned.
Foreign keys preserve delivery payment records and request history.

current_rider_wallet and submit_rider_payout_request independently check a valid,
non-anonymous, unexpired session, current rider and rate-limited gateway marker.
Requests use the existing rate-limited HTTP client; financial submission matches
the gateway's existing sensitive-action quota. The staged gateway enforcement
limitations in rate_limiting_audit.md still apply. There is no new secret or
ordinary-user admin access. All request values use bound parameters/static SQL.

## Existing records

Existing pending/approved rider requests without allocations reduce availability
and cannot be approved/paid. Admin may reject them, allowing a new backed request.
An existing paid request without allocations pauses further cash-out until trusted
accounting review links the actual paid amount to the correct delivery earnings.
The migration never guesses those links or marks an unpaid delivery transferred.
Missing/zero historical agreed fees and existing payment adjustments are preserved
for review. Existing paid records with no legacy cash-out request remain excluded
from new cash-outs. A deployment should review these cases before accepting funds.

## Deployment and verification status

Both repositories contain identical copies of:

- 20261013130000_record_completed_rider_earnings.sql
- 20261015100000_complete_rider_payment_flow.sql

Apply once to the shared database, in order, after the existing October identity,
authentication/ownership and gateway migrations from the app repository. The new
flow depends on private.current_rider_id, private.current_farmer_user_id,
private.current_rider_deliveries, the September private payout implementation,
and the gateway hook. Deploy the updated admin API and frontend and compatible
Flutter app together. Older rider clients must update before cash-out.

Local tests: the PGlite harness applies the actual payout, earning and new flow
migrations to isolated fixtures. It checks completion, distinct auth/rider IDs,
partial/full payouts, reservation/rejection, overdraft, duplicate keys/references,
legacy reconciliation, immutable accounting, notification replay, hostile literal
values, owner isolation, direct-write denial and session/gateway guards. It also
runs rider_payment_flow.sql metadata assertions. Flutter tests cover the remote
wallet/parameter contract, failed reads, cash-out retry UUID/cents and fee entry.
Admin API tests cover permissions/validation and the existing payment regressions;
a browser test covers reference entry and history with a mocked API.

Verification results: 34 selected Flutter tests, 10 admin API/database tests,
7 gateway tests and 1 admin browser workflow passed. Both isolated SQL harnesses
passed, including rider_payment_flow.sql assertions. Migration copies match
between repositories. Application sources changed here are at most 200 lines
and contain no prohibited inline styles; existing stylesheet/theme references
are retained. Formatting completed; focused Dart analysis reports no issues and focused admin ESLint passes. Direct Dart commands report a sandbox error
when updating the SDK telemetry session after work; Flutter tests succeeded with
SDK-cache access. Admin production build passes with existing bundle-size/import
warnings. Full-schema/hosted checks below remain separate requirements.

Real simultaneous connections are not simulated by PGlite. Advisory account locks
and row locks need a concurrent staging check before production rollout.
The local full Supabase database at 127.0.0.1:54322 returned ECONNREFUSED.
The full authentication_boundary.sql, application_table_rls.sql,
sql_injection_boundary.sql, existing_account_profile_isolation.sql and
account_data_isolation.sql assertions therefore remain pending in that environment.
Run them plus rider_earnings.sql and rider_payment_flow.sql in local/staging;
use rolled-back metadata checks on hosted data, never production account fixtures.

Hosted migrations/deployment and a real transfer have not been performed.
Production acceptance still requires a real farmer/rider delivery, evidence/COD
completion, balance-backed cash-out, admin transfer/reference, rider refresh and
cross-account checks against the deployed schema. Automatic payment collection
and automatic GCash/bank transfers require a separately configured provider.
