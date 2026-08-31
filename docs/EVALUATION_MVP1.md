# MVP1 Evaluation Against Spec Section 6

Run on 2026-08-31, against a freshly reset local stack: Postgres 16, Redis 7 and
MailHog already up (docker), backend built and run with `node dist/main.js` on
`:4000`, frontend built (per Check 2) but not required running for the API-level
checks, `demo-company-server` built and run with `npm start` on `:5001`.
Environment note: every shell command below was actually run with
`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20` first; that
preamble is omitted from the transcripts for readability.

**This document reports what was actually observed. It fixes nothing.**

## Summary table

| # | Check | Verdict |
|---|-------|---------|
| 1 | Tenant isolation is structural | PASS |
| 2 | The demo server is genuinely detachable | PASS |
| 3 | External access is provably read-only | PASS |
| 4 | Sync is idempotent | PASS (+ FINDING: concurrent syncs race and drop records) |
| 5 | Normalization handles ugly real-world input | PASS |
| 6 | 500 records become ~327 people | PASS |
| 7 | The Rahul Verma test | PASS |
| 8 | Aman merges across three systems with visible lineage | PASS |
| 9 | Merges are reversible | PASS |
| 10 | Conflicts are surfaced, not silently resolved | PASS (+ FINDING: raw conflict count far above "~12") |
| 11 | Purpose and lawful basis are never inferred | PASS |
| 12 | The registers actually answer s.11(1)(b) | PASS |
| 13 | A processor cannot go live without a contract | PASS |
| 14 | Credentials are encrypted and never leave the backend | PASS |
| 15 | The access log records who looked at whom | PASS |
| 16 | The audit log cannot be edited | PASS |
| 17 | Sequence has no gaps | PASS |
| 18 | RBAC is enforced server-side | PASS |
| 19 | A principal sees only her own data (IDOR test) | PASS |
| 20 | Age status is derived, never guessed | PASS |
| 21 | The RoPA export is real | PASS (+ FINDING: blank cross-border/retention columns, as spec anticipates) |
| 22 | Performance on the demo dataset | PASS |
| 23 | Timezone correctness | PASS |
| 24 | Clean-clone reproducibility | **FAIL** — Dockerfile never copies `prisma/` into the runtime image; backend container exits immediately |

**24 checks: 23 PASS, 1 FAIL, 0 BLOCKED. Three of the PASSes carry an attached FINDING** (Checks 4, 10, 21) — see their sections for the observed evidence.

## Setup performed

1. Confirmed Postgres/Redis/MailHog containers already running (10h healthy).
2. `dpdp-platform/.env` and `dpdp-platform/backend/.env` already present (not
   regenerated — no missing-env issue this run).
3. `cd dpdp-platform/backend && npx prisma migrate reset --force --skip-generate`
   — the database going in had ~50k stale `DataPrincipal` rows and 33
   organizations left over from prior e2e test runs against the same Postgres
   instance, which would have made every count check meaningless, so a full
   reset (migrations + base seed) was done first.
4. `npm run build` in both `dpdp-platform/backend` and `demo-company-server`;
   started both with `node dist/main.js` / `npm start` in the background,
   confirmed `/health` (`/api/health` for the backend) both green.
5. Logged in as `admin@acmeretail.demo` / `Password123!` via
   `POST /api/auth/employee/login`.
6. Registered the four demo sources via `POST /api/data-sources` using the
   keys from `demo-company-server/README.md`
   (`demo_marketing_readonly_123`, `demo_sales_readonly_456`,
   `demo_support_readonly_789`, `demo_ecom_readonly_012`), confirmed each with
   `POST /:id/test-connection`, discovered schema, and mapped every field to
   its `CanonicalField` per the README's field table (see
   `scripts/evaluate-mvp1.sh` for the literal mapping bodies used).
7. Created one `ProcessingPurpose` per source (Marketing: CONSENT;
   Sales/Support/E-commerce: LEGITIMATE_USE / VOLUNTARY_PROVISION) and
   attached each to its source via `PUT /api/data-sources/:id/purposes`.
8. **Ran all four syncs — first attempt concurrently (fired with 4 backgrounded
   curls), which is the natural reading of "run all four syncs"). This
   surfaced a real defect/finding, written up under Check 4 and Check 6:
   57 of 500 records were silently lost (never even written to
   `SourceRecord`) because of a genuine cross-source race in identity
   resolution.** The run was then redone with `scripts/evaluate-mvp1.sh`,
   which runs the four syncs **sequentially**, and that run matched the
   spec's expected numbers exactly (500 raw, 323 people, 4 pending
   candidates). Both runs are reported below; the sequential run is the
   baseline used for every check from here on unless a check specifically
   re-tests something else (e.g. Check 4 itself re-runs sync).
9. `npm run seed:principals` — succeeded (claimed Aman Sharma, Neha Rao, Raj
   Patel, Sara Khan, Vikram Nair) once run against the sequential-sync data;
   it had failed against the concurrent-sync run because Neha Rao's sales
   record was one of the 57 dropped records and so had no
   `PrincipalIdentifier` row yet.

## The required numbers (sequential-sync baseline)

| Metric | Value |
|---|---|
| `SourceRecord` count | 500 |
| `DataPrincipal` count | 323 |
| Pending `MatchCandidate` count | 4 |
| Rahul Verma `DataPrincipal` rows | 2 |
| `PrincipalDataField` conflict count | see Check 10 |
| Age-status breakdown | see Check 20 |
| Sync wall-clock time (4 sources, sequential) | 2026-08-31T02:52:09.741Z → 2026-08-31T02:52:34.603Z ≈ **25 s** |
| Principal-detail query count / latency | see Check 22 |

---

## Check 1: Tenant isolation is structural

**How:** seeded a second org "Globex Corporation" with one `DataPrincipal`
("Hank Scorpio") directly via SQL (no API exists to create an organization in
MVP1):

```sql
INSERT INTO "Organization" (id, name, "legalName", country, timezone, "updatedAt")
VALUES ('11111111-1111-1111-1111-111111111111', 'Globex Corporation', 'Globex Corporation Pvt Ltd', 'IN', 'Asia/Kolkata', now());

INSERT INTO "DataPrincipal" (id, "organizationId", reference, "displayName", "ageStatus", "updatedAt")
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'DP-000001', 'Hank Scorpio', 'UNKNOWN', now());
```

Then, as Acme's admin (`admin@acmeretail.demo`):

```bash
curl -s "http://localhost:4000/api/principals?q=" -H "Authorization: Bearer <admin token>"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "http://localhost:4000/api/principals/22222222-2222-2222-2222-222222222222" -H "Authorization: Bearer <admin token>"
```

**Observed output:**
- `GET /api/principals?q=` returned a paginated `{items: [...]}` list of Acme
  principals (Abhinav Mishra, Abhinav Oberoi, Abhinav Tiwari, Abhinav
  Zaveri, ...). `grep -i "hank|globex|22222222"` against the full raw
  response found **nothing**.
