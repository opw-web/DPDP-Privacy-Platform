# demo-company-server

A standalone fake business, **Acme Retail Pvt Ltd**, exposing four
unconnected read-only "systems" over HTTP so the DPDP platform has
something real to discover, sync, map and resolve identities from.

This is a **completely independent project** from `dpdp-platform/`. It has
its own `package.json`, its own lockfile, and no source-code dependency in
either direction. Deleting this folder must leave the platform fully
buildable and testable — see Global Constraint 2 in the spec.

Stack: Fastify 4 + better-sqlite3 + TypeScript. Not NestJS, no Prisma, none
of the platform's conventions apply here.

## Running

```bash
npm install
npm run build
npm start          # listens on http://localhost:5001
```

or:

```bash
docker compose up --build
```

Data lives in `data/demo.sqlite` (gitignored, created automatically on
first `openDb()` call — via `npm start`, `npm test`, or Task 10's
generator).

## Endpoints — copy-paste table

| System     | URL                                              | Auth header                              |
|------------|---------------------------------------------------|-------------------------------------------|
| Marketing  | http://localhost:5001/api/marketing/customers      | `Bearer demo_marketing_readonly_123`      |
| Sales      | http://localhost:5001/api/sales/customers          | `Bearer demo_sales_readonly_456`          |
| Support    | http://localhost:5001/api/support/users            | `Bearer demo_support_readonly_789`        |
| E-commerce | http://localhost:5001/api/ecommerce/customers      | `Bearer demo_ecom_readonly_012`           |

`GET /health` is public (no auth) and always returns `{ "status": "ok" }`.

Every `/api/*` route:
- requires the **exact** bearer key for that system — any other value
  (missing, malformed, or another system's valid key) returns **401**.
- accepts only **GET**. Any other HTTP method returns **405** (not 404,
  not 401) — the route exists, the method doesn't.
- accepts `?page=&limit=&updated_since=`.
- returns the envelope `{ "data": [...], "page": 1, "limit": 100, "total": 231 }`.

## Field names (deliberately messy — do not "fix" them)

| System     | Fields |
|------------|--------|
| marketing  | `id, customer_email, mobile_number, first_name, surname, city, subscribed_on, campaign_source` |
| sales      | `crm_id, primary_email, contact_no, full_name, billing_pincode, account_status, lifetime_value` |
| support    | `user_ref, email_address, phone, name, last_ticket_at, tickets_count` |
| ecommerce  | `customer_code, email, phone_number, first_name, last_name, dob, address_line_1, city, state, pincode, total_orders, total_spent` |

Each system uses different names for the same concepts (email, phone,
name) on purpose. Field mapping in the platform is a real step, not a
formality, because these four APIs disagree with each other the way real
company systems do.

## `updated_since` behaviour — per system

`updated_since` is always accepted as an ISO-8601 string query param. What
it does depends on whether the underlying system actually tracks a
modification time:

- **marketing** — filters on `subscribed_on` (`subscribed_on >= updated_since`).
  This is the obvious candidate: it's the only timestamp this table has,
  representing when the person joined/was last touched by a campaign.
- **support** — filters on `last_ticket_at` (`last_ticket_at >= updated_since`).
  Also an obvious candidate: the most recent ticket activity for that
  user.
- **sales** — has **no timestamp column at all** in this schema (no
  created/updated/modified field). `updated_since` is accepted but has
  **no effect**: every call returns the full filtered result set
  regardless of what's passed. This mirrors a real CRM export endpoint
  that doesn't expose row-level modification times.
- **ecommerce** — also has **no modification-timestamp column**. `dob` is
  a date of birth, not an update time, so it cannot be (and is not) used
  for this. `updated_since` is accepted but has **no effect**, same as
  sales.

Callers relying on `updated_since` for incremental sync against sales or
ecommerce should expect a full resync every time — there is nothing in
the messy schema of either system for the demo server to filter on, which
is itself realistic: not every real system tracks that.

## Access log

Every request logs one line to stdout:

```
[access] <METHOD> <path> <statusCode>
```

`<path>` has its query string stripped before logging, because query
params on these routes (`updated_since`, pagination) can end up carrying
personal data indirectly and shouldn't be persisted in a log. This is
what Check 3 in the spec watches during a full sync to prove only `GET`
requests ever reached the demo server.

## Schema

`src/db.ts` exports `openDb()`, which opens (and lazily creates) a
better-sqlite3 connection to `data/demo.sqlite` and ensures four tables
exist, one per system, with exactly the messy field names above as
columns.

Set `DEMO_DB_PATH` to point `openDb()` at an alternate file (used by the
test suite so it never touches the real `data/demo.sqlite`).

## Demo dataset (`npm run seed`)

```bash
npm run seed        # populates data/demo.sqlite with the demo dataset
```

`src/seed/generate.ts` deterministically generates **exactly 500 raw
records** across the four systems above, representing **exactly 327
distinct people** once the platform's identity-resolution rules (spec
§4.4) run over them. It is seeded (`src/seed/rng.ts`, a mulberry32 PRNG)
and safe to re-run: it wipes and rebuilds the four tables from the same
seed every time, producing byte-identical row data run over run — no
`Math.random()`, `Date.now()`, or unseeded UUIDs anywhere in the seed
module.

The dataset deliberately includes:

- people appearing in 2 or 3 systems, linked by a shared normalized email
  or phone (never by name alone)
- capitalisation variants (`Aman Sharma` / `aman sharma` / `A. Sharma`)
- phone format variants (`98765 43210`, `+91-98765-43210`,
  `09876543210`, ...) that all normalize to the same value
- secondary emails (personal + work) for the same person
- ~30 records with no email, ~25 with no phone
- ~12 records with a conflicting field (two different cities for one
  person), feeding the GO-03 conflict count
- **exactly 2 different people both named "Rahul Verma"** — sharing no
  email, phone, pincode or DOB, so they can never auto-link and never
  even raise a review candidate (see `src/seed/personas.ts`)
- **exactly 4 possible-duplicate pairs** — same name-key **and** same
  postal code, no shared email/phone — built entirely within/between
  `sales` and `ecommerce`, the only two systems with a postal-code
  column
- **exactly 6 ecommerce records** with a `dob` making the person under
  18, computed against a **fixed reference date of `2026-01-01`**
  (declared as `DOB_REFERENCE_DATE` in `src/seed/personas.ts`) so the
  count cannot drift as real time passes

### Personas

| Person | Why they matter |
|---|---|
| Aman Sharma | In marketing, sales and support — the flagship 3-way merge |
| Neha Rao | Email in sales, phone-only in support — proves phone matching |
| Raj Patel | Two emails, one person — multi-identifier profile |
| Sara Khan | E-commerce only — the simple single-source case |
| Vikram Nair | Possible-duplicate pair — must reach the review queue |
| Rahul Verma ×2 | Two different humans, same name — must NOT merge |
| Ishaan Gupta | DOB under 18 — surfaces the children's-data gap (CH-01) |

## Testing

```bash
npm test
```

Uses Node's built-in test runner (`node --test`) with `ts-node/register`,
and Fastify's `app.inject()` — no server actually needs to listen, no
extra HTTP client dependency.

`test/dataset.test.ts` seeds a throwaway database and asserts every
number in the "Demo dataset" section above against it, including a
reimplementation of the platform's matching rules (`src/seed/match.ts`,
not used by the server — for the generator's own self-check only) run
over the generated rows, and determinism (two independent seed runs
produce identical row hashes).
