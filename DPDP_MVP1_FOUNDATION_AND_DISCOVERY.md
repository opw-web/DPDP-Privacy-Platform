# DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING
### Self-contained build document. Paste this entire file as your vibe-coding prompt.
### Read `DPDP_COMPLIANCE_CHECKLIST.md` alongside this. Every feature here exists to satisfy a checklist ID.

---

## 1. IDEA CONTEXT (read this first)

You are building a **B2B SaaS platform that helps Indian businesses operate their obligations under the Digital Personal Data Protection Act, 2023 and the Digital Personal Data Protection Rules, 2025** (notified 13 November 2025, G.S.R. 846(E), commencing in phases through May 2027).

A company connects its existing customer-data systems using **read-only integrations**. The platform discovers what personal data the company holds, resolves which records across different systems belong to the same human being, and builds one unified profile per person. Every privacy obligation — notice, consent, rights requests, retention, breach, evidence — then hangs off that profile.

**This document is MVP 1 of 2.** It builds four things:

1. **The plumbing** — multi-tenancy, authentication, permission-based access control, and an append-only audit log the database itself protects.
2. **Discovery** — read-only connectors, a sync engine, field mapping, and deterministic identity resolution producing canonical Data Principal profiles with full source lineage.
3. **The Record of Processing** — the registers a company must be able to produce on demand: purposes with their **lawful basis**, processors, recipients with whom data is shared, cross-border transfers, retention policies, and security safeguards.
4. **The evidence floor** — the access log, the audit chain, and the inventory exports.

There is NO consent collection, NO notice builder, NO rights requests, NO breach handling and NO retention execution in this MVP. Those are MVP 2. MVP 1 must be right because every later workflow depends on it.

### The DPDP concepts you need, in plain language

- A **Data Fiduciary** is the business — it decides why and how personal data is processed. It is your tenant.
- A **Data Principal** is the individual the data is about. Under eighteen, she is a **child** and a whole extra regime applies (MVP 2).
- A **Data Processor** processes on the fiduciary's behalf, only under a valid contract (s.8(2)). The fiduciary stays liable for everything the processor does — liability cannot be contracted away (s.8(1)).
- There are exactly **two lawful bases**: consent (s.6) and the closed list of **certain legitimate uses** (s.7). There is no GDPR-style legitimate-interest balancing test.
- A **specified purpose** is why data is processed. The software **cannot infer it** from a database column. Seeing `email = bob@example.com` tells you nothing about whether that is order fulfilment or marketing. Purpose and lawful basis are always configured by a human. Checklist ID **LB-02**.
- **Source lineage** means that for every fact shown about a person, the platform can name the system it came from. Never display personal data you cannot attribute.
- Section 8(3) requires **completeness, accuracy and consistency** wherever personal data is likely to be used in a decision affecting the person, or disclosed to another fiduciary. Identity resolution is how a company actually achieves that. Checklist ID **GO-03**.
- Section 11(1)(b) gives a person the right to be told the **identities of every other Data Fiduciary and Data Processor** her data was shared with, plus a description of what was shared. A company cannot answer that without a sharing register. Checklist ID **RT-04** — this is why MVP 1 has registers and not just profiles.

### Non-negotiable project rules (apply to BOTH MVPs)

1. **Read-only external access.** The platform never writes to a company's connected systems. The HTTP client physically refuses any method other than GET. Corrections are human workflows (MVP 2), not API writes.
2. **Two independent codebases.** `/dpdp-platform` (production) and `/demo-company-server` (fake company). Zero source-code dependency either way. Deleting the demo folder must leave the platform fully buildable and testable. No npm workspace links them and no environment variable in the production app names the demo.
3. **Multi-tenant from line one.** Every business is an `Organization`; every business-data row carries `organizationId`; isolation is enforced in one Prisma client extension, never by remembering a `where` clause.
4. **Nothing legal is hard-coded.** No `90`, `72`, `48`, `30` or `3 years` anywhere in application code. MVP 2 introduces the Compliance Rules Engine; MVP 1 must not create constants for it to hunt down later.
5. **Everything is auditable.** Every state change writes an append-only `AuditEvent`, protected by a database trigger that rejects UPDATE and DELETE, and hash-chained per organization.
6. **Reversible identity.** A merge is a link, never a destruction. Every merge can be undone.
7. **Timezone discipline.** `timestamptz` in UTC everywhere; convert to the organization's timezone only at the render boundary.
8. **The platform never concludes.** It does not decide whether a company is a Significant Data Fiduciary, whether a purpose is lawful, or whether a person is a child. It records the human's determination, who made it and when. No screen may claim the company "is compliant" — the language is "supports", "evidences", "tracks".

### What MVP 1 delivers when done

An admin logs in, pastes in four read-only API endpoints, maps each system's oddly-named fields, declares the purpose and lawful basis for each source, registers the processors and recipients involved, and runs a sync. Five hundred scattered records become 327 unique Data Principals with four ambiguous pairs queued for human review and two same-named strangers correctly kept apart. Any profile shows every value with the systems it came from. The company can export a Record of Processing Activities and an access log. That same person logs into her own portal and sees exactly her data — and, provably, nobody else's.

---

## 2. ARCHITECTURE

### 2.1 Tech stack (locked — do not substitute)

| Layer | Tool | Version |
|---|---|---|
| Language | TypeScript | 5.5+, strict, `noUncheckedIndexedAccess` on |
| Runtime | Node.js | 20 LTS |
| Backend | NestJS | 10 |
| ORM | Prisma | 5.x |
| Database | PostgreSQL | 16 |
| Jobs | BullMQ + Redis | BullMQ 5, Redis 7 |
| Validation | class-validator + class-transformer | latest |
| API docs | @nestjs/swagger | at `/api/docs` |
| Logging | nestjs-pino | JSON, request-id correlation |
| Hashing | argon2 | argon2id |
| Frontend | React 18 + Vite 5 | one SPA, two route trees |
| Routing | react-router-dom | 6 |
| Styling | Tailwind 3 + shadcn/ui + lucide-react | — |
| Server state | TanStack Query | 5 |
| Forms | react-hook-form + zod | — |
| Tables | TanStack Table | 8 |
| CSV export | papaparse | frontend |
| Demo company server | Fastify 4 + better-sqlite3 | separate project |
| Orchestration | Docker Compose | v2 |
| Dev mail sink | MailHog | used in MVP 2, wired now |

**Package manager: npm**, two separate lockfiles, one per project. Do **not** create a root workspace — that is exactly the coupling rule 2 forbids.

### 2.2 Machine setup — Linux Mint Cinnamon (run these exactly)

```bash
# --- Node 20 via nvm ---
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20 && nvm alias default 20
node -v   # expect v20.x

# --- Docker Engine + Compose plugin (Mint is Ubuntu-based; use UBUNTU_CODENAME) ---
sudo apt update
sudo apt install -y ca-certificates curl gnupg git build-essential
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $UBUNTU_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER      # then LOG OUT and back in
docker compose version

# --- psql client for the verification checks in section 6 ---
sudo apt install -y postgresql-client-16
```

> Mint's `VERSION_CODENAME` is `wilma`/`virginia`/etc. and will 404 against Docker's repo. `UBUNTU_CODENAME` is the correct variable and the command above already uses it.

Hardware: 8 GB RAM, 10 GB free disk. No paid service, no cloud account.

### 2.3 Ports (locked)

| Service | Port |
|---|---|
| Backend API | 4000 |
| Frontend dev server | 5173 |
| Demo company server | 5001 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MailHog SMTP / UI | 1025 / 8025 |

### 2.4 Folder structure