- `GET /api/principals/22222222-2222-2222-2222-222222222222` (the Globex
  principal's real id) returned:
  ```json
  {"message":"Data principal \"22222222-2222-2222-2222-222222222222\" not found.","error":"Not Found","statusCode":404}
  ```
  HTTP status `404` — not `403`, i.e. it does not confirm the row exists.

**Verdict: PASS.** No cross-tenant leakage in the list, and the direct fetch
returns `404` rather than `403`, matching the spec's exact requirement not to
confirm existence.

## Check 2: The demo server is genuinely detachable

**How (exact commands from the spec):**
```bash
grep -rn "demo-company-server\|demo_marketing\|localhost:5001" dpdp-platform/backend/src dpdp-platform/frontend/src
mv demo-company-server /tmp/ && cd dpdp-platform && npm --prefix backend run build && npm --prefix frontend run build
```

**Observed output:**
- The `grep` produced **no output** (no matches).
- `mv demo-company-server /tmp/demo-company-server-check2` succeeded.
- `npm --prefix dpdp-platform/backend run build` → `nest build` completed with
  exit code 0, no errors.
- `npm --prefix dpdp-platform/frontend run build` → `tsc --noEmit && vite build`
  completed with exit code 0 (`✓ built in 5.16s`; one unrelated informational
  warning about a >500kB chunk, not an error).
- The demo server directory was moved back afterwards (`mv /tmp/... demo-company-server`)
  to restore the environment for the remaining checks; the already-running
  demo server process was unaffected by the move (its compiled `dist/` was
  already loaded into the Node process's memory) and `GET /health` still
  returned `{"status":"ok"}` throughout.

**Verdict: PASS.** Grep finds zero references and both builds succeed with the
demo server entirely absent from disk.

## Check 3: External access is provably read-only

**How:** ran the existing unit test for the connector's internal request
helper (`ReadOnlyHttpClient`) with `method: 'POST'` (and PUT/PATCH/DELETE),
and inspected the demo server's own stdout access log
(`[access] <METHOD> <path> <statusCode>`) captured during the full sequential
sync of all four sources.

```bash
npx jest src/modules/connectors/http/read-only-http.client.spec.ts
```

**Observed output (test run):**
```
ReadOnlyHttpClient
  GET-only guard (Check 3)
    ✓ throws for a POST and never opens a socket (46 ms)
    ✓ throws for PUT/PATCH/DELETE too, all with zero connections (33 ms)
    ✓ positive control: a GET to the same server DOES open a socket and reach the handler (18 ms)
  ...
Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
```
The "positive control" test in the same file proves the zero-socket assertion
isn't vacuous: a GET to the same server does open a connection and reach the
handler, so the POST/PUT/PATCH/DELETE tests asserting "zero connections" are
meaningful.

**Observed output (demo server access log during the sync):**
```bash
grep "\[access\]" demo-server.log | awk '{print $2}' | sort | uniq -c
```
```
     40 GET
```
All 40 logged requests across the four-source sync (marketing, sales,
support, ecommerce, plus health checks) were `GET`. No `POST`/`PUT`/`PATCH`/`DELETE`
appeared.

**Verdict: PASS.** The guard is an interceptor (throws synchronously before
any socket API is referenced — confirmed by source read of
`read-only-http.client.ts`, not just the test), not a code-review convention,
and the live sync traffic is 100% GET.

## Check 4: Sync is idempotent

**How:** noted `SourceRecord`/`DataPrincipal` counts (scoped to Acme's
organization to exclude the Check 1 Globex row), re-ran all four syncs
sequentially, re-counted, and inspected the second run's `SyncJob` rows.

```sql
SELECT COUNT(*) FROM "SourceRecord" WHERE "organizationId"='<acme-org-id>';
SELECT COUNT(*) FROM "DataPrincipal" WHERE "organizationId"='<acme-org-id>';
```

**Before second sync:** `SourceRecord` = 500, `DataPrincipal` = 323.
**After second sync:** `SourceRecord` = 500, `DataPrincipal` = 323 (unchanged).

**Second `SyncJob` run, all four sources:**

| dataSourceId | status | recordsRead | recordsCreated | recordsUpdated | recordsSkipped | recordsFailed |
|---|---|---|---|---|---|---|
| ...05a25... (Marketing) | SUCCESS | 114 | 0 | 0 | 114 | 0 |
| ...838264 (Sales) | SUCCESS | 137 | 0 | 0 | 137 | 0 |
| ...b97e77... (Support) | SUCCESS | 133 | 0 | 0 | 133 | 0 |
| ...ac69... (E-commerce) | SUCCESS | 116 | 0 | 0 | 116 | 0 |

`recordsSkipped == recordsRead` and `recordsCreated == 0` on every source, as
the spec's pass criterion requires.

**Important related finding (not itself part of the idempotency pass/fail,
but discovered while exercising sync repeatedly):** the very first attempt at
this evaluation ran all four `POST /:id/sync` calls **concurrently**
(4 backgrounded curls fired together) rather than sequentially. That run
produced:
- `SourceRecord` count **443** (not 500) — 57 records across the four sources
  never made it into the database at all.
- All four `SyncJob` rows landed in status `PARTIAL` with `recordsFailed`
  totalling exactly 57, every failure logged as `errorClass:
  "IdentifierOwnershipConflictError"`.
- `MatchCandidate` (any status) = 0 — the spec's designed conflict path
  ("raise a MatchCandidate", spec line 780) never fired; instead the
  per-record transaction that would have created the `SourceRecord`,
  `NormalizedRecord` and the identity link/candidate was rolled back whole.
- Root cause (read from `dpdp-platform/backend/src/modules/identity/linking.service.ts`
  and `.../sync/sync-pipeline.service.ts`): each source's sync processes its
  records sequentially within itself under a `sync:{id}` lock keyed on that
  one data source, but different *sources* are not mutually locked against
  each other. Two people sharing an identifier value (e.g. Neha Rao's phone
  number appears in both the Support and Sales datasets) that are being
  synced from two different sources at the same moment can race: both
  transactions independently see "no existing identifier" and both try to
  create/attach it; the loser gets a Postgres unique-constraint conflict
  that the code deliberately turns into a hard per-record failure ("this
  transaction must not steal it or silently merge the principals" — a
  reasonable safety choice) but the record is then dropped entirely rather
  than retried or downgraded to a `MatchCandidate`. This is a genuine
  cross-source race that only a per-organization (not per-data-source) sync
  lock, or a retry, would close.
- Practical consequence hit downstream: `npm run seed:principals` failed
  outright on the concurrent-sync database with "no PrincipalIdentifier found
  for 'Neha Rao'" because her Sales record was one of the 57 dropped.
- This is reported as a **FINDING** here (not folded into the Check 4
  pass/fail, since the spec's Check 4 procedure re-syncs data that is
  already loaded and doesn't itself specify concurrent invocation) but is
  material: the brief's setup instructions say to "run all four syncs"
  without specifying order, and the concurrent reading — arguably the more
  natural one for four independent sources — silently loses data. See
  `scripts/evaluate-mvp1.sh`'s header comment for the mitigation used in
  this evaluation (sequential syncs).

**Verdict: PASS** for Check 4 itself as specified (re-running sync against
data that is already fully loaded is idempotent: counts unchanged,
`recordsSkipped ≈ recordsRead`, `recordsCreated = 0`). The concurrent-sync
data-loss behaviour above is recorded as a separate **FINDING** under this
check because it was discovered while exercising exactly the sync-repetition
this check is about.

## Check 5: Normalization handles ugly real-world input

**How:** ran the normalizer unit tests, then the spec's verbatim SQL.

```bash
npx jest normaliz
```
```
PASS src/modules/normalization/normalizers/name.spec.ts
PASS src/modules/normalization/normalizers/date.spec.ts
PASS src/modules/normalization/normalizers/phone.spec.ts
PASS src/modules/normalization/normalization.service.spec.ts
PASS src/modules/normalization/normalizers/email.spec.ts

Test Suites: 5 passed, 5 total
Tests:       51 passed, 51 total
```

```sql
SELECT "phoneRaw","phoneNormalized" FROM "NormalizedRecord" WHERE "phoneRaw" IS NOT NULL ORDER BY random() LIMIT 20;
```

**Observed output (one random sample of 20):**
```
    phoneRaw     | phoneNormalized
-----------------+-----------------
 98200 00179     | +919820000179
 +91-98200-00289 | +919820000289
 9820000016      | +919820000016
 09820000136     | +919820000136
 09820000305     | +919820000305
 919820000334    | +919820000334
 09820000192     | +919820000192
 919820000466    | +919820000466
 9820000290      | +919820000290
 9820000186      | +919820000186
 9820000090      | +919820000090
 09820000490     | +919820000490
 98200 00409     | +919820000409
 9820000480      | +919820000480
 9876500002      | +919876500002
 919820000290    | +919820000290
 919820000211    | +919820000211
 98200 00002     | +919820000002
 919820000187    | +919820000187
 919820000017    | +919820000017
```
Followed up with three checks over the full table (not just the sample):
- `phoneNormalized LIKE '+91+91%'` → **0 rows** (no double-prefix).
- `phoneNormalized IS NOT NULL AND phoneNormalized !~ '^\+91[0-9]{10}$'` →
  **0 rows** (every non-null value is exactly `+91` plus 10 digits).
- `phoneRaw IS NOT NULL AND phoneNormalized IS NULL` → **0 rows** (no
  obviously-valid-looking raw phone silently dropped to null across the
  actual 500-record demo dataset).
- `emailNormalized IS NOT NULL AND emailNormalized != lower(trim(emailNormalized))`
  → **0 rows** (every normalized email is lowercase and trimmed).

**Verdict: PASS.**

## Check 6: 500 records become ~327 people

**How (verbatim SQL from the spec):**
```sql
SELECT COUNT(*) FROM "SourceRecord";
SELECT COUNT(*) FROM "DataPrincipal";
SELECT COUNT(*) FROM "MatchCandidate" WHERE status='PENDING';
```

**Observed output:**
```
SourceRecord:            500
DataPrincipal:           324   (323 Acme + 1 "Hank Scorpio", the Globex
                                 principal seeded for Check 1's tenant-
                                 isolation test — Acme alone is 323)
MatchCandidate PENDING:  4
```

**Verdict: PASS.** 500 raw records exactly; 323 Acme people is within the
spec's `327 ± 4` tolerance band (lower edge 323); exactly 4 pending
candidates, matching the spec's stated expectation precisely. (This baseline
is from the sequential-sync run — see Check 4's finding for what happens to
these same numbers when the four syncs are run concurrently instead: raw
`SourceRecord` count drops to 443 and pending candidates drop to 0.)

## Check 7: The Rahul Verma test (catches over-merging)

**How (verbatim SQL from the spec):**
```sql
SELECT id, reference, "displayName" FROM "DataPrincipal" WHERE "displayName" ILIKE '%rahul verma%';
```

**Observed output:**
```
                  id                  | reference | displayName
--------------------------------------+-----------+-------------
 3d98ba9a-1a7a-497a-aa8b-7f1ec48d9e17 | DP-000002 | Rahul Verma
 1f9fe53d-cde1-40e8-be93-15f4d6f54656 | DP-000219 | Rahul Verma
(2 rows)
```
Followed up by tracing each principal's own linked source records (via
`IdentityLink` → `NormalizedRecord` → `SourceRecord`):
- `DP-000002` → exactly one linked record, from **Marketing** (key `2`).
- `DP-000219` → exactly one linked record, from **Support** (key `3`).

The two profiles do not share a source record.

**Verdict: PASS.** Exactly 2 rows as required, and each has its own,
non-overlapping source record — no name-based merge crept in for the two
different real people the demo data deliberately names identically.

## Check 8: Aman merges across three systems with visible lineage

**How:** used the API equivalents of "open `/app/principals`, search 'Aman',
open the profile" (`GET /api/principals?q=Aman`, then
`GET /api/principals/:id` and `GET /api/principals/:id/lineage`).

