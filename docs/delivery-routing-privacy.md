# Delivery routing privacy

Delivery routing requests contain exact pickup, destination, and sometimes live
rider coordinates. Treat these coordinates as sensitive operational and personal
data. Agrisell disables road-route requests unless the frontend is built with an
explicitly approved `VITE_DELIVERY_ROUTING_URL`.

## Approved deployment options

Use either:

1. An Agrisell-controlled OSRM-compatible service, preferably behind the existing
   API domain; or
2. A contracted routing provider whose privacy and retention terms have been
   reviewed and recorded.

Do not configure `router.project-osrm.org`. The application rejects that public
demonstration host even when it is supplied explicitly. Production endpoints must
use HTTPS, and URLs containing credentials, query strings, or fragments are
rejected. Provider credentials must remain in a server-side proxy and must never be
placed in a `VITE_*` variable because Vite variables are public browser assets.

## Required privacy record

Before enabling routing, document the following in the deployment or vendor record:

- service owner and endpoint hostname;
- whether requests travel directly from browsers or through an Agrisell proxy;
- data-processing purpose and permitted secondary uses;
- request-log contents and the shortest supported retention period;
- hosting region and cross-border transfer terms;
- encryption in transit, access controls, and incident-notification terms;
- deletion process and contract/DPA review owner; and
- the date of the latest privacy and security review.

Configure provider-side request logging off where possible. Otherwise, remove or
redact coordinate-bearing URL paths and retain operational logs only for the
documented minimum period. Reassess the provider whenever its endpoint, ownership,
or privacy terms change.

## Failure behavior

If the variable is missing or invalid, pickup, destination, and rider markers still
render locally, but the application does not issue a routing request. The UI reports
that road routing is disabled to protect exact coordinates. This is the expected
safe production behavior until an approved service is available.