```
/project-root
├── dpdp-platform/
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── prisma/{schema.prisma, migrations/, seed.ts}
│   │   └── src/
│   │       ├── main.ts  app.module.ts
│   │       ├── common/
│   │       │   ├── tenant/        # AsyncLocalStorage + Prisma extension
│   │       │   ├── crypto/        # AES-256-GCM: credentials + identifier encryption
│   │       │   ├── audit/         # AuditService — the ONLY writer to audit_events
│   │       │   ├── reference/     # DP-000123, REQ-001028 counters
│   │       │   ├── guards/        # JwtEmployeeGuard, JwtPrincipalGuard, PermissionsGuard
│   │       │   └── decorators/    # @RequirePermission(), @CurrentActor()
│   │       ├── modules/
│   │       │   ├── auth/  organizations/  employees/
│   │       │   ├── data-sources/          # CRUD, credentials, field mapping
│   │       │   ├── connectors/            # Connector interface + RestApiConnector
│   │       │   ├── sync/                  # SyncService + BullMQ processor
│   │       │   ├── normalization/         # email/phone/name/date normalizers
│   │       │   ├── identity/              # matching, linking, merge/unmerge, review
│   │       │   ├── principals/            # search, profile assembly, lineage
│   │       │   ├── purposes/              # purpose + LAWFUL BASIS register  (LB-02)
│   │       │   ├── registers/             # processors, recipients, transfers,
│   │       │   │                          # retention policies, security measures
│   │       │   ├── inventory/             # dashboard + RoPA export  (EV-01, EV-02)
│   │       │   ├── principal-portal/      # /api/me/*
│   │       │   ├── audit/                 # read API + access log  (SE-03, EV-08)
│   │       │   ├── notices/               # EMPTY in MVP 1 — MVP 2
│   │       │   ├── consents/              # EMPTY in MVP 1 — MVP 2
│   │       │   ├── requests/              # EMPTY in MVP 1 — MVP 2
│   │       │   ├── compliance/            # EMPTY in MVP 1 — MVP 2
│   │       │   ├── retention/             # EMPTY in MVP 1 — MVP 2
│   │       │   ├── children/              # EMPTY in MVP 1 — MVP 2
│   │       │   ├── messaging/             # EMPTY in MVP 1 — MVP 2
│   │       │   ├── breaches/              # EMPTY in MVP 1 — MVP 2
│   │       │   └── sdf/                   # EMPTY in MVP 1 — MVP 2
│   │       └── queues/
│   └── frontend/src/
│       ├── router.tsx                     # /login, /app/*, /me/login, /me/*
│       ├── lib/  components/ui/  components/shared/
│       ├── fiduciary/pages/   principal/pages/
└── demo-company-server/                   # completely independent project
    ├── docker-compose.yml  Dockerfile  README.md
    ├── src/{server.ts, auth.ts, db.ts, routes/, seed/generate.ts}
    └── data/demo.sqlite
```

### 2.5 Database schema — Prisma (source of truth)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// ─────────────── enums ───────────────
enum EmployeeStatus   { INVITED ACTIVE DISABLED }
enum EntityRole       { DATA_FIDUCIARY DATA_PROCESSOR BOTH }
enum ThirdScheduleClass { NONE ECOMMERCE ONLINE_GAMING SOCIAL_MEDIA }   // RE-03
enum LawfulBasis      { CONSENT LEGITIMATE_USE }                        // LB-01
enum LegitimateUseLimb {                                                // s.7(a)-(i)
  VOLUNTARY_PROVISION STATE_SUBSIDY_BENEFIT STATE_FUNCTION MEDICAL_EMERGENCY
  EPIDEMIC_PUBLIC_HEALTH DISASTER_PUBLIC_ORDER EMPLOYMENT
  SAFEGUARD_EMPLOYER_LOSS OTHER_S7 }
enum DataSourceStatus { DRAFT CONNECTED ERROR DISABLED }
enum AuthType         { BEARER API_KEY_HEADER BASIC NONE }
enum SyncFrequency    { MANUAL EVERY_15_MIN HOURLY DAILY }
enum SyncStatus       { QUEUED RUNNING SUCCESS PARTIAL FAILED }
enum CanonicalField   { FULL_NAME FIRST_NAME LAST_NAME EMAIL PHONE DATE_OF_BIRTH
                        GENDER ADDRESS_LINE1 ADDRESS_LINE2 CITY STATE POSTAL_CODE
                        COUNTRY CUSTOMER_ID ACCOUNT_STATUS LAST_ACTIVITY_AT
                        PURCHASE_TOTAL EXTERNAL_ID IGNORE }
enum DataCategory     { IDENTITY CONTACT DEMOGRAPHIC FINANCIAL TRANSACTIONAL
                        BEHAVIOURAL LOCATION HEALTH BIOMETRIC GOVT_ID OTHER }
enum IdentifierType   { EMAIL PHONE CUSTOMER_ID }
enum MatchConfidence  { EXACT HIGH POSSIBLE UNMATCHED }
enum LinkStatus       { ACTIVE DETACHED }
enum CandidateStatus  { PENDING CONFIRMED REJECTED }
enum ActorType        { EMPLOYEE PRINCIPAL SYSTEM }
enum AgeStatus        { UNKNOWN ADULT CHILD GUARDIAN_REPRESENTED }       // CH-01
enum RecipientType    { DATA_PROCESSOR OTHER_DATA_FIDUCIARY }            // PR-01, PR-03
enum ContactDirection { INBOUND OUTBOUND }                               // GO-09
enum PrincipalAccountStatus { UNCLAIMED ACTIVE LOCKED }

// ─────────────── tenancy & people ───────────────
model Organization {
  id                     String @id @default(uuid())
  name                   String
  legalName              String?
  entityRole             EntityRole @default(DATA_FIDUCIARY)            // SC-04
  country                String @default("IN")
  timezone               String @default("Asia/Kolkata")
  offersGoodsServicesInIndia Boolean @default(true)                     // SC-02
  // Rule 9 / s.8(9) published contact — GO-10
  dpoName                String?
  dpoEmail               String?
  dpoPhone               String?
  dpoIsIndiaBased        Boolean @default(false)                        // SD-01
  responsiblePersonName  String?     // used when no DPO is appointed
  responsiblePersonEmail String?
  grievanceContactEmail  String?
  publicPrivacyPageUrl   String?     // where GO-10 / RT-01 details are published
  // SDF + Third Schedule self-declaration — never inferred by the platform
  isSignificantDataFiduciary Boolean @default(false)                    // SD-07
  sdfNotifiedAt          DateTime?
  sdfNotificationRef     String?
  thirdScheduleClass     ThirdScheduleClass @default(NONE)              // RE-03
  registeredUserCount    BigInt?
  classDeclaredByEmployeeId String?
  classDeclaredAt        DateTime?
  settings               Json @default("{}")
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
}

model Permission { code String @id  description String  category String
                   roles RolePermission[] }               // global, not tenant-scoped

model Role {
  id String @id @default(uuid())
  organizationId String
  code String   name String   isSystem Boolean @default(false)
  permissions RolePermission[]   employees Employee[]
  @@unique([organizationId, code])
}
model RolePermission {
  roleId String   permissionCode String
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionCode], references: [code])
  @@id([roleId, permissionCode])
}
model Employee {
  id String @id @default(uuid())
  organizationId String
  email String   fullName String   passwordHash String   roleId String
  status EmployeeStatus @default(ACTIVE)
  lastLoginAt DateTime?   createdAt DateTime @default(now())   updatedAt DateTime @updatedAt
  role Role @relation(fields: [roleId], references: [id])
  @@unique([organizationId, email])
  @@index([organizationId])
}
model PrincipalAccount {                    // portal login — SEPARATE from DataPrincipal
  id String @id @default(uuid())
  organizationId String
  dataPrincipalId String @unique
  email String   passwordHash String?
  status PrincipalAccountStatus @default(UNCLAIMED)
  lastLoginAt DateTime?   createdAt DateTime @default(now())
  dataPrincipal DataPrincipal @relation(fields: [dataPrincipalId], references: [id])
  @@unique([organizationId, email])
}
model RefreshToken {
  id String @id @default(uuid())
  organizationId String   actorType ActorType   actorId String
  tokenHash String @unique   expiresAt DateTime   revokedAt DateTime?
  createdAt DateTime @default(now())
  @@index([actorType, actorId])
}

// ─────────────── purposes and lawful basis (LB-01, LB-02) ───────────────
model ProcessingPurpose {
  id String @id @default(uuid())
  organizationId String
  code String                  // ORDER_FULFILMENT, MARKETING_EMAIL, SUPPORT, PAYROLL
  name String
  description String           // plain language — reused in notices (MVP 2)
  lawfulBasis LawfulBasis                      // REQUIRED. Never defaulted, never inferred.
  legitimateUseLimb LegitimateUseLimb?         // REQUIRED when basis = LEGITIMATE_USE
  basisJustification String                    // free text written by a human
  dataCategories DataCategory[]                // CN-02: only what is necessary
  goodsOrServicesDescription String?           // NT-04 input
  reviewedByEmployeeId String?                 // unreviewed ⇒ amber badge everywhere
  reviewedAt DateTime?
  active Boolean @default(true)
  createdAt DateTime @default(now())   updatedAt DateTime @updatedAt
  sources DataSourcePurpose[]
  sharing SharingActivity[]
  retention RetentionPolicy[]
  @@unique([organizationId, code])
}

