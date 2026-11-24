# Pixel Your Past

Responsive rental website with a shared D1 availability calendar, expiring holds and protected owner controls.

## Agreed rental rules
- Two individually tracked scanners, shared between delivery and local collection.
- 4 days £75; 7 days £95; 14 days £135; 30 days £225.
- Postage included.
- One full day after return reserved for checking and cleaning.
- One working day of outbound postage and one working day of return postage.

## Calendar behaviour
`lib/booking.mjs` calculates all stock windows on the server, using date-only UTC arithmetic and Europe/London for today's date. Delivery is Monday–Friday excluding England/Wales holidays in the official GOV.UK feed saved under content/bank-holidays.json. Refresh that feed before its coverage expires; delivery dates beyond coverage fail closed. First dispatch is the next working day, with delivery the following working day. A non-working rental return date rolls to the next working day at the same price. Local collection is offered daily pending confirmation of opening hours.

Both scanners share one reservations table. A single INSERT…SELECT statement selects and reserves a free scanner, including all transit and cleaning days. D1 serializes writes, preventing read-then-write races. Holds expire after 15 minutes; expired holds and cancelled rows do not consume inventory. Each signed-in visitor can have one active hold. Prices are calculated server-side. Inventory reads use a primary D1 session.

The `/admin` calendar records manual rentals and servicing blocks, and cancels reservations. API authorization checks the platform-authenticated email against the ADMIN_EMAIL runtime secret on every operation. The current Site is owner-private; preserve that audience. Manual reservations do not imply payment received. References should contain order codes, not sensitive customer data. Cancellation releases availability and does not process refunds.

## Still needed before customer checkout
Stripe Checkout and verified, idempotent payment webhooks are not connected. Holds are explicitly NOT confirmed rentals. Do not mark payment successful based on a browser redirect. Payment completion must atomically convert a still-active hold, with a defined expiry/late-payment recovery policy. Confirmation emails and customer contact capture remain to be added.

Confirm return cut-off times, delivery service area, collection address/hours, collection pricing, payment account and customer terms before opening to customers. Collection currently uses the same rental price. The return date is start date + package days; postal returns roll forward over non-working days. Unexpected late returns require owner intervention before the next dispatch.

## Development
Use the Sites Vinext starter scripts for installation, build and preview. Generate migrations with `npm run db:generate`; apply them locally with the documented Wrangler command before preview. `node --test tests/booking.test.mjs` covers logistics, API authorization, lifecycle and independent-connection concurrent reservations. `.dev.vars` is ignored and can use ADMIN_EMAIL=seedy@sites.test with the starter's loopback-only mock sign-in. The static preview.cjs is historical and does not serve the database-backed calendar.