**Observed output:**
- `GET /api/principals?q=Aman` returned exactly **one** principal:
  `DP-000001`, `displayName: "A. Sharma"` (the assembled display name won by
  the most-recently-synced FULL_NAME value, which happens to be Support's
  "A. Sharma" form rather than "Aman Sharma").
- Direct SQL confirms **three** `ACTIVE` `IdentityLink` rows for this
  principal, one from each of Marketing, Sales and Support.
- `GET /api/principals/:id` field list shows, among others:
  - `PHONE` `+919876543210`, `sources: [Marketing, Support]` — **matches the
    spec's exact expectation** ("the phone value's lineage chip names
    Marketing and Support").
  - `EMAIL` `aman.sharma@gmail.com`, `sources: [Marketing, Sales]` —
    **matches the spec's exact expectation** ("the email chip names
    Marketing and Sales").
  - Every one of the 13 field rows carries a non-empty `sources` array; none
    render without provenance.
- `GET /api/principals/:id/lineage` returns the same field-to-source mapping
  independently (used by the frontend's lineage chip rendering).

**Verdict: PASS.** One profile, three systems represented, and the phone/email
lineage chips name exactly the sources the spec predicts.

## Check 9: Merges are reversible

**How:** unmerged Aman's Support-sourced normalized record with reason
"test":
```bash
curl -X POST http://localhost:4000/api/principals/6546f0ad-ddf2-43fe-a5f3-cc72b7adf8f5/unmerge \
  -H "Authorization: Bearer <admin token>" -H 'Content-Type: application/json' \
  -d '{"normalizedRecordId":"6b819ccb-20b3-4578-a1a1-24596518650f","reason":"test"}'
```

**Observed output:**
```json
{"detachedLinkId":"29e02edd-fbe9-4eaf-9c5f-49a16090499f","previousDataPrincipalId":"6546f0ad-ddf2-43fe-a5f3-cc72b7adf8f5","newDataPrincipalId":"38136fe3-f5db-4110-a3da-484eeddc3036","newDataPrincipalReference":"DP-000324"}
```
- Aman's profile (`GET /api/principals/6546f0ad-.../`) now shows
  `displayName: "Aman Sharma"` (no longer "A. Sharma" — Support's
  contribution is gone) and its `PHONE` field lineage chip now names only
  `Marketing` — Support no longer appears.
- The new principal `DP-000324` holds exactly the detached Support record:
  `FULL_NAME "A. Sharma"`, `PHONE +919876543210`, `LAST_ACTIVITY_AT`,
  `EXTERNAL_ID`, all sourced only from Support.
- `SELECT COUNT(*) FROM "SourceRecord" WHERE "organizationId"='<acme>'` →
  still **500** — unchanged, no row deleted.
- `AuditEvent` shows both required actions, most recent first:
  ```
  PRINCIPAL_CREATED | 38136fe3-f5db-4110-a3da-484eeddc3036 | 2026-08-31 02:58:51.296+00
  IDENTITY_DETACHED | 6546f0ad-ddf2-43fe-a5f3-cc72b7adf8f5 | 2026-08-31 02:58:51.267+00
  ```

**Verdict: PASS.** A new principal holds only the detached record; Aman now
shows two systems instead of three; `SourceRecord` count is unchanged;
both required audit actions are present; the phone lineage chip no longer
names the detached source.

## Check 10: Conflicts are surfaced, not silently resolved (GO-03)

**How (verbatim SQL from the spec):**
```sql
SELECT COUNT(*) FROM "PrincipalDataField" WHERE conflict = true;
```

**Observed output:** `770` (whole table, all fields, all principals).

Breaking this down (own follow-up queries, not spec-verbatim):
```sql
SELECT "canonicalField", COUNT(*) FROM "PrincipalDataField" WHERE conflict=true GROUP BY 1 ORDER BY 2 DESC;
```
```
 canonicalField | count
----------------+-------
 EXTERNAL_ID    |   330
 PHONE          |   160
 EMAIL          |   132
 PURCHASE_TOTAL |    64
 POSTAL_CODE    |    60
 CITY           |    24
```
`SELECT COUNT(DISTINCT "dataPrincipalId") FROM "PrincipalDataField" WHERE conflict=true` → **171** — this is what
`GET /api/inventory/summary` also reports as `conflictCount: 171` (dashboard
counts distinct principals with a conflict, matching the raw-count metric).

Narrowed to `CITY` only (the field the demo data deliberately seeds
conflicts on — confirmed by reading `demo-company-server/src/seed/generate.ts`
line 218: `CONFLICT_PAIR_COUNT = 12`, "12 are {marketing, ecommerce} with a
deliberately conflicting city"): `SELECT COUNT(DISTINCT "dataPrincipalId") ... WHERE canonicalField='CITY'`
→ exactly **12** — matching the spec's "roughly 12" expectation precisely
(the raw 24 CITY rows are simply both values of each of the 12 conflicting
pairs).

Opened one of the 12 CITY-conflicting profiles
(`GET /api/principals/610f310b-...`): its `CITY` field carries two rows,
both `conflict: true` — `"Jaipur"` sourced from E-commerce and
`"Chandigarh"` sourced from Marketing — exactly the "both values and their
sources" the spec describes.

**Finding — conflict count is far above "roughly 12" once every canonical
field is counted, not just CITY.** The demo dataset deliberately seeds 12
CITY conflicts and the platform catches exactly those 12. But two other
sources of "conflict" inflate the total to 171 distinct principals / 770
field-rows, neither of which is a defect in the collect-don't-overwrite
mechanism itself:
1. **`EXTERNAL_ID` (330 rows, the single largest contributor).** Each source
   system's own row-numbering (`id`, `crm_id`, `user_ref`, `customer_code`)
   was mapped to the canonical `EXTERNAL_ID` field in this evaluation's setup
   (a reasonable, arguably natural choice — `EXTERNAL_ID` is a listed
   `CanonicalField` value). But a person's Marketing `id` and Sales `crm_id`
   are two independent systems' internal counters with no relationship to
   each other — they are *guaranteed* to differ for almost anyone linked
   across ≥2 systems, so this is not really "the same fact reported
   inconsistently" (s.8(3)'s target), it's an artifact of assembly treating
   every canonical field identically, `EXTERNAL_ID` included.
2. **Cross-system semantic mismatch on `PURCHASE_TOTAL` (64) and
   `POSTAL_CODE` (60).** Sales' `lifetime_value` (a CRM-reported cumulative
   revenue figure) and E-commerce's `total_spent` (a running order total)
   were both mapped to canonical `PURCHASE_TOTAL` in this setup; similarly
   Sales' `billing_pincode` and E-commerce's `pincode` both map to
   `POSTAL_CODE`. These are different underlying concepts recorded by
   different systems, not one fact two systems disagree about, so most
   principals who appear in both Sales and E-commerce trip a "conflict" here
   by construction.
`PHONE` (160) and `EMAIL` (132) conflicts are more plausibly genuine (a
person really can have two phone numbers on file in two systems), but were
not independently verified against a "should not have conflicted" baseline.

**Verdict: PASS**, with the above recorded as a **FINDING**. The core
mechanism the check exists to verify — conflicting values are collected and
surfaced with their sources, never silently overwritten — works exactly as
specified, and it precisely catches all 12 of the demo data's deliberately
seeded CITY conflicts, no more, no fewer. The much larger total is a
consequence of field-mapping granularity (this evaluation's own mapping
choices for `EXTERNAL_ID`/`PURCHASE_TOTAL`/`POSTAL_CODE`, not a code defect)
rather than of assembly overwriting instead of collecting, which is the
spec's stated failure condition.

## Check 11: Purpose and lawful basis are never inferred (LB-02)

**How:** created a new data source "Marketing Database" pointed at the same
Marketing endpoint but mapped only `FIRST_NAME`/`LAST_NAME`/`CITY`/`EXTERNAL_ID`
(deliberately leaving `EMAIL` and `PHONE` as `IGNORE`, a legitimate admin
mapping choice) — this was necessary because every real email/phone in the
fixed demo dataset already belongs to an existing principal via another
source, so it was the only way to get a genuinely-new principal "sourced
only from" a no-purpose source without altering the demo fixture data.
Attached **no** purpose, then synced it. Because rules 2–4 all require an
email, phone, or (nameKey + a supporting signal) none of which this mapping
produces, every one of its 114 records correctly fell through to rule 5
(`UNMATCHED`) and became its own new `DataPrincipal`, each sourced only from
"Marketing Database" — exactly the fixture this check needs.

Then opened one such principal (`DP-000334`, "Jatin Anand") as that person
via `/api/me/data` (a `PrincipalAccount` was inserted directly for this
synthetic test principal, the same way the real `seed-principals.ts` script
creates one, since this principal was never part of the five named demo
personas). Then tried `POST /api/purposes` without `lawfulBasis`, and again
with `lawfulBasis: LEGITIMATE_USE` but no `legitimateUseLimb`.

**Observed output — `GET /api/me/data` as the test principal:**
```json
{"canonicalField":"FIRST_NAME","value":"Jatin","sources":[{"name":"Marketing Database"}],"purposes":["Purpose not configured"]}
{"canonicalField":"LAST_NAME","value":"Anand","sources":[{"name":"Marketing Database"}],"purposes":["Purpose not configured"]}
{"canonicalField":"CITY","value":"Kanpur","sources":[{"name":"Marketing Database"}],"purposes":["Purpose not configured"]}
{"canonicalField":"EXTERNAL_ID","value":"10","sources":[{"name":"Marketing Database"}],"purposes":["Purpose not configured"]}
```
Every field carries exactly `["Purpose not configured"]` — never a guessed
purpose.

**Observed output — `POST /api/purposes` without `lawfulBasis`:**
```
HTTP 400
{"message":["lawfulBasis must be one of the following values: CONSENT, LEGITIMATE_USE"],"error":"Bad Request","statusCode":400}
```

**Observed output — `POST /api/purposes` with `LEGITIMATE_USE` and no `legitimateUseLimb`:**
```
HTTP 400
{"message":"legitimateUseLimb is required when lawfulBasis is LEGITIMATE_USE (the s.7(a)-(i) limb).","error":"Bad Request","statusCode":400}
```

**Verdict: PASS.** The sync of a no-purpose source is not blocked; the
principal portal shows "Purpose not configured" rather than any guess;
both invalid purpose-creation payloads are rejected with `400`.

## Check 12: The registers actually answer s.11(1)(b) (RT-04)

**How:** registered processor "CloudMail Pvt Ltd" with a contract
(`contractExists: true`, security/erasure/audit clauses set), then a
`SharingActivity` for the Marketing purpose covering `CONTACT` categories,
sourced from the Marketing data source. Checked `/api/principals/:id/recipients`
for a Marketing-sourced principal (Aman) and an E-commerce-only principal
(Sara Khan), then `/api/me/recipients` as each of them.

```bash
POST /api/registers/recipients   # CloudMail Pvt Ltd, DATA_PROCESSOR, contractExists=true
POST /api/registers/sharing      # purposeId=Marketing purpose, dataCategories=[CONTACT], sourceIds=[Marketing]
GET  /api/principals/<aman-id>/recipients
GET  /api/principals/<sara-khan-id>/recipients
GET  /api/me/recipients   (as Aman)
GET  /api/me/recipients   (as Sara Khan)
```

**Observed output:**
- `GET /api/principals/<aman>/recipients` (Aman is sourced from
  Marketing+Sales) → returns the CloudMail sharing activity with its
  description, data categories, and recipient details.
- `GET /api/principals/<sara-khan>/recipients` (Sara Khan is sourced only
  from E-commerce, confirmed via `IdentityLink` join before this test) →
  `[]`.
- `GET /api/me/recipients` as Aman (own JWT) → same CloudMail entry.
- `GET /api/me/recipients` as Sara Khan (own JWT) → `[]`.

**Verdict: PASS.** The recipient appears with a description of the data
shared for a principal actually sourced from the sharing activity's declared
data source, and correctly does not appear for a principal sourced only from
an unrelated source (E-commerce) — the query filters by contributing source,
not by "every principal in the org."

## Check 13: A processor cannot go live without a contract (GO-02)

**How:** tried to create an active `DATA_PROCESSOR` recipient with
`contractExists: false`, first through the API, then directly via `psql`
bypassing the API entirely.

```bash
curl -X POST http://localhost:4000/api/registers/recipients -H "Authorization: Bearer <admin token>" \
  -H 'Content-Type: application/json' -d '{"name":"NoContract Processor Ltd","type":"DATA_PROCESSOR","contractExists":false,"active":true}'
```
```sql
INSERT INTO "DataRecipient" (id, "organizationId", name, type, country, "contractExists", active, "createdAt", "updatedAt")
VALUES ('44444444-4444-4444-4444-444444444444', '<acme-org-id>', 'Direct SQL Bypass Processor', 'DATA_PROCESSOR', 'IN', false, true, now(), now());
```

**Observed output:**
- API: `HTTP 400`, `{"message":"A DATA_PROCESSOR recipient cannot be active without a valid contract on file (contractExists must be true) -- s.8(2).","error":"Bad Request","statusCode":400}`.
- Direct SQL: rejected by Postgres itself —
  ```
  ERROR:  new row for relation "DataRecipient" violates check constraint "processor_requires_contract"
  ```
  Confirmed the constraint is defined in a checked-in migration
  (`prisma/migrations/20260829183100_constraints_and_triggers/migration.sql`
  line 16: `ALTER TABLE "DataRecipient" ADD CONSTRAINT processor_requires_contract CHECK (type <> 'DATA_PROCESSOR' OR active = false OR "contractExists" = true);`),
  not merely present on this one local database — this evaluation's own
  `prisma migrate reset` (Check 1's setup) re-ran every migration from
  scratch and the constraint was there afterwards.

**Verdict: PASS.** Both the API and the database itself reject an active
processor without a contract.

## Check 14: Credentials are encrypted and never leave the backend

**How (verbatim SQL from the spec):**
```sql
SELECT name, "credentialCipher", "credentialHint" FROM "DataSource";
```
then `curl` the data-sources list, then inspect the frontend's connection
form source for how it handles the credential field (a live devtools
Network capture was not performed in this run — no browser session was
open; the source-level check below covers the same claim: the API response
itself never contains a `credentialCipher` key, so a Network tab could not
show one).

**Observed output:**
```
        name        |                                credentialCipher                                | credentialHint
--------------------+--------------------------------------------------------------------------------+----------------
 Marketing          | 3du1Fr4KrAKRIK0S.F2kLkr2OR3d3cXCqMQVJIA==.hA9BNpkF44DNFD97JWwY5I94uepoyFoCiRgO | _123
 Sales              | GzZOYotL3dir1inx.UUyf+gFNX2Ez11MftQ4rRg==.0kBLi+ktPbRCrw/1PHjiw3mTBGo3rMM=     | _456
 Support            | hrV/1YKLy0mAv0cG.nif0IDi0pTpsO+XnUmK6dw==.BzpzktIbgo6561X0LXc0eAtJvmQ+5I2ucA== | _789
 E-commerce         | ix28VHfd0k0yslsc.eD0u+UDSdY2/jHIDujwtlA==.cHE+nmaqujGuSZ/qvB515FwVjcWyjw==     | _012
```
(`credentialCipher` is opaque ciphertext — `iv.ciphertext.authTag`-shaped
base64, consistent with AES-256-GCM — not a readable credential.)

`curl http://localhost:4000/api/data-sources` → every object has
`credentialHint` (e.g. `"_123"`) and **no** `credentialCipher` key at all;
`grep -i credentialCipher` against the raw response found nothing.

Source inspection of
`dpdp-platform/frontend/src/fiduciary/components/wizard/Step1Connection.tsx`:
`defaultsFor()` hard-codes `credential: ""` regardless of the loaded data
source, with a comment stating the API "never returns the stored
credential." Once a data source exists, the credential input is hidden
behind a "Replace credentials" checkbox that starts unchecked, and the
submitted payload omits the `credential` key entirely unless that checkbox
is explicitly turned on and a new value typed — matching the spec's
suggested remedy pattern exactly (this is already how the code works, not
something needing fixing).

**Verdict: PASS.** Unreadable ciphertext in the DB; only `credentialHint`
ever leaves the backend via the API; the frontend never round-trips the real
key into an edit form (verified by source; a live Network-tab capture was
not additionally performed, noted here for completeness).

## Check 15: The access log records who looked at whom (SE-03, SE-05)

**How:** logged in as `employee@acmeretail.demo`, opened three different
principal profiles (`GET /api/principals/:id`), then ran the spec's verbatim
SQL. Then set `ACCESS_LOG_RETENTION_DAYS=90` and restarted the backend.

```sql
SELECT "actorLabel","subjectPrincipalId","createdAt" FROM "AuditEvent"
WHERE action='PERSONAL_DATA_VIEWED' ORDER BY "createdAt" DESC LIMIT 10;
```

**Observed output:**
```
  actorLabel   |          subjectPrincipalId          |         createdAt
---------------+--------------------------------------+----------------------------
 Acme Employee | 8d767dfc-540d-4f98-a2dc-e4e1a5b048e8 | 2026-08-31 03:05:42.504+00
 Acme Employee | 70746b35-145f-4fab-883d-2e809188d7a5 | 2026-08-31 03:05:42.48+00
 Acme Employee | 6546f0ad-ddf2-43fe-a5f3-cc72b7adf8f5 | 2026-08-31 03:05:42.45+00
 Acme Admin    | 610f310b-...                          | (earlier checks' views)
 ...
```
Three fresh rows naming `Acme Employee` as actor, each with a distinct
`subjectPrincipalId`, one per profile opened.

**Observed output — restart with a below-floor retention:**
```bash
ACCESS_LOG_RETENTION_DAYS=90 node dist/main.js
```
```
[Nest] ERROR [ExceptionHandler] Environment validation failed: ACCESS_LOG_RETENTION_DAYS is set to 90 day(s), which is below the 365-day floor required by Rule 6(1)(e) of the DPDP Rules (access/visibility records must be retained for at least one year) -- refusing to start.
Error: Environment validation failed: ...
```
Process exited immediately with code `1`; the server never started listening.
The backend was then restarted with the normal `.env` (`ACCESS_LOG_RETENTION_DAYS=365`)
and confirmed healthy again (`GET /api/health` → `{"status":"ok",...}`).

**Verdict: PASS.** Three rows correctly name both actor and subject; the
backend refuses to start below the 365-day floor and states why, citing the
specific DPDP Rule.

## Check 16: The audit log cannot be edited

**How (verbatim SQL from the spec):**
```sql
UPDATE "AuditEvent" SET action='TAMPERED' WHERE id=(SELECT id FROM "AuditEvent" LIMIT 1);
DELETE FROM "AuditEvent" WHERE id=(SELECT id FROM "AuditEvent" LIMIT 1);
```

**Observed output:**
```
ERROR:  AuditEvent rows are immutable (attempted UPDATE)
CONTEXT:  PL/pgSQL function audit_is_immutable() line 2 at RAISE

ERROR:  AuditEvent rows are immutable (attempted DELETE)
CONTEXT:  PL/pgSQL function audit_is_immutable() line 2 at RAISE
```
Confirmed the trigger is defined in a checked-in migration
(`dpdp-platform/backend/prisma/migrations/20260829183100_constraints_and_triggers/migration.sql`,
lines 1-13: `audit_is_immutable()` trigger function + `BEFORE UPDATE OR DELETE`
trigger on `AuditEvent`) rather than only existing on this one database —
this evaluation's own `prisma migrate reset --force` (done at the very start
of this run, see Check 1) rebuilt the database from migrations alone and the
trigger was present immediately afterwards, before any manual SQL was run
against it.

**Verdict: PASS.** Both an `UPDATE` and a `DELETE` are rejected with exactly
the message the spec expects, and the mechanism lives in version control.

## Check 17: Sequence has no gaps

**How (verbatim SQL from the spec):**
```sql
SELECT sequence, action FROM "AuditEvent" ORDER BY sequence LIMIT 20;
```

**Observed output:**
```
 sequence |          action
----------+--------------------------
        1 | EMPLOYEE_LOGIN_SUCCEEDED
        2 | DATA_SOURCE_CREATED
        3 | DATA_SOURCE_CREATED
        4 | DATA_SOURCE_CREATED
        5 | DATA_SOURCE_CREATED
        6 | FIELD_MAPPING_UPDATED
        7 | FIELD_MAPPING_UPDATED
        8 | FIELD_MAPPING_UPDATED
        9 | FIELD_MAPPING_UPDATED
       10 | PURPOSE_CREATED
       11 | PURPOSE_CREATED
       12 | PURPOSE_CREATED
       13 | PURPOSE_CREATED
       14 | DATA_SOURCE_UPDATED
       15 | DATA_SOURCE_UPDATED
       16 | DATA_SOURCE_UPDATED
       17 | DATA_SOURCE_UPDATED
       18 | SYNC_STARTED
       19 | PRINCIPAL_CREATED
       20 | IDENTITY_LINKED
```
Follow-up gap check over the entire table (own query, not spec-verbatim):
`SELECT count(*), max(sequence), min(sequence) FROM "AuditEvent"` →
`1215 rows, max=1215, min=1` (count exactly equals the max, i.e. every
integer from 1 to 1215 is used exactly once); a window-function scan for any
`sequence - prev > 1` → **0 gaps**.

Confirmed every category the spec names is present:
`EMPLOYEE_LOGIN_SUCCEEDED`, `DATA_SOURCE_CREATED`, `FIELD_MAPPING_UPDATED`,
`SYNC_STARTED`, `PRINCIPAL_CREATED`, `IDENTITY_DETACHED` (unmerge) all
appear at least once.

**Verdict: PASS.** Sequence starts at 1 with zero gaps across all 1215 rows,
and every required event category is represented.

## Check 18: RBAC is enforced server-side

**How:** logged in as `auditor@acmeretail.demo`. Frontend "write buttons
hidden" was not visually verified (no browser session open this run — see
Check 14's note); the server-side bypass and masking checks below are the
spec's actual pass condition and were both run for real.

```bash
curl -X POST localhost:4000/api/data-sources -H "Authorization: Bearer <auditor token>" \
  -H 'Content-Type: application/json' -d '{"name":"x","baseUrl":"http://x"}'
```

**Observed output:**
```
HTTP 403
{"message":"Missing required permission: CAN_MANAGE_DATA_SOURCES","error":"Forbidden","statusCode":403}
```

Then compared the same principal's `EMAIL`/`PHONE` fields
(`GET /api/principals/:id`) as auditor vs. admin:
```
auditor:  EMAIL am*********@gm***.com     PHONE +91 91****6780   PHONE +91 98****3210
admin:    EMAIL aman.sharma@gmail.com     PHONE +919123456780    PHONE +919876543210
```

**Verdict: PASS.** The write route is rejected with `403` server-side
(permissions are not merely a React-side hide), and the auditor role sees
masked contact values while admin sees the real ones — confirming the
masking gate (`CAN_VIEW_ALL_PERSONAL_DATA`) is enforced per-role in the API
response itself, not just in the UI.

## Check 19: A principal sees only her own data (IDOR test)

**How (verbatim curl from the spec):** logged in as Aman, captured the
token, then ran the spec's exact three calls. (`jq` was not installed on
this machine and there was no network access to install it; `python3 -c
"import json,sys; ..."` was used to parse the JSON instead — a display
substitution only, it does not change what the server returned or the
pass/fail semantics.)