// ─────────────── data sources & mapping ───────────────
model DataSource {
  id String @id @default(uuid())
  organizationId String
  name String   systemType String   baseUrl String
  recordsPath String                 // JSON path to the array, e.g. "data"
  externalIdField String             // that system's primary key field
  authType AuthType @default(BEARER)
  credentialCipher String?           // AES-256-GCM. NEVER returned by any API.
  credentialHint String?             // last 4 chars only
  supportsIncremental Boolean @default(false)
  incrementalParam String?
  paginationStyle String @default("PAGE")
  pageSize Int @default(100)
  syncFrequency SyncFrequency @default(MANUAL)
  status DataSourceStatus @default(DRAFT)
  // SC-03: data the Data Principal herself made public is outside the Act
  containsOnlyPubliclyAvailableData Boolean @default(false)
  publiclyAvailableJustification String?
  hostingCountry String @default("IN")          // CB-01 input
  lastSyncAt DateTime?   lastError String?
  createdAt DateTime @default(now())   updatedAt DateTime @updatedAt
  fields DataSourceField[]   mappings SourceFieldMapping[]
  purposes DataSourcePurpose[]   syncJobs SyncJob[]   records SourceRecord[]
  securityMeasures SecurityMeasure[]
  @@unique([organizationId, name])
}
model DataSourceField {
  id String @id @default(uuid())
  organizationId String   dataSourceId String
  fieldName String   sampleValue String?   inferredType String
  dataSource DataSource @relation(fields: [dataSourceId], references: [id], onDelete: Cascade)
  @@unique([dataSourceId, fieldName])
}
model SourceFieldMapping {
  id String @id @default(uuid())
  organizationId String   dataSourceId String
  sourceField String   canonicalField CanonicalField
  dataCategory DataCategory @default(OTHER)
  containsPersonalData Boolean @default(true)
  isVerifiedCustomerId Boolean @default(false)   // gate for the EXACT match rule
  dataSource DataSource @relation(fields: [dataSourceId], references: [id], onDelete: Cascade)
  @@unique([dataSourceId, sourceField])
}
model DataSourcePurpose {
  dataSourceId String   purposeId String
  dataSource DataSource @relation(fields: [dataSourceId], references: [id], onDelete: Cascade)
  purpose ProcessingPurpose @relation(fields: [purposeId], references: [id], onDelete: Cascade)
  @@id([dataSourceId, purposeId])
}

// ─────────────── the registers (EV-02, EV-09) ───────────────
model DataRecipient {                        // PR-01, PR-03
  id String @id @default(uuid())
  organizationId String
  name String
  type RecipientType                         // processor vs other fiduciary
  contactEmail String?
  country String @default("IN")
  // s.8(2): a processor may be engaged ONLY under a valid contract
  contractExists Boolean @default(false)
  contractReference String?
  contractSignedAt DateTime?
  contractExpiresAt DateTime?
  // Rule 6(1)(f): security safeguard provisions in the contract  (PR-02, SE-06)
  contractHasSecurityClause Boolean @default(false)
  contractHasErasureClause Boolean @default(false)     // s.8(7)(b)
  contractHasAuditRights Boolean @default(false)
  subProcessorsDisclosed Boolean @default(false)       // PR-04
  subProcessorNotes String?
  active Boolean @default(true)
  createdAt DateTime @default(now())   updatedAt DateTime @updatedAt
  sharing SharingActivity[]
  transfers CrossBorderTransfer[]
  @@unique([organizationId, name])
}
model SharingActivity {                      // RT-04 — this is what makes s.11(1)(b) answerable
  id String @id @default(uuid())
  organizationId String
  recipientId String
  purposeId String
  dataCategories DataCategory[]
  description String                         // "description of the personal data so shared"
  sourceIds String[]                         // which systems feed this sharing
  startedAt DateTime
  endedAt DateTime?
  active Boolean @default(true)
  recipient DataRecipient @relation(fields: [recipientId], references: [id])
  purpose ProcessingPurpose @relation(fields: [purposeId], references: [id])
  @@index([organizationId, recipientId])
}
model CrossBorderTransfer {                  // CB-01
  id String @id @default(uuid())
  organizationId String
  recipientId String
  destinationCountry String
  dataCategories DataCategory[]
  purposeDescription String
  govtRestrictionChecked Boolean @default(false)     // s.16 / Rule 15
  govtRestrictionNotes String?
  sectoralRestrictionNotes String?                   // CB-02: RBI/SEBI/IRDAI etc.
  localisationRequired Boolean @default(false)       // CB-03 / Rule 13(4)
  reviewedByEmployeeId String?   reviewedAt DateTime?
  recipient DataRecipient @relation(fields: [recipientId], references: [id])
  @@index([organizationId])
}
model RetentionPolicy {                      // RE-08 (model here; engine in MVP 2)
  id String @id @default(uuid())
  organizationId String
  purposeId String
  name String
  triggerType String        // PURPOSE_SERVED | CONSENT_WITHDRAWN | INACTIVITY | FIXED_PERIOD
  retentionValue Int
  retentionUnit String      // DAYS | MONTHS | YEARS
  legalBasisForRetention String            // statute / sectoral rule / company policy
  legalBasisType String     // STATUTORY | SECTORAL | ORG_POLICY
  minimumRetentionValue Int @default(1)    // RE-06: Rule 8(3) one-year floor
  minimumRetentionUnit String @default("YEARS")
  preErasureNoticeHours Int @default(48)   // RE-05: Rule 8(2) — configurable, cited
  accountAccessCarveOut Boolean @default(false)   // RE-04: Third Schedule carve-out
  active Boolean @default(true)
  purpose ProcessingPurpose @relation(fields: [purposeId], references: [id])
  @@unique([organizationId, purposeId, name])
}
model SecurityMeasure {                      // SE-01…SE-07 register for company systems
  id String @id @default(uuid())
  organizationId String
  dataSourceId String?                       // null = organization-wide measure
  ruleReference String                       // "Rule 6(1)(a)" … "Rule 6(1)(g)"
  measureType String                         // ENCRYPTION | MASKING | TOKENISATION |
                                             // ACCESS_CONTROL | LOGGING | BACKUP |
                                             // CONTRACT_CLAUSE | ORG_MEASURE
  implemented Boolean @default(false)
  description String
  evidenceReference String?
  lastReviewedAt DateTime?   reviewedByEmployeeId String?
  dataSource DataSource? @relation(fields: [dataSourceId], references: [id])
  @@index([organizationId, ruleReference])
}

// ─────────────── sync & the three data layers ───────────────
model SyncJob {
  id String @id @default(uuid())
  organizationId String   dataSourceId String   triggeredBy String
  startedAt DateTime @default(now())   finishedAt DateTime?
  status SyncStatus @default(QUEUED)
  recordsRead Int @default(0)     recordsCreated Int @default(0)
  recordsUpdated Int @default(0)  recordsSkipped Int @default(0)
  recordsFailed Int @default(0)   principalsCreated Int @default(0)
  principalsLinked Int @default(0) candidatesRaised Int @default(0)
  errorLog Json @default("[]")
  dataSource DataSource @relation(fields: [dataSourceId], references: [id])
  @@index([organizationId, dataSourceId, startedAt])
}
model SourceRecord {                         // LAYER 1 — raw, never mutated in place
  id String @id @default(uuid())
  organizationId String   dataSourceId String   sourceRecordKey String
  rawPayload Json   payloadHash String
  firstSeenAt DateTime @default(now())   lastSeenAt DateTime @default(now())
  normalized NormalizedRecord?
  dataSource DataSource @relation(fields: [dataSourceId], references: [id])
  @@unique([dataSourceId, sourceRecordKey])
  @@index([organizationId])
}
model NormalizedRecord {                     // LAYER 2
  id String @id @default(uuid())
  organizationId String   sourceRecordId String @unique
  fullName String?  firstName String?  lastName String?
  emailRaw String?  emailNormalized String?
  phoneRaw String?  phoneNormalized String?
  customerId String?  dateOfBirth DateTime?
  addressLine1 String?  city String?  state String?  postalCode String?  country String?
  nameKey String?
  extras Json @default("{}")
  normalizedAt DateTime @default(now())
  sourceRecord SourceRecord @relation(fields: [sourceRecordId], references: [id], onDelete: Cascade)
  links IdentityLink[]
  @@index([organizationId, emailNormalized])
  @@index([organizationId, phoneNormalized])
}
model DataPrincipal {                        // LAYER 3 — the canonical human
  id String @id @default(uuid())
  organizationId String
  reference String                            // DP-000123
  displayName String
  // GO-08 / GO-09 / RE-09 — inbound contact only
  lastPrincipalContactAt DateTime?
  lastPrincipalContactSource String?
  // CH-01 — declared or derived from DOB; NEVER guessed from behaviour
  ageStatus AgeStatus @default(UNKNOWN)
  ageStatusSource String?                     // DOB_DERIVED | SELF_DECLARED | EMPLOYEE_SET
  ageStatusSetAt DateTime?
  createdAt DateTime @default(now())   updatedAt DateTime @updatedAt
  identifiers PrincipalIdentifier[]  links IdentityLink[]
  fields PrincipalDataField[]  account PrincipalAccount?
  contactEvents PrincipalContactEvent[]
  @@unique([organizationId, reference])
  @@index([organizationId, displayName])
  @@index([organizationId, ageStatus])
}
model PrincipalIdentifier {
  id String @id @default(uuid())
  organizationId String   dataPrincipalId String
  type IdentifierType   value String   isPrimary Boolean @default(false)
  dataPrincipal DataPrincipal @relation(fields: [dataPrincipalId], references: [id], onDelete: Cascade)
  @@unique([organizationId, type, value])    // the engine of deterministic matching
  @@index([dataPrincipalId])
}
model IdentityLink {
  id String @id @default(uuid())
  organizationId String   dataPrincipalId String   normalizedRecordId String
  confidence MatchConfidence   matchedOn Json
  status LinkStatus @default(ACTIVE)
  linkedByEmployeeId String?   detachedAt DateTime?   detachReason String?
  createdAt DateTime @default(now())
  dataPrincipal DataPrincipal @relation(fields: [dataPrincipalId], references: [id])
  normalizedRecord NormalizedRecord @relation(fields: [normalizedRecordId], references: [id])
  @@index([dataPrincipalId, status])
}
model PrincipalDataField {                   // assembled view with lineage
  id String @id @default(uuid())
  organizationId String   dataPrincipalId String
  canonicalField CanonicalField   value String   dataCategory DataCategory
  sourceIds String[]                          // contributing dataSourceIds
  isPrimary Boolean @default(false)
  conflict Boolean @default(false)            // GO-03: accuracy/consistency signal
  updatedAt DateTime @updatedAt
  dataPrincipal DataPrincipal @relation(fields: [dataPrincipalId], references: [id], onDelete: Cascade)
  @@unique([dataPrincipalId, canonicalField, value])
  @@index([organizationId, dataPrincipalId])
}
model MatchCandidate {
  id String @id @default(uuid())
  organizationId String   normalizedRecordId String   dataPrincipalId String
  confidence MatchConfidence   score Float   evidence Json
  status CandidateStatus @default(PENDING)
  decidedByEmployeeId String?   decidedAt DateTime?   createdAt DateTime @default(now())
  @@unique([normalizedRecordId, dataPrincipalId])
  @@index([organizationId, status])
}
model PrincipalContactEvent {                // GO-09 — inbound vs outbound matters
  id String @id @default(uuid())
  organizationId String   dataPrincipalId String
  direction ContactDirection
  channel String            // PORTAL_LOGIN | REQUEST | CONSENT_ACTION | EMAIL_IN | PHONE | CAMPAIGN_OUT
  description String?
  occurredAt DateTime @default(now())
  dataPrincipal DataPrincipal @relation(fields: [dataPrincipalId], references: [id], onDelete: Cascade)
  @@index([organizationId, dataPrincipalId, occurredAt])
}

// ─────────────── audit & utility ───────────────
model AuditEvent {                           // SE-03, EV-08, EV-12
  id String @id @default(uuid())
  organizationId String
  sequence BigInt                             // per-org monotonic
  actorType ActorType   actorId String?   actorLabel String
  action String   resourceType String   resourceId String?
  // SE-03: who looked at WHOSE personal data
  subjectPrincipalId String?
  metadata Json @default("{}")
  ipAddress String?   userAgent String?
  previousHash String?   hash String
  createdAt DateTime @default(now())
  @@unique([organizationId, sequence])
  @@index([organizationId, createdAt])
  @@index([organizationId, subjectPrincipalId, createdAt])
  @@index([organizationId, resourceType, resourceId])
}
model Counter {
  organizationId String   name String   value BigInt @default(0)
  @@id([organizationId, name])
}
```

### 2.6 Raw SQL Prisma cannot express (second migration)

```sql
-- 1. Exactly ONE active identity link per normalized record.
CREATE UNIQUE INDEX identity_link_one_active
  ON "IdentityLink" ("normalizedRecordId") WHERE status = 'ACTIVE';

-- 2. The audit log is append-only. This is a product guarantee (SE-03, EV-12),
--    and it is also the access log the company must keep for a year (Rule 6(1)(c),(e)).
CREATE OR REPLACE FUNCTION audit_is_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'AuditEvent rows are immutable (attempted %)', TG_OP; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_is_immutable();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_is_immutable();

-- 3. A processor cannot be marked active without a contract (s.8(2) / GO-02).
ALTER TABLE "DataRecipient" ADD CONSTRAINT processor_requires_contract
  CHECK (type <> 'DATA_PROCESSOR' OR active = false OR "contractExists" = true);

-- 4. Search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX principal_name_trgm ON "DataPrincipal" USING gin ("displayName" gin_trgm_ops);
CREATE INDEX pdf_value_trgm ON "PrincipalDataField" USING gin ("value" gin_trgm_ops);
```

Constraint 3 is deliberate and will feel annoying the first time it fires. That is the point: s.8(2) makes the contract a precondition of engaging a processor, so the data model makes it a precondition of marking one active.

### 2.7 docker-compose.yml and .env

```yaml
services:
  postgres:
    image: postgres:16
    environment: { POSTGRES_USER: dpdp, POSTGRES_PASSWORD: dpdp, POSTGRES_DB: dpdp }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U dpdp"], interval: 5s, retries: 10 }
  redis:   { image: redis:7-alpine, ports: ["6379:6379"] }
  mailhog: { image: mailhog/mailhog, ports: ["1025:1025","8025:8025"] }
  backend:
    build: ./backend
    env_file: .env
    ports: ["4000:4000"]
    depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_started } }
    command: sh -c "npx prisma migrate deploy && node dist/main.js"
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    environment: { VITE_API_URL: "http://localhost:4000" }
volumes: { pgdata: }
```

```env
DATABASE_URL=postgresql://dpdp:dpdp@postgres:5432/dpdp
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=change-me-32-chars-minimum-please
JWT_REFRESH_SECRET=change-me-too-32-chars-minimum-ok
ENCRYPTION_KEY=                 # openssl rand -base64 32
ACCESS_LOG_RETENTION_DAYS=365   # SE-05 / RE-06 floor — configurable, never below 365
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

There is deliberately **no** `DEMO_SERVER_URL`. Wanting one means rule 2 is broken.

### 2.8 The sync pipeline

```
QUEUE      BullMQ job {dataSourceId, triggeredBy}, job id = sync:{dataSourceId}
  ↓
FETCH      RestApiConnector.fetchRecords() — paginated, read-only GET
  ↓
PERSIST    upsert SourceRecord (raw JSON + sha256); unchanged hash ⇒ skip the rest
  ↓
NORMALIZE  apply SourceFieldMapping → NormalizedRecord
  ↓
MATCH      deterministic identity resolution (4.4)
  ↓
LINK       create/attach IdentityLink, or raise MatchCandidate for human review
  ↓
ASSEMBLE   rebuild PrincipalDataField for every touched principal, set conflict flags (GO-03)
  ↓
AGE        derive ageStatus from DATE_OF_BIRTH where mapped; otherwise leave UNKNOWN (CH-01)
  ↓
AUDIT      SyncJob totals + AuditEvent(SYNC_COMPLETED)
```

Schedules are BullMQ repeatable jobs registered when a source is saved with a non-`MANUAL` frequency: `EVERY_15_MIN` = `*/15 * * * *`, `HOURLY` = `0 * * * *`, `DAILY` = `0 2 * * *` in the org timezone. Changing frequency **removes the old repeatable job first** or you silently stack duplicates. One sync per source at a time; a second trigger returns `409`.

---

## 3. GOALS

1. Tenant isolation that is structural, not a convention.
2. A connector layer where the demo company, a real CRM and a customer's internal API are indistinguishable to the rest of the code.
3. Idempotent sync: running it twice changes nothing.
4. Deterministic identity resolution that collapses ~500 records into ~327 people, refuses to guess, and is fully reversible — satisfying **GO-03**.
5. Complete source lineage on every value.
6. A **Record of Processing** covering purposes with lawful basis, processors, recipients, transfers, retention and security measures — satisfying **EV-01, EV-02, EV-09** and making **RT-04** answerable in MVP 2.
7. An access log of who viewed whose personal data, retained for at least a year — **SE-03, SE-05, EV-08**.
8. A Data Principal portal where a person sees her own data and provably nobody else's.
9. `docker compose up` from a clean clone reproduces everything.

---

## 4. REQUIREMENTS

### 4.1 Tenancy, auth and permissions (SE-02, GO-04)

**Tenant context.** Middleware reads the JWT and puts `{organizationId, actorType, actorId}` into `AsyncLocalStorage`. A Prisma client extension injects `organizationId` into every `where` and every `create` for tenant-scoped models. `Permission` is the only exempt model. **No service passes `organizationId` manually** — if one needs to, the extension has a gap.