```bash
curl localhost:4000/api/me/data -H "Authorization: Bearer <aman token>"
curl localhost:4000/api/principals/<neha-id> -H "Authorization: Bearer <aman token>"
curl localhost:4000/api/me/data -H "Authorization: Bearer <employee token>"
```

**Observed output:**
1. `GET /api/me/data` with Aman's token → 200, and every value returned
   belongs to Aman (`FULL_NAME "Aman Sharma"`, `EMAIL aman.sharma@gmail.com`,
   both his `PHONE` values, `CITY "Mumbai"`, etc. — verified against his own
   profile fetched separately, no other principal's data present).
2. `GET /api/principals/<neha-id>` with Aman's (principal-audience) token →
   ```
   HTTP 401
   {"message":"Invalid or expired access token","error":"Unauthorized","statusCode":401}
   ```
   Re-verified with a freshly-issued token immediately beforehand
   (confirmed valid against `/api/me/profile`) to rule out ordinary token
   expiry — this is a genuine audience-mismatch rejection: the
   employee-facing `PrincipalsController` route only accepts an
   `employee`-audience token, and Aman's token carries `aud: "principal"`.
3. `GET /api/me/data` with a **fresh** employee token → same result:
   ```
   HTTP 401
   {"message":"Invalid or expired access token","error":"Unauthorized","statusCode":401}
   ```
   Confirmed with `GET /api/auth/employee/me` immediately before (200 OK on
   its own audience) that the employee token itself was valid — the `/me/*`
   guard specifically rejects the wrong audience.
4. Source check (`principal-portal/me.controller.ts`): every route
   (`/profile`, `/data`, `/sources`, `/recipients`, `/privacy-contact`) takes
   no `@Param()`/`@Query()`/`@Body()` identifying a different principal —
   only `@CurrentPrincipal()` derived from the verified token. There is no
   `/api/me` route that takes an id.

**Verdict: PASS.** Only Aman's own values are ever returned to him; a
principal token is rejected against the employee-facing principal-detail
route; an employee token is rejected against the principal-portal route —
both `401`s driven by audience mismatch, exactly as the spec predicts, and
no `/me` route accepts an identifying parameter at all.

## Check 20: Age status is derived, never guessed (CH-01)

**How (verbatim SQL from the spec):**
```sql
SELECT "ageStatus","ageStatusSource",COUNT(*) FROM "DataPrincipal" GROUP BY 1,2;
```

**Observed output (whole table, as the spec's query is written):**
```
 ageStatus | ageStatusSource | count
-----------+-----------------+-------
 ADULT     | DOB_DERIVED     |   106
 UNKNOWN   |                 |   327
 CHILD     | DOB_DERIVED     |     6
```
Note this table now also includes test principals created by earlier checks
in this same run (Check 1's Globex principal, Check 9's unmerge-created
principal, and the 114 no-purpose-source principals created for Check 11) —
all of them fall into `UNKNOWN` since none carry a mapped date of birth,
which inflates the `UNKNOWN` bucket without changing the `ADULT`/`CHILD`
counts. Re-running the same query scoped to only the original four-source
Acme baseline (excluding those test artifacts) gives:
```
 ageStatus | ageStatusSource | count
-----------+-----------------+-------
 ADULT     | DOB_DERIVED     |   106
 UNKNOWN   |                 |   211
 CHILD     | DOB_DERIVED     |     6
```
(106 + 211 + 6 = 323, the Acme baseline principal count.)

`GET /api/inventory/gaps` (dashboard gaps card):
```json
{"code":"CH-01","label":"Unknown age status","count":326,
 "explanation":"326 data principal(s) have an unknown age status. Without a declared or DOB-derived age status, s.9 obligations toward children cannot be evidenced as tracked for these principals."}
```

**Verdict: PASS.** Exactly 6 `CHILD` rows, all with `ageStatusSource =
DOB_DERIVED`; the e-commerce-sourced adults are `ADULT` with the same
derived source; everyone without a mapped DOB is `UNKNOWN`, never guessed
from any other signal; the dashboard surfaces the `UNKNOWN` count as a named
compliance gap (`CH-01`) with the s.9 explanation the spec requires.

## Check 21: The RoPA export is real (EV-02)

**How:** downloaded `/api/inventory/ropa.csv` and opened it.

**Observed output (full file contents):**
```
Purpose Code,Purpose Name,Lawful Basis,Section 7 Limb,Data Categories,Source Systems,Recipients,Cross-Border Destinations,Retention Policy,Review Status
CUSTOMER_SUPPORT,Customer Support,LEGITIMATE_USE,VOLUNTARY_PROVISION,BEHAVIOURAL; CONTACT; IDENTITY,Support,,,,UNREVIEWED
MARKETING_COMMS,Marketing Communications,CONSENT,,CONTACT; IDENTITY; LOCATION,Marketing,CloudMail Pvt Ltd,,,UNREVIEWED
ORDER_FULFILMENT,Order Fulfilment,LEGITIMATE_USE,VOLUNTARY_PROVISION,CONTACT; DEMOGRAPHIC; FINANCIAL; IDENTITY; LOCATION; TRANSACTIONAL,E-commerce,,,,UNREVIEWED
SALES_CRM,Sales Relationship Management,LEGITIMATE_USE,VOLUNTARY_PROVISION,CONTACT; FINANCIAL; IDENTITY; LOCATION; TRANSACTIONAL,Sales,,,,UNREVIEWED
```

One row per purpose (all 4 purposes created in this evaluation), each with
lawful basis, the s.7 limb where `LEGITIMATE_USE` applies (correctly blank
for the `CONSENT` row), data categories, source system, recipients (the
Marketing row correctly lists "CloudMail Pvt Ltd", registered in Check 12),
cross-border destinations, retention policy and review status columns all
present.

**Finding:** the "Cross-Border Destinations" and "Retention Policy" columns
are blank for every row because this evaluation never registered a
`CrossBorderTransfer` or `RetentionPolicy` record for any purpose — this is
the spec's own anticipated case ("if a column is blank because the register
was never populated, that is a finding, not a bug"). The row is still
produced (not omitted), which is the actual pass condition.

**Verdict: PASS.** One row per purpose with every required column present;
blank cells reflect genuinely-unpopulated registers and are shown, not
dropped.

## Check 22: Performance on the demo dataset

**How:** measured the sequential four-source sync wall-clock time (already
captured for Check 6's baseline). Measured principal search and principal
detail latency with `curl -w "%{time_total}"`. Counted SQL statements for
one principal-detail request using Postgres's own statement logging
(`ALTER SYSTEM SET log_statement = 'all'`, reload, hit the endpoint once,
`docker logs` filtered to that one-second window, then reverted the setting
back to `none` immediately after) — the app's own `PRISMA_QUERY_LOG=1` event
hook exists in `prisma.service.ts` but has no listener wired up anywhere in
the codebase to consume it, so counting via Postgres's own log was used
instead as an equivalent, code-free way to count exact SQL issued.

**Observed output — sync wall-clock:** `2026-08-31T02:52:09.741Z` →
`2026-08-31T02:52:34.603Z` ≈ **24.9 s** for all four sources / 500 records
(< 30 s).

**Observed output — principal search latency** (`GET /api/principals?q=...`):
```
q='Aman'   latency: 0.017s  HTTP:200
q='Sharma' latency: 0.012s  HTTP:200
q=''       latency: 0.011s  HTTP:200
```
All well under 300 ms.

**Observed output — principal detail latency** (`GET /api/principals/:id`):
`0.0295 s` (< 500 ms).

**Observed output — principal detail query count** (one request, full
Postgres statement log for that window):
```
1.  SELECT 1                                            (connection check)
2.  SELECT Employee (id, roleId)                         (actor/auth lookup)
3.  SELECT Role (id)
4.  SELECT RolePermission (roleId, permissionCode)
5.  BEGIN
6.  SELECT DataPrincipal (detail row)
7.  SELECT PrincipalDataField (all fields for this principal)
8.  SELECT DataSource (id, name) -- resolves the field-lineage source ids in one batched IN() query
9.  INSERT INTO "Counter" ... ON CONFLICT DO NOTHING     (audit sequence counter)
10. SELECT "Counter" ... FOR UPDATE                       (audit sequence lock)
11. UPDATE "Counter" SET value = ...                      (audit sequence increment)
12. SELECT AuditEvent ORDER BY sequence DESC LIMIT 1       (hash-chain previous hash)
13. INSERT INTO AuditEvent (PERSONAL_DATA_VIEWED access-log write)
14. COMMIT
```
**14 total SQL statements** for one principal-detail request — under 15.
Field-lineage source-name resolution (`DataSource` lookup) is correctly
batched into a single `IN (...)` query rather than one query per field
(confirmed no N+1 here).

**Verdict: PASS.** Sync completes in ~25s (<30s); search latency is ~10-17ms
(<300ms); principal detail latency is ~30ms (<500ms) with exactly 14 SQL
statements (<15), roughly half of which are the audit-write's own
sequence-counter/hash-chain machinery (Check 17's gap-free sequencing) and
the RBAC permission lookup, not the profile-assembly read path itself.

## Check 23: Timezone correctness

**How:** compared the most recent `SyncJob.startedAt` in the database with
what the frontend's rendering functions would produce. No live browser
session was open this run, so instead of eyeballing the running UI, the
exact functions the UI calls (`formatInOrgTimezone`/`formatUtcTooltip` in
`dpdp-platform/frontend/src/lib/format.ts`) were run directly against the
real stored value and their unit tests were run.

```sql
SELECT "startedAt" FROM "SyncJob" ORDER BY "startedAt" DESC LIMIT 1;
```

**Observed output:**
```
         startedAt
----------------------------
 2026-08-31 03:02:23.014+00
```
Running the app's own formatting functions against that exact value:
```
IST render (formatInOrgTimezone, timeZone="Asia/Kolkata"): 31 Aug 2026, 08:32
UTC tooltip (formatUtcTooltip):                             2026-08-31 03:02 UTC
```
`03:02 UTC + 5:30 = 08:32 IST` — a single, correct offset applied once (not
the 5.5-hour-off or double-converted result a bug here would produce).
Source inspection of `DateTime.tsx` confirms the conversion happens at
exactly one render boundary: `formatInOrgTimezone` converts the raw UTC ISO
string once via `Intl.DateTimeFormat` with the organization's timezone (from
`GET /api/organization`, defaulting to `"UTC"` if not yet loaded — never a
guess), and `formatUtcTooltip` independently re-derives the UTC display
directly from the same raw ISO string rather than re-converting the
already-converted display value.

```bash
npx vitest run src/lib/format.test.ts src/components/shared/DateTime.test.tsx
```
```
✓ src/lib/format.test.ts (6 tests)
✓ src/components/shared/DateTime.test.tsx (3 tests)
Test Files  2 passed (2)
Tests  9 passed (9)
```

**Verdict: PASS.** The database stores UTC; the org-timezone conversion to
IST is correct and applied exactly once; the tooltip independently shows the
raw UTC instant.

## Check 24: Clean-clone reproducibility

**How (verbatim steps from the spec):**
```bash
git clone --branch mvp1-foundation "<repo>" /tmp/dpdp-clean-clone-test
cd /tmp/dpdp-clean-clone-test/dpdp-platform
cp .env.example .env
# generate ENCRYPTION_KEY
sed -i "s#^ENCRYPTION_KEY=.*#ENCRYPTION_KEY=$(openssl rand -base64 32)#" .env
docker compose up --build
```
(The existing evaluation stack's containers were stopped first, since they
occupy the same host ports the clean clone's compose file also binds to.)

**Observed output:**
- `git clone` succeeded; `dpdp-platform/.env.example` exists at the
  top level (there is no `dpdp-platform/backend/.env.example` — not needed,
  since `docker-compose.yml`'s backend service reads `env_file: .env` from
  the platform-level file, not a per-package one) and already has
  docker-network hostnames (`postgres`, `redis`) baked in, so no manual
  hostname rewriting was needed for the Docker path specifically.
- `docker compose up --build` built both images successfully (backend:
  `npm ci` → `prisma generate` → `nest build` → `npm prune`; frontend:
  `vite build`) and started all four containers. Postgres reported healthy,
  redis/mailhog/frontend started.
- **The backend container immediately exited with code 1 and did not
  restart.** Its logs:
  ```
  Error: Could not find Prisma Schema that is required for this command.
  You can either provide it with `--schema` argument, set it as `prisma.schema` in your package.json or put it into the default location.
  Checked following paths:
  schema.prisma: file not found
  prisma/schema.prisma: file not found
  prisma/schema: directory not found
  ```
  Root cause (read from `dpdp-platform/backend/Dockerfile`): the
  compose command is `sh -c "npx prisma migrate deploy && node dist/main.js"`,
  but the Dockerfile's final runtime stage only copies
  `node_modules`, `dist`, and `package*.json` from the build stage —
  **the `prisma/` directory (which holds `schema.prisma` and every
  migration) is never copied into the runtime image at all.** `npx prisma
  migrate deploy` therefore cannot find a schema, exits non-zero, the `&&`
  short-circuits, and `node dist/main.js` never runs. `docker inspect`
  confirmed: `exited exitcode=1 restartcount=0` — the container is not
  crash-looping into eventual success, it fails once and stays down.
  Consequently the frontend, though its own container started, has no
  working API to talk to, and there is no way to reach an admin login
  screen at all via this path.
- Torn down the clean-clone stack (`docker compose down -v`) and restored a
  working environment for the rest of this evaluation by running the
  backend/frontend directly with `node`/`npm run dev` against the existing
  Postgres/Redis containers instead of through this Dockerfile — which is
  the same way every other check in this document was run, and which does
  work, since it never goes through the broken image.

**Verdict: FAIL.** `docker compose up --build` from a genuinely fresh clone
does not produce a working backend — it exits immediately on every attempt
because the runtime Docker image never receives the `prisma/` directory it
needs to run migrations at container start. No amount of waiting reaches
"logged in as admin"; the container is stopped, not slow. This is a defect
in `dpdp-platform/backend/Dockerfile`'s final stage `COPY` list.