**Employee auth.** `POST /api/auth/employee/login` → argon2id verify → access JWT (15 min, `aud: "employee"`) in the body, refresh token (7 days, `aud: "employee-refresh"`) in an httpOnly SameSite=Lax cookie. Refresh tokens are stored hashed and rotate on use; reuse of a revoked token revokes the family and writes `TOKEN_REUSE_DETECTED`.

**Principal auth.** Same mechanism, `aud: "principal"`. Guards check **audience**, not just signature — an employee token must fail on `/api/me/*` and vice versa.

**Permissions.** Seed this catalogue (MVP 2 entries seeded now so roles need no editing later):

```
MVP 1:  CAN_VIEW_PRINCIPALS          CAN_VIEW_ALL_PERSONAL_DATA   CAN_MANAGE_DATA_SOURCES
        CAN_RUN_SYNC                 CAN_RESOLVE_IDENTITIES       CAN_MANAGE_EMPLOYEES
        CAN_VIEW_AUDIT_LOG           CAN_CHANGE_ORG_SETTINGS      CAN_MANAGE_PURPOSES
        CAN_MANAGE_REGISTERS         CAN_EXPORT_EVIDENCE
MVP 2:  CAN_MANAGE_NOTICES           CAN_MANAGE_CONSENTS          CAN_MANAGE_REQUESTS
        CAN_SEND_MESSAGES            CAN_SEND_BREACH_NOTICES      CAN_MANAGE_BREACHES
        CAN_MANAGE_RETENTION         CAN_APPROVE_ERASURE          CAN_MANAGE_CHILD_DATA
        CAN_CHANGE_COMPLIANCE_CONFIG CAN_MANAGE_SDF
```

Default role map: **ADMIN** everything; **DPO** everything except `CAN_MANAGE_EMPLOYEES`; **COMPLIANCE_MANAGER** view principals + personal data, run sync, resolve identities, manage purposes/registers/requests/consents, send messages, export evidence, view audit; **EMPLOYEE** view principals + personal data, manage requests; **AUDITOR** view principals (masked), view audit log, export evidence — **no write permission of any kind**.

Enforcement is `@RequirePermission('CAN_X')`. The string `if (user.role === 'DPO')` must not appear anywhere.

**Masking (SE-01).** `CAN_VIEW_PRINCIPALS` without `CAN_VIEW_ALL_PERSONAL_DATA` returns masked values (`am**@gm***.com`, `+91 98****3210`). Masking happens in the service layer, never in React — an auditor must not be able to open devtools and read the real value.

**Access logging (SE-03).** Opening a principal detail page, exporting evidence, or reading `/api/principals/:id/source-records` writes `PERSONAL_DATA_VIEWED` with `subjectPrincipalId` set. This is the Rule 6(1)(c) visibility requirement, and Rule 6(1)(e) means those rows are retained at least a year — `ACCESS_LOG_RETENTION_DAYS` may be raised but the app refuses to start if it is set below 365.

### 4.2 Connector layer

```ts
export interface Connector {
  testConnection(): Promise<{ ok: boolean; message: string; latencyMs: number }>;
  discoverSchema(): Promise<{ fieldName: string; sampleValue: string | null; inferredType: string }[]>;
  fetchRecords(cursor?: string): Promise<{ records: unknown[]; nextCursor?: string }>;
  fetchChanges(since: Date): Promise<{ records: unknown[]; nextCursor?: string }>;
}
```

MVP 1 ships exactly one implementation, `RestApiConnector`:

- **GET only.** The HTTP client is built with an interceptor that throws if `method !== 'GET'` before a socket opens. A guarantee, not a policy.
- Timeout 15 s; 3 retries with backoff (1 s, 3 s, 9 s) on 5xx/network; **no retry on 4xx**.
- `discoverSchema()` reads one page, unions keys across the first 20 records, infers `string|number|boolean|date|null`, truncates samples to 40 chars, and **re-scrubs stored samples whenever a field is later marked `containsPersonalData`**.
- Pagination `?page=N&limit=M` until a short page; hard cap 500 pages then fail loudly.
- Credentials are decrypted only inside the connector, held in a local variable, never logged. Log lines strip query params.

### 4.3 Purposes and lawful basis (LB-01, LB-02, CN-02)

Creating a purpose **requires** `lawfulBasis`. If `LEGITIMATE_USE`, the s.7 limb is required too, and if `CONSENT`, the UI states plainly that a notice and consent record will be required in MVP 2 before that purpose may be relied on.

Hard rules:

- No default value. No inference. A source named "Marketing Database" does **not** get a marketing purpose automatically. **LB-02.**
- `dataCategories` on a purpose declares what is *necessary* for it. When a mapping assigns a category to a source attached to that purpose, and the category is not in the purpose's list, the UI raises a **data-minimisation warning** (CN-02). It warns; it does not block — a human decides.
- Until `reviewedByEmployeeId` is set, every screen showing that purpose carries an amber "Not yet reviewed" chip.
- A source with **no purpose attached** is legal to sync but shows "Purpose not configured" everywhere it appears, including in the Data Principal portal. Never a guessed purpose.

### 4.4 Normalization and identity resolution (GO-03)

**Email:** trim → NFKC → lowercase. Nothing else. Do **not** strip Gmail dots or `+tags`; that heuristic merges people who share an inbox convention. Invalid syntax → `emailNormalized = null`, raw kept.

**Phone** (India default, org `country` decides):
```
strip everything except digits and a leading +
starts with "+"            → keep
10 digits                  → "+91" + digits
11 digits starting "0"     → "+91" + digits.slice(1)
12 digits starting "91"    → "+" + digits
otherwise                  → null (raw kept, flagged unparseable)
```
Must pass: `98765 43210`, `+91-98765-43210`, `09876543210`, `919876543210`, `9876543210` → `+919876543210`. `123` → `null`.

**Name:** collapse whitespace, title-case for display, and store `nameKey` = lowercase alphanumeric tokens sorted (`"A. Sharma"` → `a sharma`; `"Sharma Aman"` and `"Aman Sharma"` → `aman sharma`). `nameKey` is a **supporting signal only, never a match rule**.

**Matching**, in this exact order, per normalized record:

1. **CUSTOMER_ID exact**, where the mapping has `isVerifiedCustomerId = true` → `EXACT`, auto-link.
2. **EMAIL exact** on `emailNormalized` → `EXACT`, auto-link.
3. **PHONE exact** on `phoneNormalized` → `HIGH`, auto-link.
4. **Supporting-signal**: `nameKey` equal **AND** at least one of (same `postalCode`, same `dateOfBirth`, same last-6 of phone) → `POSSIBLE`, score 0.5–0.8. **Do not link.** Raise a `MatchCandidate`.
5. Otherwise `UNMATCHED` → new `DataPrincipal`.

**Conflict rule:** if rules 1–3 point at two *different* existing principals, do not auto-merge. Link to the higher-confidence one and raise a candidate against the other with evidence `{"conflict":"EMAIL→A, PHONE→B"}`.

**Forbidden:** matching on name alone, name + city, fuzzy email similarity, or any probabilistic model. The demo data contains two different people called "Rahul Verma". Merging them creates a data breach inside the privacy product.

**Merge / unmerge.** Merge = re-parenting an `IdentityLink`. Unmerge = set `DETACHED` with a reason, create a fresh principal for the detached record, rebuild both profiles, write two audit events. Source records are never touched.

**Profile assembly** runs after every link change: gather ACTIVE-linked normalized records, group by `(canonicalField, value)`, union contributing `dataSourceIds`, mark `isPrimary` from the most recently synced record, and set `conflict = true` on any field with more than one distinct value. **Conflicts are the s.8(3) accuracy signal** — the dashboard counts them and the profile shows them in amber.

**Age status (CH-01 groundwork).** If `DATE_OF_BIRTH` is mapped and present, derive `ageStatus` (`CHILD` if under 18 at sync time, else `ADULT`) with `ageStatusSource = DOB_DERIVED`. If absent, leave `UNKNOWN` — never infer age from purchase behaviour, product category or name. An employee with `CAN_MANAGE_CHILD_DATA` may set it manually in MVP 2. The dashboard shows the count of `UNKNOWN` age status as a compliance gap, because a company that cannot tell adults from children cannot satisfy s.9.

### 4.5 API surface (MVP 1)

```
GET    /api/health                                  public
POST   /api/auth/employee/login | refresh | logout
GET    /api/auth/employee/me
POST   /api/auth/principal/login | refresh | logout
GET    /api/auth/principal/me

GET    /api/organization                            CAN_VIEW_PRINCIPALS
PATCH  /api/organization                            CAN_CHANGE_ORG_SETTINGS
GET    /api/permissions | /api/roles                CAN_MANAGE_EMPLOYEES
PATCH  /api/roles/:id/permissions                   CAN_MANAGE_EMPLOYEES
GET|POST|PATCH /api/employees[/:id]                 CAN_MANAGE_EMPLOYEES
POST   /api/employees/:id/reset-password            CAN_MANAGE_EMPLOYEES

GET    /api/purposes                                CAN_VIEW_PRINCIPALS
POST   /api/purposes | PATCH /api/purposes/:id      CAN_MANAGE_PURPOSES
POST   /api/purposes/:id/review                     CAN_MANAGE_PURPOSES

GET|POST|PATCH|DELETE /api/data-sources[/:id]       CAN_MANAGE_DATA_SOURCES
POST   /api/data-sources/:id/test-connection        CAN_MANAGE_DATA_SOURCES
POST   /api/data-sources/:id/discover-schema        CAN_MANAGE_DATA_SOURCES
GET    /api/data-sources/:id/fields                 CAN_MANAGE_DATA_SOURCES
PUT    /api/data-sources/:id/mappings               CAN_MANAGE_DATA_SOURCES
PUT    /api/data-sources/:id/purposes               CAN_MANAGE_PURPOSES
POST   /api/data-sources/:id/sync                   CAN_RUN_SYNC

GET|POST|PATCH /api/registers/recipients[/:id]      CAN_MANAGE_REGISTERS
GET|POST|PATCH /api/registers/sharing[/:id]         CAN_MANAGE_REGISTERS
GET|POST|PATCH /api/registers/transfers[/:id]       CAN_MANAGE_REGISTERS
GET|POST|PATCH /api/registers/retention[/:id]       CAN_MANAGE_REGISTERS
GET|POST|PATCH /api/registers/security[/:id]        CAN_MANAGE_REGISTERS

GET    /api/sync-jobs[?dataSourceId=&limit=]        CAN_RUN_SYNC
GET    /api/sync-jobs/:id                           CAN_RUN_SYNC

GET    /api/principals?q=&ageStatus=&page=          CAN_VIEW_PRINCIPALS
GET    /api/principals/:id                          CAN_VIEW_PRINCIPALS   (logs SE-03)
GET    /api/principals/:id/lineage                  CAN_VIEW_PRINCIPALS
GET    /api/principals/:id/source-records           CAN_VIEW_ALL_PERSONAL_DATA
GET    /api/principals/:id/recipients               CAN_VIEW_PRINCIPALS   (RT-04 preview)
POST   /api/principals/:id/unmerge                  CAN_RESOLVE_IDENTITIES
GET    /api/match-candidates?status=PENDING         CAN_RESOLVE_IDENTITIES
POST   /api/match-candidates/:id/confirm | reject   CAN_RESOLVE_IDENTITIES

GET    /api/inventory/summary                       CAN_VIEW_PRINCIPALS
GET    /api/inventory/ropa.csv                      CAN_EXPORT_EVIDENCE   (EV-02)
GET    /api/inventory/gaps                          CAN_VIEW_PRINCIPALS
GET    /api/audit-events?...                        CAN_VIEW_AUDIT_LOG
GET    /api/audit-events/access-log.csv             CAN_EXPORT_EVIDENCE   (EV-08)

GET    /api/me/profile | /api/me/data | /api/me/sources     principal token
```

`/api/me/*` resolves the principal **from the token only**. No route under `/api/me` accepts an ID parameter. This is the single most important security decision in the portal.

### 4.6 Frontend pages (MVP 1)

**Fiduciary portal** (`/app/*`):

| Route | Contents |
|---|---|
| `/login` | email + password, no self-signup |
| `/app` | Inventory dashboard: source count, raw records, unique principals, matched, pending review, **conflicts (GO-03)**, **unknown age status (CH-01)**, **purposes without a reviewed lawful basis (LB-02)**, **processors without a contract (GO-02)**, recent audit strip |
| `/app/data-sources` | table with status, last sync, record count, Sync now |
| `/app/data-sources/new` | 5-step wizard: ① connection + test ② discover schema ③ map fields + data category ④ attach purposes ⑤ declare hosting country and whether the source holds only publicly-available data |
| `/app/data-sources/:id` | tabs: Overview · Field Mapping · Purposes · Security Measures · Sync History |
| `/app/purposes` | purpose register: name, **lawful basis with s.7 limb**, categories, review status |
| `/app/registers` | tabs: Processors & Recipients · Sharing Activities · Cross-Border Transfers · Retention Policies · Security Measures (grouped by Rule 6 clause with an implemented/not chip) |
| `/app/principals` | searchable table (name/email/phone/customer ID), source badges, age-status chip |
| `/app/principals/:id` | identity header, contact and profile blocks, **lineage chip on every value**, conflict warnings, linked source records with Unmerge, purposes served, **recipients this person's data has been shared with (RT-04)** |
| `/app/review` | match candidate queue: record vs principal side by side, agreeing signals green, conflicting red, Confirm / Reject |
| `/app/employees` | list, create, disable, role change, reset password |
| `/app/audit` | filterable audit table, expandable metadata, access-log view filtered by subject principal |
| `/app/settings` | org details, **DPO / responsible person contact and where it is published (GO-10)**, timezone, SDF and Third Schedule self-declaration with an explicit "this is your determination, not ours" note |

**Principal portal** (`/me/*`) — plainer, larger type, no jargon:

| Route | Contents |
|---|---|
| `/me/login` | email + password |
| `/me` | "Hello, {name}", cards: Your Data · Where it came from · Who it's shared with · Privacy contacts. Slots for Consents / Requests / Messages show "Coming soon" until MVP 2 |
| `/me/data` | grouped by category, every value showing **"Held in: Marketing Database, Sales CRM"** and **"Used for: Customer Support, Order Fulfilment"**, or "Purpose not configured" |
| `/me/sources` | plain-language list of systems holding her data |
| `/me/recipients` | who her data has been shared with and a description of what — the RT-04 preview, read-only in MVP 1 |

UI rules: `sonner` toasts, skeleton loaders (never a bare spinner over a table), every empty state has one line of explanation and a next action, dates in org timezone with a UTC tooltip.

### 4.7 Audit requirements

`AuditService.record()` is the only writer. It runs in the caller's transaction, takes `Counter('AUDIT')` with `SELECT ... FOR UPDATE`, and stores `hash = sha256(previousHash + sequence + action + resourceId + canonicalJson(metadata) + createdAt)`.

MVP 1 actions:
```
EMPLOYEE_LOGIN_SUCCEEDED   EMPLOYEE_LOGIN_FAILED       PRINCIPAL_LOGIN_SUCCEEDED
EMPLOYEE_CREATED           EMPLOYEE_DISABLED           EMPLOYEE_ROLE_CHANGED
ORG_SETTINGS_UPDATED       SDF_STATUS_DECLARED         THIRD_SCHEDULE_CLASS_DECLARED
PURPOSE_CREATED            PURPOSE_UPDATED             PURPOSE_REVIEWED
DATA_SOURCE_CREATED        DATA_SOURCE_UPDATED         DATA_SOURCE_DELETED
DATA_SOURCE_CREDENTIALS_ROTATED                        FIELD_MAPPING_UPDATED
RECIPIENT_CREATED          RECIPIENT_UPDATED           SHARING_ACTIVITY_CREATED
TRANSFER_CREATED           RETENTION_POLICY_CREATED    SECURITY_MEASURE_UPDATED
SYNC_STARTED               SYNC_COMPLETED              SYNC_FAILED
PRINCIPAL_CREATED          IDENTITY_LINKED             IDENTITY_DETACHED
MATCH_CANDIDATE_CONFIRMED  MATCH_CANDIDATE_REJECTED    AGE_STATUS_SET
PERSONAL_DATA_VIEWED       EVIDENCE_EXPORTED           TOKEN_REUSE_DETECTED
```

### 4.8 The demo company server

Represents **Acme Retail Pvt Ltd**, a fake business with four unconnected systems.

```
GET /health
GET /api/marketing/customers?page=1&limit=100&updated_since=ISO
GET /api/sales/customers
GET /api/support/users
GET /api/ecommerce/customers
```
Envelope `{ "data": [...], "page": 1, "limit": 100, "total": 231 }` so `recordsPath = data`. Bearer key per system; wrong key → `401`. Anything other than GET → `405`.

Deliberately messy field names, so field mapping is a real step:

| System | Fields |
|---|---|
| marketing | `id, customer_email, mobile_number, first_name, surname, city, subscribed_on, campaign_source` |
| sales | `crm_id, primary_email, contact_no, full_name, billing_pincode, account_status, lifetime_value` |
| support | `user_ref, email_address, phone, name, last_ticket_at, tickets_count` |
| ecommerce | `customer_code, email, phone_number, first_name, last_name, dob, address_line_1, city, state, pincode, total_orders, total_spent` |

**Dataset: exactly 500 raw records across four systems representing exactly 327 distinct people.** Deterministic generator (fixed seed). Must include:

- people in 2 or 3 systems (shared email, or email in one and phone in another)
- capitalisation variants (`Aman Sharma` / `aman sharma` / `A. Sharma`)
- phone format variants (`98765 43210`, `+91-98765-43210`, `09876543210`)
- secondary emails (personal + work) for the same person
- ~30 records with no email, ~25 with no phone
- ~12 records with a conflicting field (two different cities for one person) — feeds the GO-03 conflict count
- **exactly 2 different people both named "Rahul Verma"** — the anti-merge trap
- **exactly 4 possible-duplicate pairs**: same `nameKey` + same pincode, no shared email or phone — must land in the review queue
- **exactly 6 records with a `dob` making the person under 18** (e-commerce only, since it is the only system with `dob`) — so the child-data gap is visible from day one

README must carry the copy-paste table:

```
Marketing   http://localhost:5001/api/marketing/customers   Bearer demo_marketing_readonly_123
Sales       http://localhost:5001/api/sales/customers       Bearer demo_sales_readonly_456
Support     http://localhost:5001/api/support/users         Bearer demo_support_readonly_789
E-commerce  http://localhost:5001/api/ecommerce/customers   Bearer demo_ecom_readonly_012
```

and the persona table:

| Person | Why they matter |
|---|---|
| Aman Sharma | In marketing, sales and support — the flagship 3-way merge |
| Neha Rao | Email in sales, phone-only in support — proves phone matching |
| Raj Patel | Two emails, one person — multi-identifier profile |
| Sara Khan | E-commerce only — the simple single-source case |
| Vikram Nair | Possible-duplicate pair — must reach the review queue |
| Rahul Verma ×2 | Two different humans, same name — must NOT merge |
| Ishaan Gupta | DOB under 18 — surfaces the children's-data gap (CH-01) |

**Demo employee accounts**, seeded by the platform (they are platform users, not demo-server data):
```
admin@acmeretail.demo / Password123!        ADMIN
dpo@acmeretail.demo / Password123!          DPO
compliance@acmeretail.demo / Password123!   COMPLIANCE_MANAGER
employee@acmeretail.demo / Password123!     EMPLOYEE
auditor@acmeretail.demo / Password123!      AUDITOR
```
**Demo principal accounts** are claimed by a seed script run *after* the first sync, for Aman, Neha, Raj, Sara and Vikram, password `Password123!`. A credentials banner renders only when `NODE_ENV !== 'production'`.

---

## 5. TASKS (build in this order — do not reorder)

1. Scaffold both projects; `docker compose up` with Postgres, Redis and MailHog only. Confirm `psql` connects from the host.
2. NestJS skeleton: config, pino, Swagger at `/api/docs`, `GET /api/health` reporting DB and Redis.
3. Prisma schema from 2.5 → `migrate dev` → raw SQL from 2.6 as a second migration. Prove the audit trigger fires from psql.
4. Tenant context + Prisma extension. Write the two-org isolation test and **do not proceed until it passes**.
5. `AuditService` with counter and hash chain. Everything after this calls it.
6. Auth: employees, then principals. Separate guards, audience checks, refresh rotation. Seed permissions, roles, the Acme org, five demo employees.
7. RBAC + masking + `PERSONAL_DATA_VIEWED` logging. Test AUDITOR gets `403` on every mutation.
8. Purpose register **with lawful basis** — before any data source exists, so no one is tempted to infer purpose later.
9. Build the **demo company server** end to end; verify standalone with curl.
10. `RestApiConnector` + `testConnection` + `discoverSchema`; data-source CRUD; credential encryption. Confirm the API never returns `credentialCipher`.
11. Field mapping + purpose attachment + the data-minimisation warning.
12. Registers: recipients, sharing, transfers, retention policies, security measures. Cheap to build, and they are what make MVP 2's access reports truthful.
13. Normalizers with unit tests first (the phone table in 4.4 is the fixture), then `SourceRecord → NormalizedRecord`.
14. Identity resolution: rules 1–5, conflict handling, candidates, profile assembly, age derivation. Unit-test each rule alone before a full sync.
15. BullMQ sync job, repeatable scheduling, the `sync:{id}` lock. Full sync against all four demo endpoints.
16. Merge/unmerge + review queue.
17. Frontend: login → shell → data source wizard → sync monitor → purposes → registers → principals → **principal detail with lineage** → review queue → employees → audit → settings.
18. Inventory dashboard, gaps view, RoPA export, access-log export.
19. Principal portal: login, `/me`, `/me/data`, `/me/sources`, `/me/recipients`, plus the account-claiming seed script.
20. Run the full evaluation checklist in section 6.

---

## 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)

Run after a full sync of all four demo sources.

#### Check 1: Tenant isolation is structural

- **Why it matters**: this is the failure that ends a B2B privacy company. There is no recovering from it.
- **How**: seed a second org "Globex" with one principal. As Acme's admin, call `GET /api/principals?q=` and `GET /api/principals/{globexId}` with curl.
- **Pass**: the list never contains Globex rows; the direct fetch returns `404` (not `403` — do not confirm the row exists). **Fail**: any leakage means a model is missing from the Prisma extension. Fix the extension, not the service.

#### Check 2: The demo server is genuinely detachable

- **How**:
```bash
grep -rn "demo-company-server\|demo_marketing\|localhost:5001" dpdp-platform/backend/src dpdp-platform/frontend/src
mv demo-company-server /tmp/ && cd dpdp-platform && npm --prefix backend run build && npm --prefix frontend run build
```
- **Pass**: grep returns nothing and both builds succeed with the demo gone. **Fail**: any import, hard-coded URL or env var referencing the demo.

#### Check 3: External access is provably read-only

- **Why it matters**: one accidental PUT into a customer's production CRM is a contract-ending event.
- **How**: call the connector's internal request helper with `method: 'POST'` in a test; watch the demo server access log during a full sync.
- **Pass**: the helper throws before a socket opens; the log shows only `GET`. **Fail**: if the guard is a code-review convention rather than an interceptor, add the interceptor.

#### Check 4: Sync is idempotent

- **How**: note `SELECT COUNT(*) FROM "SourceRecord"` and `"DataPrincipal"`, re-run all four syncs, re-count.
- **Pass**: unchanged; second `SyncJob` shows `recordsSkipped ≈ recordsRead`, `recordsCreated = 0`. **Fail**: growing counts mean the upsert isn't keyed on `(dataSourceId, sourceRecordKey)`, or the payload hash includes a field that changes every fetch.

#### Check 5: Normalization handles ugly real-world input

- **How**: run unit tests, then
```sql
SELECT "phoneRaw","phoneNormalized" FROM "NormalizedRecord" WHERE "phoneRaw" IS NOT NULL ORDER BY random() LIMIT 20;
```
- **Pass**: every non-null normalized phone is `+91` plus exactly 10 digits; emails lowercase and trimmed. **Fail**: any `+91+91…` double-prefix, or nulls on obviously valid numbers.

#### Check 6: 500 records become ~327 people

- **How**:
```sql
SELECT COUNT(*) FROM "SourceRecord";
SELECT COUNT(*) FROM "DataPrincipal";
SELECT COUNT(*) FROM "MatchCandidate" WHERE status='PENDING';
```
- **Pass**: 500 raw, 327 ± 4 people, 4 pending candidates. **Fail**: ~500 people means matching isn't running or normalized values are null; well under 300 means over-merging — go to Check 7.

#### Check 7: The Rahul Verma test (catches over-merging)

- **Why it matters**: merging two real people creates a data breach *inside* the privacy product — person A logs in and sees person B's phone number.
- **How**: `SELECT id, reference, "displayName" FROM "DataPrincipal" WHERE "displayName" ILIKE '%rahul verma%';`
- **Pass**: exactly 2 rows, each with its own source records. **Fail**: 1 row means a name-based rule crept in. Remove it.

#### Check 8: Aman merges across three systems with visible lineage

- **How**: open `/app/principals`, search "Aman", open the profile.
- **Pass**: one profile; three linked source records from three systems; the phone value's lineage chip names Marketing and Support; the email chip names Marketing and Sales. **Fail**: any value rendering without a source chip means profile assembly is dropping `sourceIds`.

#### Check 9: Merges are reversible

- **How**: unmerge Aman's support record with reason "test", then re-inspect.
- **Pass**: a new principal holding only that record; Aman now shows two; `SourceRecord` count unchanged; `IDENTITY_DETACHED` and `PRINCIPAL_CREATED` in the audit log; the phone lineage chip no longer names the detached source. **Fail**: any deleted row, or a stale lineage chip.

#### Check 10: Conflicts are surfaced, not silently resolved (GO-03)

- **Why it matters**: s.8(3) requires completeness, accuracy and consistency wherever data drives a decision or is disclosed. Silently picking one of two cities is the opposite of that.
- **How**: `SELECT COUNT(*) FROM "PrincipalDataField" WHERE conflict = true;` and open one of those profiles.
- **Pass**: roughly 12 conflicts (matching the seeded conflicting records), each shown in amber on the profile with both values and their sources, and counted on the dashboard. **Fail**: zero conflicts means assembly is overwriting instead of collecting.

#### Check 11: Purpose and lawful basis are never inferred (LB-02)

- **Why it matters**: inventing a lawful basis from a table name would make the platform generate false compliance records — the worst thing it could do.
- **How**: create a new data source named "Marketing Database", map its fields, attach **no** purpose, sync it. Open a principal sourced only from it, then view `/me/data` as that person. Then try `POST /api/purposes` without `lawfulBasis`.
- **Pass**: the UI shows "Purpose not configured" with a prompt for an admin — never a guessed purpose; the purpose POST returns `400`; a `LEGITIMATE_USE` purpose without a s.7 limb also returns `400`. **Fail**: any auto-assigned purpose or defaulted basis anywhere in the code.

#### Check 12: The registers actually answer s.11(1)(b) (RT-04)

- **Why it matters**: MVP 2 must tell a person exactly who her data was shared with. If the register is thin, that answer will be a lie.
- **How**: register a processor "CloudMail Pvt Ltd" with a contract, and a sharing activity for the Marketing purpose covering CONTACT categories sourced from the Marketing DB. Open any principal sourced from Marketing and check `/api/principals/:id/recipients`, then `/me/recipients` as that person.
- **Pass**: the recipient appears with the description of data shared, and does **not** appear for a principal sourced only from e-commerce. **Fail**: if every principal shows every recipient, the query is not filtering by contributing source.

#### Check 13: A processor cannot go live without a contract (GO-02)

- **How**: try to create an active `DATA_PROCESSOR` recipient with `contractExists = false`, via API and via psql.
- **Pass**: both rejected — the API with a `400` and the database with the `processor_requires_contract` constraint. **Fail**: if only the API blocks it, the constraint wasn't applied; s.8(2) deserves the database.

#### Check 14: Credentials are encrypted and never leave the backend

- **How**: `SELECT name, "credentialCipher", "credentialHint" FROM "DataSource";` then curl the data-sources list, then check devtools Network on the data-sources page.
- **Pass**: unreadable base64 in the DB; only `credentialHint` in the API; the real key never round-trips to prefill an edit form. **Fail**: replace prefill with a "Replace credentials" action that only ever sends a new value.

#### Check 15: The access log records who looked at whom (SE-03, SE-05)

- **How**: as `employee@acmeretail.demo`, open three different principal profiles. Then:
```sql
SELECT "actorLabel","subjectPrincipalId","createdAt" FROM "AuditEvent"
WHERE action='PERSONAL_DATA_VIEWED' ORDER BY "createdAt" DESC LIMIT 10;
```
Then set `ACCESS_LOG_RETENTION_DAYS=90` and restart the backend.
- **Pass**: three rows naming actor and subject; the backend **refuses to start** with retention below 365 and says why. **Fail**: a log without `subjectPrincipalId` cannot answer "who accessed this person's data", which is the whole point of Rule 6(1)(c).

#### Check 16: The audit log cannot be edited

- **How**:
```sql
UPDATE "AuditEvent" SET action='TAMPERED' WHERE id=(SELECT id FROM "AuditEvent" LIMIT 1);
DELETE FROM "AuditEvent" WHERE id=(SELECT id FROM "AuditEvent" LIMIT 1);
```
- **Pass**: both raise `AuditEvent rows are immutable`. **Fail**: the trigger wasn't applied — re-run migrations on a clean database to confirm it lives in version control, not just your local DB.

#### Check 17: Sequence has no gaps

- **How**: `SELECT sequence, action FROM "AuditEvent" ORDER BY sequence LIMIT 20;`
- **Pass**: starts at 1, no gaps, and every login / source creation / mapping update / sync / principal creation / unmerge is present. **Fail**: gaps mean the counter isn't locked in the transaction — use `SELECT ... FOR UPDATE`.

#### Check 18: RBAC is enforced server-side

- **How**: as auditor, confirm write buttons are hidden, then bypass the UI:
```bash
curl -X POST localhost:4000/api/data-sources -H "Authorization: Bearer <auditor token>" \
  -H 'Content-Type: application/json' -d '{"name":"x","baseUrl":"http://x"}'
```
- **Pass**: `403`, and masked emails on `/app/principals`. **Fail**: `201` means permissions live only in React.

#### Check 19: A principal sees only her own data (IDOR test)

- **Why it matters**: leaking one person's data to another through the *privacy portal* is the worst bug this app could ship.
- **How**: log in as Aman, capture the token, then:
```bash
curl localhost:4000/api/me/data -H "Authorization: Bearer <aman token>" | jq '.[].value'
curl localhost:4000/api/principals/<neha-id> -H "Authorization: Bearer <aman token>"
curl localhost:4000/api/me/data -H "Authorization: Bearer <employee token>"
```
- **Pass**: only Aman's values; `401`/`403`; `401` (audience mismatch). **Fail**: any cross-read. Confirm no `/api/me` route takes an ID.

#### Check 20: Age status is derived, never guessed (CH-01)

- **How**: `SELECT "ageStatus","ageStatusSource",COUNT(*) FROM "DataPrincipal" GROUP BY 1,2;` and open the dashboard gaps card.
- **Pass**: 6 `CHILD` with source `DOB_DERIVED`, the e-commerce adults `ADULT`, everyone else `UNKNOWN`; the dashboard shows the UNKNOWN count as a gap with an explanation that s.9 obligations cannot be met without it. **Fail**: any `ADULT`/`CHILD` set from anything other than a mapped date of birth.

#### Check 21: The RoPA export is real (EV-02)

- **How**: download `/api/inventory/ropa.csv` and open it.
- **Pass**: one row per purpose, with lawful basis, s.7 limb where relevant, data categories, source systems, recipients, cross-border destinations, retention policy and review status. **Fail**: if a column is blank because the register was never populated, that is a *finding*, not a bug — but the export must show the blank rather than omit the row.

#### Check 22: Performance on the demo dataset

- **Pass**: full four-source sync of 500 records < 30 s; principal search < 300 ms; principal detail < 500 ms with under 15 SQL queries (turn on Prisma query logging and count). **Fail**: hundreds of queries on the detail page means an N+1 in profile assembly or lineage — batch it.

#### Check 23: Timezone correctness

- **How**: run a sync, compare `SELECT "startedAt" FROM "SyncJob" ORDER BY "startedAt" DESC LIMIT 1;` with the UI.
- **Pass**: UTC in the DB, IST in the UI, UTC in the tooltip. **Fail**: a 5.5-hour discrepancy means someone converted twice — conversion happens exactly once, at render.

#### Check 24: Clean-clone reproducibility

- **How**: `git clone` fresh, copy `.env.example`, generate `ENCRYPTION_KEY`, `docker compose up --build`, `npm run seed`.
- **Pass**: full stack up and logged in as admin within 5 minutes, no manual SQL, no undocumented step. **Fail**: anything you had to "just remember" belongs in the README or the seed script.

---

## 7. MVP 1 GOAL (definition of done)

An admin logs into the Data Fiduciary Portal, declares the company's processing purposes **each with an explicit lawful basis under s.4 — consent or a named s.7 legitimate use** — then adds four external read-only APIs, maps each system's oddly-named fields, attaches purposes, and registers the processors, recipients, transfers, retention policies and security measures behind them. A sync turns 500 scattered records into 327 unique Data Principals, with four ambiguous pairs waiting for a human, two same-named strangers correctly kept apart, twelve field conflicts surfaced in amber, and six under-18 records flagged. Every value on every profile names the systems it came from, and the platform can already say which recipients hold that person's data. An employee can unmerge a bad match without losing a byte of source data. Aman logs into his own portal and sees exactly his data and nobody else's. Every personal-data view is recorded in an append-only, hash-chained log the database refuses to modify and the app refuses to retain for less than a year. The company can export a Record of Processing Activities and an access log. The whole thing starts with `docker compose up`, the demo company folder can be deleted without breaking a build, and no DPDP deadline or legal constant appears anywhere in the code.

**Checklist IDs satisfied by MVP 1:** SC-01…05 · LB-02 · CN-02 (mapping) · GO-01…05, GO-08 (field), GO-10 · SE-01…07 · RE-06, RE-08, RE-09 (model) · RT-04 (register) · PR-01…04 · CB-01 · EV-01, EV-02, EV-08, EV-09, EV-12.
