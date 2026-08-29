# DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS
### Notice · Consent · Children · Rights · Retention · Breach · Evidence
### Self-contained build document. Paste this entire file as your vibe-coding prompt.
### Read `DPDP_COMPLIANCE_CHECKLIST.md` alongside this. Every module below names the IDs it satisfies.

---

## 1. IDEA CONTEXT (read this first)

You are completing a **B2B SaaS platform that helps Indian businesses operate their obligations under the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025** (G.S.R. 846(E), notified 13 November 2025, commencing in phases — Rules 3 and 5–16 eighteen months after publication).

**MVP 1 already exists and works.** It gave you: a multi-tenant NestJS + Prisma + PostgreSQL backend; employee and Data Principal authentication with separate token audiences; permission-based RBAC with service-layer masking; an append-only, hash-chained audit log protected by a database trigger, doubling as the Rule 6(1)(c) access log; read-only REST connectors; a BullMQ sync engine; deterministic identity resolution producing canonical Data Principal profiles with source lineage and conflict flags; a purpose register where **every purpose carries an explicit lawful basis**; and the registers of processors, recipients, cross-border transfers, retention policies and security measures. A separate, entirely independent `demo-company-server` exposes four fake company databases so ~500 raw records resolve into ~327 real people, including six under-18 records and two same-named strangers who must never merge.

**This document is MVP 2 of 2.** Everything from MVP 1 stays. MVP 2 turns the profile into a working compliance operation:

1. **Compliance Rules Engine** — every deadline in the product is configuration with a citation, a basis and a DPO review flag.
2. **Notice** — itemised, standalone, plain-language notices with withdrawal, rights and Board-complaint links, versioned and multilingual.
3. **Consent** — purpose-specific, evidenced, withdrawable as easily as it was given.
4. **Children and persons with disability** — verifiable guardian consent, and hard blocks on tracking, monitoring and targeted advertising.
5. **Rights** — access (including who data was shared with), correction, erasure, nomination and grievance, with a state machine and deadlines.
6. **Retention and erasure** — inactivity clocks, 48-hour pre-erasure notices, and a one-year floor that erasure can never breach.
7. **Breach** — the Rule 7 content requirements, two Board stages, a 72-hour clock from awareness, and per-person delivery evidence.
8. **Communications** — templates, audience builder, campaigns, notifications.
9. **Significant Data Fiduciary pack** — DPIA and audit cycle, algorithm register, localisation.
10. **Board and Government interaction** — information requests, including ones the Data Principal must not be told about.
11. **The evidence pack** — everything exportable.

### The legal shape you are encoding (plain language)

- **Two lawful bases only**: consent (s.6) and the closed list of legitimate uses (s.7). MVP 1 already recorded which applies per purpose; MVP 2 enforces the consequences. A consent purpose needs a notice and a consent record. A legitimate-use purpose needs neither — and must not show a fake consent toggle.
- **Notice precedes consent.** Rule 3 requires it to be understandable independently of anything else, to itemise the personal data, to state the purpose and the specific goods/services or uses enabled, and to give the link for withdrawing consent, exercising rights and complaining to the Board.
- **Withdrawal must be as easy as giving.** Rule 3(c)(i) says so explicitly. If consent took one click, withdrawal takes one click.
- **A child is anyone under eighteen.** Verifiable parental consent is required, and **tracking, behavioural monitoring and targeted advertising directed at children are prohibited regardless of consent** (s.9(3)). That is a code-level block, not a policy sentence.
- **Grievance response has a hard ceiling of ninety days**, and the company must publish its own (shorter or equal) period. That is the only fixed response deadline the Rules impose on rights handling.
- **Breach intimation has no materiality threshold.** Every personal data breach is notifiable to each affected Data Principal without delay, and to the Board — an initial description without delay, then specified detailed information within 72 hours of *becoming aware*.
- **Erasure and retention pull in opposite directions.** Section 8(7) says erase when consent is withdrawn or the purpose is served; Rule 6(1)(e) and Rule 8(3) require a minimum one-year retention of personal data and logs. The Rules are law, so the floor wins — and the platform must never let an erasure job cross it.

### Non-negotiable rules (carried from MVP 1, still binding)

1. Read-only external access. A correction or erasure request is a **human workflow**, never an API write into a customer's system.
2. Zero code dependency between `/dpdp-platform` and `/demo-company-server`.
3. Tenant isolation via the Prisma extension, never hand-written `where` clauses.
4. **No legal value hard-coded.** Ever.
5. Every state change writes an `AuditEvent`.
6. UTC in the database, org timezone at render.
7. **The platform never concludes.** It tracks, reminds, evidences and prompts a human. Every generated notice is a **draft** until a human with the right permission approves it. Every seeded legal value shows its citation and an "unreviewed" badge until the DPO confirms it. No screen says the company "is compliant".

### One new rule, specific to MVP 2

8. **Compliance messaging and marketing are different species and never share a code path.** A breach notice reaches everyone affected regardless of consent. A promotion reaches only those who granted consent for that purpose, and never reaches a child. Mixing them is the defect that turns a privacy product into a spam tool or a compliance failure.

---

## 2. ARCHITECTURE

### 2.1 New packages (everything from MVP 1 stays)

| Purpose | Package |
|---|---|
| Template rendering | `handlebars` |
| Email delivery | `nodemailer` (→ MailHog in dev) |
| Date arithmetic | `date-fns`, `date-fns-tz` |
| PDF evidence exports | `pdfkit` |
| Countdowns | a `useCountdown` hook — no library |
| Template authoring | `@uiw/react-md-editor` (markdown, never raw HTML) |

```bash
cd dpdp-platform/backend  && npm i handlebars nodemailer date-fns date-fns-tz pdfkit && npm i -D @types/nodemailer
cd dpdp-platform/frontend && npm i date-fns date-fns-tz @uiw/react-md-editor
```

Templates are markdown. Handlebars runs with a **whitelisted variable set** and throws on anything else. This closes the hole where a template author injects script into a notice sent to thousands of people.

Add to `.env`:
```env
MAIL_TRANSPORT=smtp          # smtp | console
MAIL_HOST=mailhog
MAIL_PORT=1025
MAIL_FROM="Acme Privacy <privacy@acmeretail.demo>"
```

### 2.2 New Prisma models (all MVP 1 models unchanged)

```prisma
// ─────────────── enums ───────────────
enum RuleBasis        { STATUTORY SECTORAL ORG_POLICY INTERNAL_TARGET }
enum DeadlineUnit     { HOURS DAYS MONTHS YEARS }
enum NoticeStatus     { DRAFT PUBLISHED RETIRED }
enum RequestType      { ACCESS CORRECTION COMPLETION UPDATE ERASURE
                        CONSENT_WITHDRAWAL GRIEVANCE NOMINATION OTHER }
enum RequestStatus    { SUBMITTED VERIFICATION_REQUIRED OPEN ASSIGNED IN_PROGRESS
                        WAITING_FOR_PRINCIPAL ESCALATED COMPLETED REJECTED CANCELLED }
enum ConsentStatus    { GRANTED DENIED WITHDRAWN UNKNOWN NOT_REQUIRED }
enum ConsentChannel   { PORTAL EMAIL IMPORTED IN_PERSON API CONSENT_MANAGER }
enum GuardianKind     { PARENT_OF_CHILD LAWFUL_GUARDIAN_OF_PWD }
enum GuardianVerification { NONE EXISTING_RELIABLE_DETAILS SELF_PROVIDED_DETAILS
                            VIRTUAL_TOKEN DIGITAL_LOCKER COURT_ORDER
                            DESIGNATED_AUTHORITY LOCAL_LEVEL_COMMITTEE }
enum MessageCategory  { NOTICE CONSENT_REQUEST COMPLIANCE_NOTICE BREACH_NOTICE
                        REQUEST_UPDATE PRE_ERASURE_NOTICE GENERAL_NOTIFICATION MARKETING }
enum CampaignStatus   { DRAFT PENDING_APPROVAL APPROVED SENDING SENT FAILED CANCELLED }
enum DeliveryStatus   { PENDING DELIVERED FAILED SUPPRESSED }
enum DeliveryChannel  { PORTAL EMAIL }
enum BreachStatus     { DETECTED INVESTIGATING CONTAINED PRINCIPALS_NOTIFIED
                        BOARD_NOTIFIED CLOSED }
enum ObligationStatus { PENDING IN_PROGRESS DONE WAIVED OVERDUE }
enum ErasureState     { EVALUATED NOTICE_SENT DEFERRED_RETENTION_FLOOR
                        ON_LEGAL_HOLD READY_FOR_ERASURE ERASED CANCELLED }
enum SdfAssessmentKind { DPIA AUDIT }

// ─────────────── compliance rules engine ───────────────
model ComplianceRule {
  id String @id @default(uuid())
  organizationId String
  ruleCode String                 // GRIEVANCE_RESPONSE, BREACH_BOARD_DETAIL, ...
  version Int @default(1)
  name String
  jurisdiction String @default("IN")
  legalSource String              // "DPDP Rules, 2025 — Rule 14(3)"
  basis RuleBasis
  appliesTo String                // "REQUEST:GRIEVANCE" | "BREACH:BOARD_DETAIL" | ...
  deadlineValue Int
  deadlineUnit DeadlineUnit
  warningLead Int
  escalateOnBreach Boolean @default(false)
  publishedPeriodText String?     // RT-11: the period the company publishes
  effectiveFrom DateTime
  effectiveUntil DateTime?
  enabled Boolean @default(true)
  reviewedByEmployeeId String?    // null ⇒ "unreviewed" badge everywhere it is used
  reviewedAt DateTime?
  notes String?
  createdAt DateTime @default(now())
  @@unique([organizationId, ruleCode, version])
  @@index([organizationId, appliesTo, enabled])
}

// ─────────────── notice (NT-01…NT-10) ───────────────
model PrivacyNotice {
  id String @id @default(uuid())
  organizationId String
  code String                     // ACCOUNT_SIGNUP, MARKETING_OPTIN, LEGACY_CONSENT
  name String
  purposeIds String[]             // purposes this notice covers
  status NoticeStatus @default(DRAFT)
  currentVersionId String?
  createdAt DateTime @default(now())
  versions NoticeVersion[]
  @@unique([organizationId, code])
}
model NoticeVersion {
  id String @id @default(uuid())
  organizationId String
  noticeId String
  version Int
  // Rule 3(b)(i): itemised description of the personal data
  itemisedDataFields Json         // [{canonicalField, dataCategory, label}]
  // Rule 3(b)(ii): purpose + specific description of goods/services or uses enabled
  purposeStatements Json          // [{purposeId, purposeName, goodsOrServices}]
  // Rule 3(c): the three links
  withdrawalUrl String
  rightsUrl String
  boardComplaintUrl String
  bodyMarkdown String             // the standalone notice body
  contentHash String              // sha256 — what she actually saw  (CN-09)
  publishedAt DateTime?
  retiredAt DateTime?
  createdByEmployeeId String
  approvedByEmployeeId String?
  notice PrivacyNotice @relation(fields: [noticeId], references: [id], onDelete: Cascade)
  translations NoticeTranslation[]
  @@unique([noticeId, version])
}
model NoticeTranslation {          // NT-08: English + 22 Eighth Schedule languages
  id String @id @default(uuid())
  organizationId String
  noticeVersionId String
  languageCode String              // en, as, bn, brx, doi, gu, hi, kn, ks, kok, mai,
                                   // ml, mni, mr, ne, or, pa, sa, sat, sd, ta, te, ur
  bodyMarkdown String
  translatedByEmployeeId String?
  noticeVersion NoticeVersion @relation(fields: [noticeVersionId], references: [id], onDelete: Cascade)
  @@unique([noticeVersionId, languageCode])
}

// ─────────────── consent (CN-01…CN-11) ───────────────
model ConsentRecord {              // current state: one per (principal, purpose)
  id String @id @default(uuid())
  organizationId String
  dataPrincipalId String
  purposeId String                 // → MVP 1 ProcessingPurpose, basis must be CONSENT
  status ConsentStatus @default(UNKNOWN)
  grantedAt DateTime?  withdrawnAt DateTime?  deniedAt DateTime?
  channel ConsentChannel?
  noticeVersionId String?
  noticeContentHash String?
  givenByGuardianId String?        // CH-01: consent given by a parent/guardian
  consentManagerRef String?        // CN-08 stub
  evidence Json @default("{}")     // {ip, userAgent, campaignId, sessionRef}
  updatedAt DateTime @updatedAt
  events ConsentEvent[]
  @@unique([dataPrincipalId, purposeId])
  @@index([organizationId, purposeId, status])
}
model ConsentEvent {               // append-only history
  id String @id @default(uuid())
  organizationId String  consentRecordId String
  fromStatus ConsentStatus?  toStatus ConsentStatus
  channel ConsentChannel  noticeVersionId String?  noticeContentHash String?
  evidence Json @default("{}")
  actorType ActorType  actorLabel String
  createdAt DateTime @default(now())
  record ConsentRecord @relation(fields: [consentRecordId], references: [id], onDelete: Cascade)
  @@index([consentRecordId, createdAt])
}

// ─────────────── children & guardians (CH-01…CH-10) ───────────────
model GuardianRelationship {
  id String @id @default(uuid())
  organizationId String
  dataPrincipalId String            // the child or person with disability
  kind GuardianKind
  guardianName String
  guardianEmail String?
  guardianPhone String?
  verification GuardianVerification @default(NONE)
  verificationReference String?     // token ref, DigiLocker ref, court order number
  verifiedByEmployeeId String?
  verifiedAt DateTime?
  // Rule 11: appointment authority for a person with disability
  appointingAuthority String?       // COURT | DESIGNATED_AUTHORITY | LOCAL_LEVEL_COMMITTEE
  appointmentReference String?
  active Boolean @default(true)
  createdAt DateTime @default(now())
  @@index([organizationId, dataPrincipalId])
}
model ChildExemptionClaim {         // CH-06, CH-07 — always cites the Schedule row
  id String @id @default(uuid())
  organizationId String
  purposeId String
  schedulePart String               // "Fourth Schedule Part A" | "Part B"
  scheduleRow Int
  conditionText String              // pasted from the Schedule, for the record
  justification String
  claimedByEmployeeId String  claimedAt DateTime @default(now())
  reviewedByEmployeeId String?  reviewedAt DateTime?
  @@index([organizationId, purposeId])
}

// ─────────────── rights (RT-01…RT-16) ───────────────
model PrincipalRequest {
  id String @id @default(uuid())
  organizationId String
  reference String                 // REQ-001028
  dataPrincipalId String
  submittedByGuardianId String?    // a guardian may exercise for a child
  type RequestType
  status RequestStatus @default(SUBMITTED)
  subject String  body String
  requestedChanges Json @default("{}")   // {"PHONE":{"from":"...","to":"..."}}
  channel String @default("PORTAL")
  identityVerifiedBy String?       // RT-14: published identifier used
  identityVerifiedAt DateTime?
  assignedEmployeeId String?  escalatedAt DateTime?
  // deadline SNAPSHOT — copied at creation, never recomputed
  ruleId String?  ruleCodeSnapshot String?  ruleVersionSnapshot Int?
  ruleBasisSnapshot RuleBasis?  legalSourceSnapshot String?
  submittedAt DateTime @default(now())
  dueAt DateTime?  warningAt DateTime?  completedAt DateTime?
  isOverdue Boolean @default(false)
  isFrivolousFlagged Boolean @default(false)   // RT-15 — flag only, never auto-reject
  frivolousReason String?
  outcomeCode String?              // FULFILLED | PARTIALLY_FULFILLED | REJECTED
  outcome String?  rejectionReason String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  events RequestEvent[]
  @@unique([organizationId, reference])
  @@index([organizationId, status, dueAt])
  @@index([organizationId, dataPrincipalId])
}
model RequestEvent {
  id String @id @default(uuid())
  organizationId String  requestId String
  fromStatus RequestStatus?  toStatus RequestStatus?
  actorType ActorType  actorId String?  actorLabel String
  note String?  visibleToPrincipal Boolean @default(false)
  createdAt DateTime @default(now())
  request PrincipalRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  @@index([requestId, createdAt])
}
model Nomination {                 // RT-13, s.14
  id String @id @default(uuid())
  organizationId String  dataPrincipalId String
  nomineeName String  nomineeEmail String?  nomineePhone String?
  relationship String
  scope String                     // ALL_RIGHTS | ACCESS_ONLY | ERASURE_ONLY
  activationCondition String       // DEATH | INCAPACITY | BOTH
  particularsProvided Json @default("{}")   // Rule 14(4) particulars required
  active Boolean @default(true)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  @@index([organizationId, dataPrincipalId])
}

// ─────────────── retention & erasure (RE-01…RE-09) ───────────────
model ErasureTask {
  id String @id @default(uuid())
  organizationId String
  dataPrincipalId String
  retentionPolicyId String?
  trigger String                   // CONSENT_WITHDRAWN | PURPOSE_SERVED | INACTIVITY | REQUEST
  state ErasureState @default(EVALUATED)
  evaluatedAt DateTime @default(now())
  preErasureNoticeDueAt DateTime?  // RE-05: policy.preErasureNoticeHours before erasureDueAt
  preErasureNoticeSentAt DateTime?
  erasureDueAt DateTime?
  retentionFloorUntil DateTime?    // RE-06/RE-07: the one-year minimum, never crossed
  legalHoldId String?
  systemChecklist Json @default("[]")  // [{dataSourceId, done, byEmployeeId, at}]
  processorChecklist Json @default("[]") // RE-02: [{recipientId, confirmed, ref, at}]
  completedAt DateTime?  completedByEmployeeId String?
  cancelledReason String?
  ruleCodeSnapshot String?  ruleVersionSnapshot Int?
  @@index([organizationId, state, erasureDueAt])
  @@index([organizationId, dataPrincipalId])
}
model LegalHold {
  id String @id @default(uuid())
  organizationId String
  name String  reason String  legalCitation String
  scope Json @default("{}")        // {principalIds?, purposeIds?, categories?}
  startedAt DateTime @default(now())  endsAt DateTime?
  createdByEmployeeId String
  @@index([organizationId])
}

// ─────────────── messaging ───────────────
model MessageTemplate {
  id String @id @default(uuid())
  organizationId String
  code String  name String  category MessageCategory
  subject String  bodyMarkdown String
  variables String[]  requiredVariables String[]   // render fails if any is missing
  isSystem Boolean @default(false)  version Int @default(1)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  @@unique([organizationId, code, version])
}
model MessageCampaign {
  id String @id @default(uuid())
  organizationId String
  reference String                 // CMP-000042
  name String  category MessageCategory
  templateId String?  subject String  bodyMarkdown String
  audienceFilter Json
  purposeId String?                // required for CONSENT_REQUEST and MARKETING
  noticeVersionId String?          // required for CONSENT_REQUEST  (NT-01)
  breachId String?                 // required for BREACH_NOTICE
  status CampaignStatus @default(DRAFT)
  recipientCount Int @default(0)  sentCount Int @default(0)
  failedCount Int @default(0)  suppressedCount Int @default(0)
  createdByEmployeeId String
  approvedByEmployeeId String?  approvedAt DateTime?  sentAt DateTime?
  createdAt DateTime @default(now())
  recipients CampaignRecipient[]
  @@unique([organizationId, reference])
}
model CampaignRecipient {
  id String @id @default(uuid())
  organizationId String  campaignId String  dataPrincipalId String
  channel DeliveryChannel  address String?
  status DeliveryStatus @default(PENDING)
  suppressReason String?           // NO_CONSENT | CHILD_MARKETING_PROHIBITED |
                                   // NO_ADDRESS | DUPLICATE | NON_DISCLOSURE_ORDER
  renderedSubject String?  renderedBody String?   // the evidence artefact
  sentAt DateTime?  failureReason String?
  campaign MessageCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, dataPrincipalId, channel])
  @@index([organizationId, dataPrincipalId])
}
model Notification {
  id String @id @default(uuid())
  organizationId String  audience ActorType
  employeeId String?  dataPrincipalId String?
  title String  body String  severity String @default("INFO")
  linkPath String?  campaignId String?
  readAt DateTime?  createdAt DateTime @default(now())
  @@index([organizationId, employeeId, readAt])
  @@index([organizationId, dataPrincipalId, readAt])
}

// ─────────────── breach (BR-01…BR-15) ───────────────
model BreachIncident {
  id String @id @default(uuid())
  organizationId String
  reference String                 // BR-000003
  title String  description String
  occurredAt DateTime?             // when it happened
  becameAwareAt DateTime           // BR-14: the ONLY clock start that matters
  discoveredByEmployeeId String
  affectedSourceIds String[]
  dataCategories DataCategory[]
  involvesChildren Boolean @default(false)   // CH-10 risk flag
  // Rule 7(1) content, drafted once and reused per recipient
  natureExtentTiming String?       // BR-02
  consequences String?             // BR-03
  mitigationMeasures String?       // BR-04
  safetyMeasuresForPrincipals String?  // BR-05
  responderContact String?         // BR-06
  // Rule 7(2)(b) Board detail content
  boardBroadFacts String?          // BR-09
  boardMitigation String?          // BR-10
  boardPerpetratorFindings String? // BR-11
  boardRemedialMeasures String?    // BR-12
  boardExtensionRequestedAt DateTime?   // BR-15
  boardExtensionGrantedUntil DateTime?
  boardExtensionReference String?
  status BreachStatus @default(DETECTED)
  closedAt DateTime?  closureNote String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  obligations BreachObligation[]
  affected BreachAffectedPrincipal[]
  @@unique([organizationId, reference])
  @@index([organizationId, status])
}
model BreachObligation {           // one row per clock — no hard-coded columns
  id String @id @default(uuid())
  organizationId String  breachId String
  code String                      // BOARD_INITIAL | BOARD_DETAIL | PRINCIPAL_NOTICE |
                                   // CERT_IN_INCIDENT
  ruleCodeSnapshot String  ruleVersionSnapshot Int
  legalSourceSnapshot String  basisSnapshot RuleBasis
  dueAt DateTime  warningAt DateTime
  status ObligationStatus @default(PENDING)
  completedAt DateTime?  completedByEmployeeId String?
  evidenceReference String?  waiverReason String?
  breach BreachIncident @relation(fields: [breachId], references: [id], onDelete: Cascade)
  @@unique([breachId, code])
  @@index([organizationId, status, dueAt])
}
model BreachAffectedPrincipal {
  id String @id @default(uuid())
  organizationId String  breachId String  dataPrincipalId String
  notifiedAt DateTime?  notificationChannel DeliveryChannel?
  campaignRecipientId String?      // BR-13: the delivery evidence
  addedAt DateTime @default(now())
  breach BreachIncident @relation(fields: [breachId], references: [id], onDelete: Cascade)
  @@unique([breachId, dataPrincipalId])
  @@index([organizationId, dataPrincipalId])
}

// ─────────────── SDF pack (SD-01…SD-07) ───────────────
model SdfAssessment {
  id String @id @default(uuid())
  organizationId String
  kind SdfAssessmentKind           // DPIA or AUDIT — Rule 13(1) requires both, yearly
  cycleStartedAt DateTime  dueAt DateTime
  conductedBy String               // independent data auditor / assessor name
  isIndependent Boolean @default(false)   // SD-02
  completedAt DateTime?
  significantObservations String?
  reportReference String?
  furnishedToBoardAt DateTime?     // SD-04
  furnishedReference String?
  createdAt DateTime @default(now())
  @@index([organizationId, kind, dueAt])
}
model AlgorithmRegisterEntry {     // SD-05, Rule 13(3)
  id String @id @default(uuid())
  organizationId String
  name String  description String
  operations String[]              // HOSTING DISPLAY UPLOADING MODIFICATION PUBLISHING
                                   // TRANSMISSION STORAGE UPDATING SHARING
  riskAssessment String?
  riskToRightsIdentified Boolean @default(false)
  mitigations String?
  lastReviewedAt DateTime?  reviewedByEmployeeId String?
  @@index([organizationId])
}

// ─────────────── Board & Government (BD-01…BD-06) ───────────────
model InformationRequest {         // Rule 23 + Seventh Schedule
  id String @id @default(uuid())
  organizationId String
  reference String
  requestingBody String            // BOARD | CENTRAL_GOVERNMENT
  authorisedPersonRef String       // Seventh Schedule authorised person
  purposeCited String
  receivedAt DateTime  responseDueAt DateTime   // "specified period" — per request
  // Rule 23(2): non-disclosure direction
  nonDisclosureDirected Boolean @default(false)
  nonDisclosurePermissionRef String?
  affectedPrincipalIds String[]
  respondedAt DateTime?  responseReference String?
  createdAt DateTime @default(now())
  @@unique([organizationId, reference])
}
model VoluntaryUndertaking {       // BD-06, s.32
  id String @id @default(uuid())
  organizationId String
  reference String  summary String  acceptedAt DateTime
  commitments Json @default("[]")  // [{text, dueAt, status}]
  closedAt DateTime?
  @@unique([organizationId, reference])
}
```

Add `Counter` names: `REQUEST`, `CAMPAIGN`, `BREACH`, `INFO_REQUEST`.

### 2.3 Raw SQL follow-up migration

```sql
-- Consent and request history are evidence. Same immutability as the audit log.
CREATE TRIGGER consent_event_no_update BEFORE UPDATE ON "ConsentEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_is_immutable();
CREATE TRIGGER consent_event_no_delete BEFORE DELETE ON "ConsentEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_is_immutable();
CREATE TRIGGER request_event_no_update BEFORE UPDATE ON "RequestEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_is_immutable();

-- A published notice version is what she saw. It cannot change afterwards.
CREATE OR REPLACE FUNCTION notice_version_frozen() RETURNS trigger AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL
     AND (NEW."bodyMarkdown" IS DISTINCT FROM OLD."bodyMarkdown"
       OR NEW."contentHash"  IS DISTINCT FROM OLD."contentHash") THEN
    RAISE EXCEPTION 'Published notice versions are immutable — create a new version';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER notice_frozen BEFORE UPDATE ON "NoticeVersion"
  FOR EACH ROW EXECUTE FUNCTION notice_version_frozen();

-- A delivered message's rendered body is evidence of what was actually sent.
CREATE OR REPLACE FUNCTION recipient_body_frozen() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'DELIVERED' AND NEW."renderedBody" IS DISTINCT FROM OLD."renderedBody" THEN
    RAISE EXCEPTION 'Delivered message content is immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER recipient_frozen BEFORE UPDATE ON "CampaignRecipient"
  FOR EACH ROW EXECUTE FUNCTION recipient_body_frozen();

-- RE-07: erasure can never cross the mandatory retention floor.
ALTER TABLE "ErasureTask" ADD CONSTRAINT erasure_respects_floor
  CHECK ("retentionFloorUntil" IS NULL OR "erasureDueAt" IS NULL
         OR "erasureDueAt" >= "retentionFloorUntil");

-- Deadline scanning
CREATE INDEX request_due_scan ON "PrincipalRequest" ("organizationId","dueAt")
  WHERE status NOT IN ('COMPLETED','REJECTED','CANCELLED');
CREATE INDEX obligation_due_scan ON "BreachObligation" ("organizationId","dueAt")
  WHERE status IN ('PENDING','IN_PROGRESS');
```

### 2.4 Seeded compliance rules — defaults for a DPO to review, not legal advice

| ruleCode | appliesTo | Value | Basis | legalSource |
|---|---|---|---|---|
| `GRIEVANCE_RESPONSE` | `REQUEST:GRIEVANCE` | 90 DAYS, warn 14 | STATUTORY | DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days |
| `BREACH_PRINCIPAL_NOTICE` | `BREACH:PRINCIPAL_NOTICE` | 24 HOURS, warn 6 | INTERNAL_TARGET | Rule 7(1) requires intimation "without delay"; 24h is the company's operational target, not a statutory figure |
| `BREACH_BOARD_INITIAL` | `BREACH:BOARD_INITIAL` | 6 HOURS, warn 2 | INTERNAL_TARGET | Rule 7(2)(a) requires intimation "without delay"; the number is the company's target |
| `BREACH_BOARD_DETAIL` | `BREACH:BOARD_DETAIL` | 72 HOURS, warn 12 | STATUTORY | Rule 7(2)(b): detailed information within 72 hours of becoming aware, unless the Board allows longer on written request |
| `CERT_IN_INCIDENT` | `BREACH:CERT_IN_INCIDENT` | 6 HOURS, warn 2 | SECTORAL | CERT-In Directions, 28 April 2022 — a separate obligation under a different law, disabled by default |
| `REQUEST_ACCESS` | `REQUEST:ACCESS` | 30 DAYS, warn 7 | ORG_POLICY | Company service level — the Rules set no separate figure for access |
| `REQUEST_CORRECTION` | `REQUEST:CORRECTION` | 30 DAYS, warn 7 | ORG_POLICY | Company service level |
| `REQUEST_ERASURE` | `REQUEST:ERASURE` | 30 DAYS, warn 7 | ORG_POLICY | Company service level |
| `REQUEST_CONSENT_WITHDRAWAL` | `REQUEST:CONSENT_WITHDRAWAL` | 7 DAYS, warn 2 | ORG_POLICY | Withdrawal must take effect within a reasonable time (s.6(6)) |
| `REQUEST_NOMINATION` / `REQUEST_OTHER` | respective | 30 DAYS, warn 7 | ORG_POLICY | Company service level |
| `RETENTION_INACTIVITY` | `RETENTION:INACTIVITY` | 3 YEARS, warn 30 days | STATUTORY | Rule 8(1) + Third Schedule — **only applies if the org's `thirdScheduleClass` is not NONE**; disabled by default |
| `PRE_ERASURE_NOTICE` | `RETENTION:PRE_ERASURE_NOTICE` | 48 HOURS | STATUTORY | Rule 8(2): at least forty-eight hours before erasure |
| `LOG_RETENTION_MINIMUM` | `RETENTION:LOG_FLOOR` | 1 YEARS | STATUTORY | Rule 6(1)(e) and Rule 8(3): minimum one year |
| `SDF_ASSESSMENT_CYCLE` | `SDF:DPIA_AUDIT` | 12 MONTHS, warn 30 days | STATUTORY | Rule 13(1): once in every period of twelve months |
| `LEGACY_CONSENT_NOTICE` | `NOTICE:LEGACY_CONSENT` | 90 DAYS, warn 30 | INTERNAL_TARGET | s.5(2) requires notice "as soon as reasonably practicable"; the number is the company's target |

Every seeded rule has `reviewedByEmployeeId = null`. Anywhere a deadline from an unreviewed rule appears, the UI shows an amber **"Rule not yet reviewed by your DPO"** chip linking to `/app/settings/compliance`. Never label an `ORG_POLICY` or `INTERNAL_TARGET` row as `STATUTORY` — telling a customer their own SLA is the law is worse than having no number.

### 2.5 Background jobs (added to the MVP 1 BullMQ setup)

| Job | Schedule | Does |
|---|---|---|
| `deadline-scan` | every 15 min | Requests past `warningAt` → one employee notification (idempotent via a flag on a `RequestEvent`). Past `dueAt` → set `isOverdue`, notify assignee and DPO, escalate if the snapshot rule says so. **Reads stored `dueAt` only — never recomputes.** |
| `breach-clock` | every 5 min | Notifies the DPO at 50%, 75% and 90% of each `BreachObligation` window; marks `OVERDUE` after. |
| `retention-scan` | daily 01:00 | Evaluates inactivity and purpose-served triggers, creates `ErasureTask`s, computes `retentionFloorUntil`, schedules pre-erasure notices. |
| `pre-erasure-notice` | daily 01:30 | Sends notices for tasks whose `preErasureNoticeDueAt` has arrived (RE-05). |
| `consent-backfill` | on purpose create | Creates `UNKNOWN` consent rows for every principal (CN-10). |
| `campaign-send` | on demand | One recipient per job, concurrency 10, 3 retries then `FAILED`. |
| `sdf-cycle-scan` | daily 02:00 | Opens the next DPIA/audit cycle and warns as `dueAt` approaches (SD-03). |
| `audit-chain-verify` | daily 03:00 | Re-walks the hash chain per org; a mismatch raises a CRITICAL notification to every ADMIN. |
| `access-log-retention` | daily 04:00 | Deletes access-log rows **older than** `ACCESS_LOG_RETENTION_DAYS`; refuses to run if that is under 365 (SE-05). |

---

## 3. GOALS

1. Every date the product shows traces to a `ComplianceRule` row with a citation, a basis and a review state.
2. Notices that meet Rule 3 structurally — itemised, standalone, three links, versioned, hash-pinned, multilingual.
3. Consent that is purpose-specific, evidenced, historised, never silently converted from UNKNOWN to DENIED, and withdrawable in one click.
4. Children's data that **cannot** be marketed to, tracked or behaviourally monitored, enforced in the service layer.
5. A rights workflow with a state machine, verified identity, snapshotted deadlines and a 90-day grievance ceiling that is measured, not assumed.
6. Retention that erases when it should and **never** erases inside a mandatory retention window.
7. A breach workflow with content matching Rule 7 item by item, two Board stages, a clock from awareness, and per-person delivery evidence.
8. An audience builder where the previewed count is exactly who gets contacted.
9. An evidence pack a company can hand to an auditor in one click.
10. The full acceptance demo in section 7, end to end, with no SQL.

---

## 4. REQUIREMENTS

### 4.1 ComplianceService — the engine everything calls

```ts
resolveRule(appliesTo: string, at: Date): Promise<ComplianceRule | null>
computeDeadline(rule, from: Date): { dueAt: Date; warningAt: Date }
snapshotOnto(entity, rule, dueAt, warningAt): void   // id, code, version, basis, legalSource
```

- Deadlines are **calendar** time. `DAYS` = `addDays`, `HOURS` = `addHours`, `MONTHS` = `addMonths`, `YEARS` = `addYears`. Timezone matters only for display.
- **Editing a rule creates version N+1.** It never mutates the row in use. Existing requests and breach obligations keep their snapshots; only new ones use the new version. This is the difference between an audit-defensible product and a liability.
- If no rule matches, the entity is still created, `dueAt` is null, and the UI shows **"No deadline rule configured"** with a link for the DPO. Never fall back to a number in code.
- `RETENTION_INACTIVITY` resolves to null unless the org's `thirdScheduleClass` is set — the three-year rule applies only to the Third Schedule classes, and pretending otherwise would make the platform erase data it has no basis to erase.
- Rule changes require `CAN_CHANGE_COMPLIANCE_CONFIG` and write `COMPLIANCE_RULE_CHANGED` with a before/after diff.

### 4.2 Notice builder (NT-01…NT-10)

A notice is composed, not typed free-hand. The builder:

1. Pulls the **itemised data list** from the MVP 1 mappings for the purposes selected — the admin ticks which itemised fields appear (Rule 3(b)(i)). The list cannot be empty.
2. Pulls each purpose's name, description and `goodsOrServicesDescription` (Rule 3(b)(ii)). If a purpose has no goods/services description, the builder blocks publication and says which purpose is incomplete.
3. Requires the three URLs — withdrawal, rights, Board complaint (Rule 3(c)). All three are mandatory; publication fails without them.
4. Renders a **standalone preview** with nothing else on the page — a literal check on Rule 3(a).
5. Computes `contentHash` on publication and freezes the version (trigger in 2.3).
6. Supports per-language bodies for English plus the 22 Eighth Schedule languages. A language dropdown appears in the Data Principal portal; missing translations fall back to English with a visible note. The platform **stores and serves** translations; it does not translate.

A `CONSENT_REQUEST` campaign cannot be created without a **published** notice version attached. That is how NT-01 ("notice precedes consent") becomes structural.

`LEGACY_CONSENT` notices (s.5(2), NT-09) get their own template and campaign category, for consent obtained before the Act commenced.

### 4.3 Consent (CN-01…CN-11)

- Consent rows exist only for purposes whose `lawfulBasis = CONSENT`. A legitimate-use purpose **never renders a toggle** — it renders an information card explaining the basis and the s.7 limb (LB-06).
- `consent-backfill` creates `UNKNOWN` rows for every principal when a consent purpose is created, and for every new principal at creation.
- **Never write DENIED because evidence is missing.** Absence of evidence is `UNKNOWN`, forever, until the person says otherwise. An agent will get this wrong unless it is repeated, so it is repeated here.
- Every status change appends a `ConsentEvent` with channel, notice version, **notice content hash**, IP and user agent. The hash is what lets a company prove exactly what wording she saw (CN-09).
- **Withdrawal is one click**, then a confirmation dialog stating plainly what will stop happening. It takes effect immediately — it does not create a request the company must approve. The withdrawal control sits on the same screen, at the same depth, as the grant control (CN-05, Rule 3(c)(i)). Write a UI test asserting both are reachable in the same number of clicks.
- Withdrawal triggers, in one transaction: consent status → `WITHDRAWN`, a `ConsentEvent`, an `ErasureTask` with trigger `CONSENT_WITHDRAWN` (s.8(7)), and a suppression of that purpose in all future audiences.
- Processing already performed lawfully before withdrawal is not invalidated (CN-06) — the history shows effective dates, and reports never retroactively relabel past processing as unlawful.

### 4.4 Children and persons with disability (CH-01…CH-10)

**The hard block (CH-05, s.9(3)).** In `CampaignService`, before any recipient list is built:

```
if (category === MARKETING) {
  exclude every principal whose ageStatus === CHILD
  → CampaignRecipient(status: SUPPRESSED, suppressReason: 'CHILD_MARKETING_PROHIBITED')
}
```

This applies **even if a guardian granted consent**, because s.9(3) prohibits it regardless of consent. The same exclusion applies to any future behavioural-scoring or profiling feature. Write the unit test before the feature.

**Verifiable consent (CH-01…CH-03).** Where `ageStatus = CHILD`, a consent record may only be created with `givenByGuardianId` set, pointing at an active `GuardianRelationship` whose `verification` is not `NONE`. The service rejects the write otherwise. The verification methods offered mirror Rule 10: reliable identity and age details already held, details voluntarily provided, a virtual token from an authorised entity, or a Digital Locker reference. The platform **records which method was used and its reference**; the integration itself is out of scope and the UI says so.

**Persons with disability (CH-08, CH-09).** `LAWFUL_GUARDIAN_OF_PWD` relationships require `appointingAuthority` ∈ {COURT, DESIGNATED_AUTHORITY, LOCAL_LEVEL_COMMITTEE} and an `appointmentReference`, per Rule 11.

**Exemptions (CH-06, CH-07).** A `ChildExemptionClaim` must cite the Schedule part and row number and paste the condition text. Free-text "we think this is exempt" is not accepted. The claim appears on the purpose and in the evidence pack.

**Detrimental-effect assessment (CH-04).** Any purpose that will process children's data requires a written assessment before it can be marked reviewed. The platform stores it; it does not evaluate it.

**Age-status gaps.** The dashboard shows the count of `UNKNOWN` age status prominently, because a company that cannot distinguish adults from children cannot satisfy s.9 at all. Never infer age from behaviour, product category or name.

### 4.5 Rights (RT-01…RT-16)

**State machine — the only legal transitions. Anything else returns `409`.**

```
SUBMITTED             → VERIFICATION_REQUIRED, OPEN, CANCELLED
VERIFICATION_REQUIRED → OPEN, REJECTED, CANCELLED
OPEN                  → ASSIGNED, IN_PROGRESS, ESCALATED, REJECTED, CANCELLED
ASSIGNED              → IN_PROGRESS, ESCALATED, OPEN, CANCELLED
IN_PROGRESS           → WAITING_FOR_PRINCIPAL, ESCALATED, COMPLETED, REJECTED, CANCELLED
WAITING_FOR_PRINCIPAL → IN_PROGRESS, ESCALATED, CANCELLED
ESCALATED             → IN_PROGRESS, COMPLETED, REJECTED
COMPLETED / REJECTED / CANCELLED → terminal
```

Implement as `const TRANSITIONS: Record<RequestStatus, RequestStatus[]>`, validated in the service. `isOverdue` is a **flag, not a status** — an overdue request stays workable.

- Only the Data Principal (or her verified guardian/nominee) may cancel, and only before `COMPLETED`.
- `REJECTED` requires a `rejectionReason` of at least 20 characters **and**, for erasure, the statutory ground relied on — retention necessary for the specified purpose or for compliance with law (RT-09, s.12(3)).
- `COMPLETED` requires `outcomeCode` and a non-empty `outcome`.
- Every transition writes a `RequestEvent` **and** an `AuditEvent`. `visibleToPrincipal` defaults false; status changes and messages explicitly marked visible appear on her timeline.
- Every response to a rights communication includes the **DPO or responsible person's business contact information** (RT-16, Rule 9). It is injected by the template layer, not typed by the employee, so it cannot be forgotten.
- **Frivolous flag, never auto-reject** (RT-15). An employee may flag with a reason; the request still runs its course. The Data Principal's duties are the Board's business, not the platform's.

**Access requests (RT-03, RT-04, RT-05)** generate a report containing:
1. a summary of the personal data processed, assembled from the canonical profile with lineage;
2. a summary of the **processing activities** — purposes, lawful bases, source systems;
3. the **identities of every Data Fiduciary and Data Processor** her data was shared with, from the MVP 1 sharing register filtered to her contributing sources, **with the description of what was shared**;
4. consent status and history per purpose;
5. retention position and any erasure task.

Exportable as PDF and CSV. This report is the single strongest reason MVP 1 built the registers.

**Correction requests never write to a source system.** The employee screen shows the requested change and states: *"Update this in the source system, then mark complete. The next sync will reflect it."* On completion it offers a one-click "Run sync now" for the sources holding that field.

**Erasure requests** show which source systems and which registered processors hold her data, and require a tick per system and per processor (s.8(7)(b), RE-02) before completion. It is a checklist, not automated deletion.

**Grievances (RT-10…RT-12).** Deadline comes from `GRIEVANCE_RESPONSE`. The org's **published period** is displayed in the portal and stored on the rule, and the settings screen refuses a value over ninety days with the citation shown. Closure notices state the outcome and mention that she may approach the Board if unsatisfied — the platform neither hides that route nor encourages skipping the internal one (s.13(3)).

**Nomination (RT-13)** is a form capturing nominee details, relationship, scope and activation condition. MVP 2 stores and displays it; acting on it is a manual employee workflow, and the UI says so.

**Publication (RT-01, RT-02).** `/app/settings/rights` generates the public-facing text — the means to make a request and the identifiers required — and shows the URL where it must be published. The platform cannot publish to the company's website; it produces the content and records where the company says it was published.

### 4.6 Retention and erasure (RE-01…RE-09)

`retention-scan` walks active retention policies nightly:

1. **Trigger evaluation.** `CONSENT_WITHDRAWN` from consent events; `INACTIVITY` from `lastPrincipalContactAt` — counting **inbound events only** (GO-09); `PURPOSE_SERVED` from a policy-defined signal; `FIXED_PERIOD` from record age.
2. **Floor computation.** `retentionFloorUntil = lastProcessingAt + LOG_RETENTION_MINIMUM`. The database constraint in 2.3 refuses any task where erasure would fall before the floor. A task in that position becomes `DEFERRED_RETENTION_FLOOR` with the release date shown — **RE-07, the single most dangerous bug in this module.**
3. **Legal holds** override everything: state becomes `ON_LEGAL_HOLD`, with the citation displayed.
4. **Pre-erasure notice (RE-05).** `preErasureNoticeDueAt = erasureDueAt − PRE_ERASURE_NOTICE`. The notice tells her the data will be erased unless she logs in, contacts the company for the specified purpose, or exercises her rights — the exact conditions in Rule 8(2). Any of those three arriving cancels the task and writes the reason.
5. **Third Schedule carve-out (RE-04).** Where `accountAccessCarveOut` is set, data needed to access her user account or a virtual token usable for money, goods or services is excluded from the task and shown as excluded.
6. **Execution** is a human checklist per system and per processor, mirroring erasure requests. The platform records completion; it does not delete from the customer's systems, because it has read-only access.

### 4.7 Audience builder — exact DSL

```json
{
  "op": "AND",
  "rules": [
    { "field": "consent",        "purposeId": "<id>", "operator": "eq", "value": "UNKNOWN" },
    { "field": "hasEmail",       "operator": "eq", "value": true },
    { "field": "dataSource",     "operator": "in", "value": ["<dataSourceId>"] },
    { "field": "breachAffected", "operator": "eq", "value": "<breachId>" },
    { "field": "requestStatus",  "operator": "in", "value": ["OPEN","IN_PROGRESS"] },
    { "field": "ageStatus",      "operator": "eq", "value": "ADULT" },
    { "field": "country",        "operator": "eq", "value": "IN" },
    { "field": "city",           "operator": "in", "value": ["Mumbai","Pune"] },
    { "field": "lastContactAt",  "operator": "before", "value": "2023-01-01T00:00:00Z" },
    { "field": "hasField",       "operator": "eq", "value": "DATE_OF_BIRTH" },
    { "field": "erasureState",   "operator": "in", "value": ["NOTICE_SENT"] }
  ]
}
```

- Allowed fields: exactly the eleven above. An unknown field is a `400`, **never silently ignored** — silently dropping a filter is how someone emails twelve thousand people they meant to exclude.
- Operators: `eq`, `neq`, `in`, `notIn`, `before`, `after`. Maximum nesting depth 2.
- The compiler is a **pure function** producing one Prisma `where` on `DataPrincipal`, unit-tested independently of campaigns.
- `POST /api/audiences/preview` returns `{ total, withEmail, portalOnly, suppressedByConsent, suppressedAsChild, sample: [10 masked names] }`.
- **Preview and send call the identical compiler.** Two similar queries is the defect that makes previews lie.

### 4.8 Campaigns and delivery

Flow: **Draft → Preview → (approval) → Send → per-recipient records.**

Server-side guards, in `CampaignService.send()`, each with its own unit test:

1. `MARKETING` **requires** `purposeId`; recipients are intersected with `GRANTED` consent for that purpose; everyone else becomes `SUPPRESSED` with `NO_CONSENT` — recorded, not dropped, so the company can prove who it did **not** contact.
2. `MARKETING` **excludes every `CHILD`**, regardless of consent, with `CHILD_MARKETING_PROHIBITED` (CH-05).
3. `BREACH_NOTICE` requires `CAN_SEND_BREACH_NOTICES` and a `breachId`; recipients come **only** from `BreachAffectedPrincipal`, never from a free-form filter.
4. `CONSENT_REQUEST` requires `purposeId` **and** a published `noticeVersionId`, and is **not** consent-filtered — that is the point of asking.
5. Compliance categories (`COMPLIANCE_NOTICE`, `BREACH_NOTICE`, `REQUEST_UPDATE`, `PRE_ERASURE_NOTICE`, `NOTICE`) ignore marketing consent entirely. A legal notice is not marketing.
6. Any principal named in an active `InformationRequest` with `nonDisclosureDirected = true` is suppressed with `NON_DISCLOSURE_ORDER` from any message that would reveal it (BD-04).
7. Campaigns over 500 recipients, and every `BREACH_NOTICE`, require approval by a **different** employee. The creator cannot approve their own.
8. Sending is idempotent: job id `campaign:{campaignId}:{principalId}:{channel}` plus the unique constraint. Re-triggering never double-delivers.

`NotificationProvider` has three implementations: `PortalProvider` (always runs — the portal record is the system of record), `SmtpProvider` (nodemailer → MailHog), `ConsoleProvider` (tests). **Portal-first**: someone with no email address still receives everything. The rendered subject and body are stored per recipient before delivery and frozen on delivery — that is the evidence artefact for BR-13.

### 4.9 Templates

Seed these system templates, all markdown, all editable:

```
NOTICE_STANDARD           CONSENT_REQUEST          LEGACY_CONSENT_NOTICE
BREACH_NOTIFICATION       BOARD_INITIAL_INTIMATION BOARD_DETAILED_REPORT
REQUEST_RECEIVED          REQUEST_COMPLETED        REQUEST_REJECTED
CORRECTION_UPDATE         ERASURE_UPDATE           PRE_ERASURE_NOTICE
GRIEVANCE_ACKNOWLEDGED    PRIVACY_NOTICE_UPDATE    ACCESS_REPORT_COVER
```

Whitelisted variables — rendering **throws** on anything else, and a missing required value fails the render rather than printing an empty string:

```
{{principal_name}} {{company_name}} {{reference}} {{request_type}} {{due_date}}
{{published_grievance_period}} {{breach_reference}} {{breach_nature_extent_timing}}
{{breach_consequences}} {{breach_mitigation}} {{breach_safety_measures}}
{{breach_responder_contact}} {{data_categories}} {{purpose_name}} {{notice_version}}
{{withdrawal_url}} {{rights_url}} {{board_complaint_url}}
{{dpo_name}} {{dpo_contact}} {{contact_email}} {{portal_link}} {{erasure_date}}
```

`BREACH_NOTIFICATION` must contain, by default, the five Rule 7(1) elements plus the responder contact — nature/extent/timing, consequences relevant to her, mitigation implemented and being implemented, safety measures she may take, and business contact information. The editor **warns loudly** if any of the six placeholders is removed and records the acknowledgement.

`PRE_ERASURE_NOTICE` must contain the three ways she can stop erasure: log into her user account, contact the company for the specified purpose, or exercise her rights.

### 4.10 Breach (BR-01…BR-15)

`/app/breaches/new` is a wizard:

① what happened · **when it occurred** and **when the company became aware** (two separate fields, both required) ② affected systems ③ data categories, with an automatic flag if any affected principal is a `CHILD` ④ affected principals — "everyone sourced from these systems" via the audience compiler, or manual/CSV — with a preview count before committing ⑤ the five Rule 7(1) narrative fields ⑥ Board detail fields ⑦ review the generated notice ⑧ create.

On creation, `BreachObligation` rows are generated from the rules, **all clocks starting at `becameAwareAt`** (BR-14), each carrying its rule snapshot, citation and basis. The detail page shows a live countdown per obligation with its citation, its basis chip (STATUTORY vs INTERNAL_TARGET), and a "Mark done" action recording timestamp, employee and an evidence reference.

**Extensions (BR-15).** Recording `boardExtensionRequestedAt` and a granted date shifts the `BOARD_DETAIL` obligation's `dueAt` — and only that. The original due date stays visible with a strikethrough and the extension reference, because the audit trail must show both.

**The Board documents.** The platform generates a downloadable initial intimation and a detailed report containing the Rule 7(2)(b) items — updated description, broad facts, mitigation, findings on the person who caused it, remedial measures, **and the report on intimations given to affected Data Principals**, built from `CampaignRecipient` delivery records (BR-13). It **does not file anything**. The screen says so plainly and records who submitted it and when.

`BreachStatus` moves DETECTED → INVESTIGATING → CONTAINED → PRINCIPALS_NOTIFIED → BOARD_NOTIFIED → CLOSED. Closing requires every obligation `DONE` or `WAIVED` with a written reason.

### 4.11 SDF pack (SD-01…SD-07)

Visible always, active when `isSignificantDataFiduciary` is set on the org. A non-SDF sees it as a readiness view, because status can be conferred by notification at any time.

- **DPIA and audit cycle**: `SDF_ASSESSMENT_CYCLE` (12 months) from `sdfNotifiedAt`. Two `SdfAssessment` rows per cycle, one `DPIA`, one `AUDIT`. `sdf-cycle-scan` opens the next cycle and warns as due dates approach.
- **Independence (SD-02)**: the audit row requires `isIndependent = true` and an auditor name, or it cannot be marked complete.
- **Board report (SD-04)**: `significantObservations` and `furnishedToBoardAt` are required to close a cycle.
- **Algorithm register (SD-05)**: one entry per algorithmic system touching personal data, with the Rule 13(3) operation list, a risk review, and a review date. Entries unreviewed for a full cycle appear as a gap.
- **Localisation (SD-06, CB-03)**: cross-border transfer rows can be marked `localisationRequired`; any such transfer shows a red banner and appears in the SDF gaps list. The platform flags; it cannot block a transfer happening in someone else's system.
- **DPO in India (SD-01)**: the settings screen requires `dpoIsIndiaBased` to be affirmed for an SDF and warns otherwise.

### 4.12 Board and Government interaction (BD-01…BD-06)

`InformationRequest` records who asked, under which Seventh Schedule purpose, through which authorised person, what period was specified, and what was furnished. Where `nonDisclosureDirected` is true:

- every named principal is suppressed from campaigns with `NON_DISCLOSURE_ORDER`;
- the request never appears in her portal, her access report, or her evidence file;
- the suppression itself **is** recorded in the audit log, with the authorisation reference, because internal accountability and external non-disclosure are different things.

This is a small feature with a large failure mode. Test it explicitly.

### 4.13 New API endpoints

```
GET|POST|PATCH /api/compliance-rules[/:id]        CAN_CHANGE_COMPLIANCE_CONFIG (read: CAN_VIEW_AUDIT_LOG)
POST   /api/compliance-rules/:id/review           CAN_CHANGE_COMPLIANCE_CONFIG

GET|POST /api/notices[/:id]                       CAN_MANAGE_NOTICES
POST   /api/notices/:id/versions                  CAN_MANAGE_NOTICES
POST   /api/notices/:id/versions/:v/publish       CAN_MANAGE_NOTICES
PUT    /api/notices/:id/versions/:v/translations/:lang   CAN_MANAGE_NOTICES

GET    /api/principals/:id/consents               CAN_MANAGE_CONSENTS
POST   /api/principals/:id/consents/:purposeId    CAN_MANAGE_CONSENTS   (imported consent)
GET    /api/purposes/:id/consent-stats            CAN_MANAGE_CONSENTS

GET|POST /api/guardians                           CAN_MANAGE_CHILD_DATA
POST   /api/guardians/:id/verify                  CAN_MANAGE_CHILD_DATA
POST   /api/principals/:id/age-status             CAN_MANAGE_CHILD_DATA
GET|POST /api/child-exemptions                    CAN_MANAGE_CHILD_DATA

GET    /api/requests?status=&type=&assignee=&overdue=   CAN_MANAGE_REQUESTS
GET    /api/requests/:ref                         CAN_MANAGE_REQUESTS
POST   /api/requests/:ref/assign | status | escalate | note | verify-identity
POST   /api/requests/:ref/flag-frivolous          CAN_MANAGE_REQUESTS
GET    /api/requests/:ref/access-report.pdf       CAN_MANAGE_REQUESTS   (RT-03/04)
GET    /api/requests/stats                        CAN_MANAGE_REQUESTS

GET    /api/retention/tasks?state=                CAN_MANAGE_RETENTION
POST   /api/retention/tasks/:id/complete          CAN_APPROVE_ERASURE
POST   /api/retention/tasks/:id/cancel            CAN_MANAGE_RETENTION
GET|POST /api/retention/legal-holds               CAN_MANAGE_RETENTION

POST   /api/audiences/preview                     CAN_SEND_MESSAGES
GET|POST|PATCH /api/templates[/:id]               CAN_SEND_MESSAGES
POST   /api/templates/:id/preview                 CAN_SEND_MESSAGES
GET|POST /api/campaigns[/:id]                     CAN_SEND_MESSAGES
POST   /api/campaigns/:id/approve                 CAN_SEND_BREACH_NOTICES
POST   /api/campaigns/:id/send                    CAN_SEND_MESSAGES
GET    /api/campaigns/:id/recipients              CAN_SEND_MESSAGES

GET|POST|PATCH /api/breaches[/:id]                CAN_MANAGE_BREACHES
POST   /api/breaches/:id/affected                 CAN_MANAGE_BREACHES
POST   /api/breaches/:id/notify                   CAN_SEND_BREACH_NOTICES
POST   /api/breaches/:id/obligations/:code/complete   CAN_MANAGE_BREACHES
POST   /api/breaches/:id/extension                CAN_MANAGE_BREACHES
GET    /api/breaches/:id/board-initial.pdf        CAN_MANAGE_BREACHES
GET    /api/breaches/:id/board-detailed.pdf       CAN_MANAGE_BREACHES

GET|POST /api/sdf/assessments                     CAN_MANAGE_SDF
POST   /api/sdf/assessments/:id/complete          CAN_MANAGE_SDF
GET|POST|PATCH /api/sdf/algorithms                CAN_MANAGE_SDF
GET    /api/sdf/gaps                              CAN_MANAGE_SDF

GET|POST|PATCH /api/information-requests           CAN_CHANGE_COMPLIANCE_CONFIG
GET    /api/notifications | POST /:id/read | POST /read-all    any actor
GET    /api/audit-events/verify-chain             CAN_VIEW_AUDIT_LOG
GET    /api/audit-events/export.csv               CAN_EXPORT_EVIDENCE
GET    /api/principals/:id/evidence[.pdf]         CAN_VIEW_ALL_PERSONAL_DATA
GET    /api/evidence/pack.zip                     CAN_EXPORT_EVIDENCE

-- Data Principal portal (principal token; never an id parameter)
GET    /api/me/notices | /api/me/notices/:id?lang=
GET    /api/me/consents | POST /api/me/consents/:purposeId
GET|POST /api/me/requests | GET /api/me/requests/:ref
POST   /api/me/requests/:ref/cancel | comment
GET    /api/me/messages | GET /api/me/nomination | PUT /api/me/nomination
GET    /api/me/recipients | GET /api/me/access-report.pdf
```

Notification freshness: poll `GET /api/notifications` every 20 s via TanStack Query `refetchInterval` plus `refetchOnWindowFocus`. **No WebSocket** — polling is sufficient at these volumes and removes a class of reconnection bugs.

### 4.14 Frontend

**Data Principal portal** — plain language, class-8 reading level, a "Need help?" link to the grievance form on every screen:

| Route | Contents |
|---|---|
| `/me` | greeting, unread count, tiles: Your Data · Consents · Requests · Messages · Who has your data · Privacy Info · Nomination · Grievance |
| `/me/consents` | one card per **consent-basis** purpose: plain description, status pill, dates, Allow / Decline / Withdraw at equal prominence, "What you were shown" opening the exact notice version, full history. Legitimate-use purposes appear in a separate, clearly labelled information section with no toggle |
| `/me/requests` | list + wizard (type → type-specific form → confirm → reference). Correction shows current values; erasure shows scope; grievance is free text |
| `/me/requests/:ref` | timeline, "The company aims to respond by …", visible employee messages, Cancel, Add comment |
| `/me/messages` | inbox; breach notices pinned with a red badge; pre-erasure notices pinned amber with the three ways to stop it |
| `/me/recipients` | who holds her data and what was shared |
| `/me/privacy` | company identity, DPO/grievance contacts, purposes and bases, notice versions with a **language selector**, withdrawal link, "Raise a grievance", and how to complain to the Board |
| `/me/nomination` | nominee form with scope and activation condition |

**Fiduciary portal** adds: `/app/requests` (counter strip: Open · Due Soon · Overdue · Awaiting Principal · Escalated · Unassigned) and `/app/requests/:ref` (three columns — request detail; the principal's canonical profile with lineage; timeline, assignment, status, internal notes — plus a panel naming the rule, its citation, its basis and its review state); `/app/notices`; `/app/consents`; `/app/children` (guardians, verification, exemption claims, age-status gaps); `/app/retention` (tasks by state, deferred-by-floor prominently, legal holds); `/app/messaging/{templates,campaigns}`; `/app/breaches`; `/app/sdf`; `/app/information-requests`; `/app/settings/compliance`; `/app/settings/rights`; `/app/principals/:id/evidence`.

Deadline pills colour by fraction of window remaining — `>50%` neutral, `50–20%` amber, `<20%` orange, past due red — and **always carry the text too** ("in 43 days", "3 days overdue"). Colour is never the only signal.

---

## 5. TASKS (build in this order — do not reorder)

1. Prisma models from 2.2 → migrate → raw SQL from 2.3. Prove each new trigger and the erasure-floor constraint fire.
2. Seed compliance rules (2.4), the fifteen templates, and the language list. Extend `Counter`.
3. `ComplianceService` with versioning. **Unit-test versioning before anything consumes it.**
4. Request engine: model, transitions constant, events, audit. Backend first, tested with curl, before any UI.
5. `deadline-scan` + notifications + escalation.
6. Notice builder: itemised list from mappings, three mandatory links, publish + hash + freeze, translations.
7. Consent: backfill job, records, events, UNKNOWN rule, one-click withdrawal wired to an `ErasureTask`.
8. Children: age status, guardians, verification methods, exemption claims, and **the marketing block with its unit test written first**.
9. Data Principal portal: `/me/requests` then `/me/consents` then `/me/privacy`. Prove the cross-portal loop before building anything else.
10. Employee request dashboard and detail page; the access report (PDF + CSV) built from the MVP 1 registers.
11. Audience compiler as a standalone pure module with unit tests; then `/api/audiences/preview`.
12. Templates: storage, whitelisted Handlebars, preview, editor with the breach-placeholder warning.
13. Campaigns: create, preview, approval, send job, per-recipient records, all eight guards. `PortalProvider` first, then `SmtpProvider` — confirm mail in MailHog at `localhost:8025`.
14. `/me/messages` + notification polling on both portals.
15. Retention: policies → `retention-scan` → floor computation → legal holds → pre-erasure notices → completion checklists.
16. Breach: wizard, obligations from rules, clocks from `becameAwareAt`, notice generation, targeted send, Board PDFs, extensions.
17. SDF pack: assessments, cycle scan, algorithm register, gaps view.
18. Information requests with the non-disclosure suppression, and its test.
19. Audit UI: filters, chain verification, CSV export, per-principal evidence page, `/api/evidence/pack.zip`.
20. `audit-chain-verify` and `access-log-retention` jobs.
21. Run section 6, then the acceptance demo in section 7.

---

## 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)

#### Check 1: No legal number exists in code

- **How**:
```bash
grep -rnE "\b(90|72|48|30|24|12|7|3)\b" dpdp-platform/backend/src --include=*.ts \
  | grep -viE "test|spec|http|status|port|index|slice|length" | grep -iE "day|hour|month|year|deadline|due|expire|retain"
```
- **Pass**: nothing outside `prisma/seed.ts`. **Fail**: any match in a service — move it to `ComplianceRule`.

#### Check 2: Changing a rule does not rewrite history

- **Why it matters**: if old deadlines move when a setting changes, every compliance report the company ever produced becomes unreliable, and an auditor will find it.
- **How**: note an open request's `dueAt`. Change `REQUEST_ERASURE` from 30 to 15 days. Re-open the old request; create a new one.
- **Pass**: the old `dueAt` and snapshot version are unchanged; the new request uses version 2. **Fail**: if the old date moved, something recomputes from the live rule — `deadline-scan` is the usual culprit.

#### Check 3: Basis labels are honest

- **How**: open `/app/settings/compliance`.
- **Pass**: `GRIEVANCE_RESPONSE` and `BREACH_BOARD_DETAIL` show STATUTORY with their citations; the access/correction/erasure rows show ORG_POLICY; the "without delay" rows show INTERNAL_TARGET with an explanation that the number is the company's own target. **Fail**: any ORG_POLICY row labelled STATUTORY — that is telling a customer their own SLA is the law.

#### Check 4: The state machine refuses illegal moves

- **How**: with a request in `SUBMITTED`, POST status `COMPLETED`. Then complete an `IN_PROGRESS` request with no `outcomeCode`; then reject one with a 5-character reason; then reject an erasure with no statutory ground.
- **Pass**: `409`, `400`, `400`, `400`, and **no `RequestEvent` row** for any of them. **Fail**: a status that changed anyway means validation lives in the controller while something else writes to Prisma directly.

#### Check 5: Warnings and overdue fire exactly once

- **How**: create a temporary rule for `REQUEST:OTHER` at 1 HOUR / warn 0 (a legitimate config, no code change). Submit a request. Let four `deadline-scan` cycles pass the hour.
- **Pass**: one warning notification, `isOverdue = true` after the hour, DPO notified, status still `OPEN`/`IN_PROGRESS` (no phantom "OVERDUE" status), and **exactly one** warning after four more scans. **Fail**: repeated notifications mean the idempotency flag isn't written.

#### Check 6: The grievance ceiling is enforced (RT-11)

- **How**: try to set `GRIEVANCE_RESPONSE` to 120 days in settings.
- **Pass**: rejected with the Rule 14(3) citation shown, and the published period appears in `/me/privacy` exactly as configured. **Fail**: an accepted 120-day period is a direct contravention the platform helped create.

#### Check 7: Notice structure is enforced, not suggested (NT-02…NT-07)

- **How**: build a notice with no itemised fields; then with fields but no `goodsOrServicesDescription` on one purpose; then with only two of the three links. Publish each. Then publish a valid one and try to edit its body.
- **Pass**: three publication failures, each naming exactly what is missing; the fourth publishes, gets a `contentHash`, and the edit raises `Published notice versions are immutable`. **Fail**: any notice publishable without the three Rule 3(c) links.

#### Check 8: Missing consent is UNKNOWN, never DENIED (CN-10)

- **How**: `SELECT status, COUNT(*) FROM "ConsentRecord" GROUP BY 1;` right after backfill, before anyone interacts.
- **Pass**: everything `UNKNOWN`; zero `DENIED`. **Fail**: any `DENIED` row means a default is wrong — search for `DENIED` in seeds and services.

#### Check 9: Withdrawal is as easy as granting (CN-05)

- **Why it matters**: Rule 3(c)(i) makes comparable ease an express requirement, not a UX opinion.
- **How**: count the clicks from `/me` to grant a consent; count the clicks from `/me` to withdraw the same one.
- **Pass**: identical counts, same screen, same prominence; withdrawal takes effect immediately with no approval step. **Fail**: withdrawal buried a level deeper, or routed through a request the company must approve.

#### Check 10: Consent evidence is complete and frozen (CN-09)

- **How**: as Aman, grant then withdraw marketing consent.
```sql
SELECT "fromStatus","toStatus",channel,"noticeVersionId","noticeContentHash",evidence
FROM "ConsentEvent" ORDER BY "createdAt" DESC LIMIT 3;
UPDATE "ConsentEvent" SET "toStatus"='DENIED' WHERE id=(SELECT id FROM "ConsentEvent" LIMIT 1);
```
- **Pass**: two events with channel `PORTAL`, a notice version **and its content hash**, IP and user agent; the UPDATE raises the immutability exception. **Fail**: empty evidence means you record the decision without the proof, which is the part that matters.

#### Check 11: Legitimate-use purposes never show a consent toggle (LB-06)

- **How**: create a purpose with basis `LEGITIMATE_USE`, limb `EMPLOYMENT`. View `/me/consents` as a principal it applies to.
- **Pass**: it appears in the information section explaining the basis, with no Allow/Decline control, and it never appears in a consent audience filter. **Fail**: a toggle that does nothing is worse than no toggle — it implies a choice that does not exist.

#### Check 12: A child cannot be marketed to (CH-05) — the flagship prohibition

- **Why it matters**: s.9(3) bans tracking, behavioural monitoring and targeted advertising directed at children **regardless of consent**. Penalty tier: ₹200 crore.
- **How**: pick one of the six under-18 demo principals. Have a guardian grant marketing consent for them (via the API, as an employee with `CAN_MANAGE_CHILD_DATA`). Then send a `MARKETING` campaign whose filter would include them.
```sql
SELECT status,"suppressReason" FROM "CampaignRecipient" WHERE "campaignId"='<id>' AND "dataPrincipalId"='<child-id>';
```
- **Pass**: `SUPPRESSED` / `CHILD_MARKETING_PROHIBITED`, even though consent is `GRANTED`. **Fail**: `DELIVERED` — the guard is in the UI, not the service. Move it and write the test.

#### Check 13: A child's consent requires a verified guardian (CH-01…CH-03)

- **How**: try to create a `GRANTED` consent for a `CHILD` principal without `givenByGuardianId`; then with a guardian whose `verification = NONE`.
- **Pass**: both rejected with the Rule 10 requirement quoted. **Fail**: either accepted means s.9(1) is unenforced.

#### Check 14: Preview count equals send count, exactly

- **How**: filter on marketing consent UNKNOWN AND has email. Note the preview. Send.
```sql
SELECT status, COUNT(*) FROM "CampaignRecipient" WHERE "campaignId"='<id>' GROUP BY 1;
```
Cross-check against hand-written SQL for the same condition.
- **Pass**: preview total = `DELIVERED + PENDING + SUPPRESSED`, matching your manual count. **Fail**: preview and send use different code paths — they must call the same compiler function.

#### Check 15: Compliance messages are not consent-filtered

- **How**: send a `BREACH_NOTICE` to affected principals, several of whom have marketing consent `DENIED` or `WITHDRAWN`.
- **Pass**: all affected principals receive it; none is suppressed for consent. **Fail**: consent-filtering a legal notice would leave affected people uninformed — a Rule 7(1) contravention the platform caused.

#### Check 16: Sending is idempotent

- **How**: send a campaign; click Send again mid-flight; re-trigger the queue job manually.
- **Pass**: `409` on the second click, recipient count unchanged, exactly one message per recipient in MailHog. **Fail**: duplicates mean the unique constraint or the deterministic job id is missing.

#### Check 17: Templates cannot be weaponised

- **How**: put `<script>alert(1)</script>` and `{{secret_field}}` in a template body; preview; send to yourself.
- **Pass**: the render **throws** on the unknown variable and the campaign refuses to send; the script tag arrives escaped as visible text in both portal and email. **Fail**: executable script in the portal inbox is a stored XSS inside a privacy product — stop and fix it before anything else.

#### Check 18: The breach clock starts at awareness (BR-14)

- **How**: create a breach with `occurredAt` five days ago and `becameAwareAt` six hours ago.
```sql
SELECT code,"dueAt","legalSourceSnapshot","basisSnapshot" FROM "BreachObligation" WHERE "breachId"='<id>';
```
- **Pass**: `BOARD_DETAIL.dueAt = becameAwareAt + 72h` (≈66 hours remaining on screen), citation and STATUTORY basis displayed; nothing computed from `occurredAt` or `createdAt`. **Fail**: a clock from record creation gives the company a deadline the law does not.

#### Check 19: The breach notice carries all six Rule 7(1) elements

- **How**: delete `{{breach_safety_measures}}` from the template, then generate a notice.
- **Pass**: the editor warns naming the missing element and requires an explicit acknowledgement; the default template contains all six. **Fail**: silent omission means the company sends a notice that does not meet Rule 7(1).

#### Check 20: Only affected people see a breach notice

- **How**: breach affecting only the Marketing Database. Select affected, send. Log in as an affected person (Aman) and an unaffected one (Sara, e-commerce only).
- **Pass**: Aman's inbox shows the pinned red notice with all six elements; Sara's shows nothing new; `COUNT(*) FROM "BreachAffectedPrincipal"` equals the campaign's recipient count exactly. **Fail**: any notice to an unaffected person means the recipient list was rebuilt from a looser filter at send time instead of read from `BreachAffectedPrincipal`.

#### Check 21: Board delivery evidence exists (BR-13)

- **How**: download `/api/breaches/:id/board-detailed.pdf`.
- **Pass**: it contains the six Rule 7(2)(b) items including a **report on intimations given to affected Data Principals**, with per-person delivery status counts drawn from `CampaignRecipient`; the screen states the platform does not file it. **Fail**: a report claiming notifications were sent without delivery records behind it.

#### Check 22: Erasure never crosses the retention floor (RE-07) — the most dangerous bug

- **Why it matters**: Rule 6(1)(e) and Rule 8(3) require a minimum one year of retention. An erasure job that deletes inside that window converts a compliance feature into a contravention.
- **How**: withdraw consent for a principal whose data was processed two weeks ago.
```sql
SELECT state,"erasureDueAt","retentionFloorUntil" FROM "ErasureTask" ORDER BY "evaluatedAt" DESC LIMIT 1;
UPDATE "ErasureTask" SET "erasureDueAt" = "retentionFloorUntil" - interval '1 day' WHERE id='<id>';
```
- **Pass**: the task is `DEFERRED_RETENTION_FLOOR` with the release date shown in the UI and an explanation citing Rule 8(3); the manual UPDATE is rejected by the `erasure_respects_floor` constraint. **Fail**: a task marked `READY_FOR_ERASURE` inside the window.

#### Check 23: The 48-hour pre-erasure notice fires and can be stopped (RE-05)

- **How**: create a retention policy with a short inactivity period on a test principal; let `retention-scan` and `pre-erasure-notice` run; then log in as that principal.
- **Pass**: the notice arrives at least 48 hours (per the rule, not a constant) before `erasureDueAt`, names the three ways to stop it, and logging in cancels the task with the reason recorded and `lastPrincipalContactAt` updated. **Fail**: a notice that does not explain how to stop erasure, or a login that does not stop it.

#### Check 24: Inactivity counts inbound contact only (GO-09)

- **How**: send a marketing campaign to a dormant principal, then re-run `retention-scan`.
- **Pass**: `lastPrincipalContactAt` is unchanged and the inactivity clock keeps running — a company emailing someone is not that person approaching the company. **Fail**: outbound campaigns resetting the clock would let a company defeat s.8(8) by sending mail.

#### Check 25: The Third Schedule rule applies only to Third Schedule classes (RE-03)

- **How**: with `thirdScheduleClass = NONE`, check whether `RETENTION_INACTIVITY` resolves. Then set the org to `ECOMMERCE` with 3 crore users and re-check.
- **Pass**: null then resolved. **Fail**: applying a three-year erasure rule to a company it does not cover means deleting data with no legal basis to delete it.

#### Check 26: The access report answers s.11 in full (RT-03, RT-04)

- **How**: submit an ACCESS request as Aman; generate the report.
- **Pass**: it contains a summary of his personal data, the processing activities and purposes with lawful bases, **the named recipients his data was shared with and a description of what was shared**, his consent history, and his retention position — and the recipients match his contributing sources only. **Fail**: a report with data but no recipients does not satisfy s.11(1)(b), which is the clause most companies will fail on.

#### Check 27: Every rights response carries the DPO contact (RT-16, Rule 9)

- **How**: complete a request and read what the principal received.
- **Pass**: the business contact information of the DPO or responsible person is present, injected by the template layer. **Fail**: if an employee can send a response without it, move it out of the editable body.

#### Check 28: Non-disclosure orders actually suppress (BD-04)

- **How**: create an `InformationRequest` with `nonDisclosureDirected = true` naming Aman. Send a compliance campaign whose filter includes him. Generate his evidence file and access report.
- **Pass**: he is `SUPPRESSED` with `NON_DISCLOSURE_ORDER`; the request appears nowhere in his portal, report or evidence file; and the suppression **is** in the internal audit log with the authorisation reference. **Fail**: either leaking it to him, or hiding it from the internal audit trail — those are different requirements and both must hold.

#### Check 29: The SDF cycle is enforced (SD-02, SD-03, SD-04)

- **How**: mark the org an SDF with `sdfNotifiedAt` 11 months ago. Try to complete an AUDIT with `isIndependent = false`; then complete a cycle without `furnishedToBoardAt`.
- **Pass**: both rejected with the Rule 13 citations; the SDF page shows the 12-month cycle counting down and a warning inside 30 days. **Fail**: a cycle closable without independence or a Board report is a ₹150 crore-tier gap the platform said was fine.

#### Check 30: The audit chain verifies and detects tampering

- **How**: `GET /api/audit-events/verify-chain`. Then simulate corruption:
```sql
ALTER TABLE "AuditEvent" DISABLE TRIGGER audit_no_update;
UPDATE "AuditEvent" SET metadata='{"x":1}' WHERE sequence=5;
ALTER TABLE "AuditEvent" ENABLE TRIGGER audit_no_update;
```
then verify again.
- **Pass**: `{valid:true, checked:N}`, then a report naming sequence 5 as the first break. **Fail**: still valid means the hash doesn't cover `metadata` — include canonicalised JSON in the hash input.

#### Check 31: The evidence pack is complete (EV-01…EV-12)

- **How**: download `/api/evidence/pack.zip`.
- **Pass**: it contains the RoPA, consent ledger, rights register, grievance response-time report, access log, processor and sharing registers, retention schedule with execution records, breach files, SDF records, and the audit export — each a readable CSV or PDF with the organisation name and generation timestamp. **Fail**: a missing artefact is a question the company cannot answer under inquiry.

#### Check 32: Cross-portal round trip is immediate

- **How**: two browser profiles. As Aman, submit a correction request; watch the employee dashboard without refreshing.
- **Pass**: within 20 s the request appears with its reference and countdown; an employee status change reaches Aman's timeline within 20 s; internal notes stay invisible while notes marked visible appear. **Fail**: needing a hard refresh means `refetchInterval` is unset or the query key isn't invalidated after mutation.

#### Check 33: Corrections still never touch the source system

- **How**: with the demo server access log open, complete a correction end to end.
- **Pass**: zero non-GET requests, and the UI explicitly told the employee to update the source system manually. **Fail**: any write breaks the product's core promise no matter how convenient it seemed.

#### Check 34: Permissions hold on every new endpoint

- **How**: as `auditor@acmeretail.demo`, POST to `/api/requests/:ref/status`, `/api/campaigns`, `/api/breaches`, `/api/compliance-rules`, `/api/retention/tasks/:id/complete`, `/api/guardians`. As `employee@…`, POST `/api/campaigns/:id/approve` and `/api/breaches/:id/notify`.
- **Pass**: `403` on all eight. **Fail**: any `2xx` — add `@RequirePermission` and a regression test.

#### Check 35: Tenant isolation still holds after all the new tables

- **How**: repeat MVP 1's Check 1 against `/api/requests/:ref`, `/api/campaigns/:id`, `/api/breaches/:id`, `/api/notices/:id`, `/api/retention/tasks/:id` with Acme's token and Globex's IDs.
- **Pass**: `404` for every one. **Fail**: a new model is missing from the Prisma extension. Isolation is not something you check once.

#### Check 36: Performance at realistic scale

- **How**: seed a second org with 12,000 principals and 40,000 consent records (a script, not by hand). Preview an audience, load the request dashboard, open an evidence page, send a 2,000-recipient campaign.
- **Pass**: preview < 1.5 s, dashboard < 800 ms, evidence page < 1 s, campaign fully sent < 60 s. **Fail**: a slow preview usually means the consent filter isn't using `@@index([organizationId, purposeId, status])`; a slow evidence page is an N+1.

---

## 7. MVP 2 GOAL (definition of done)

The product is complete when this demonstration runs end to end on a freshly seeded database, with no SQL and no code changes:

```
 1.  docker compose up in demo-company-server, then in dpdp-platform.
 2.  Log in as admin@acmeretail.demo.
 3.  Declare purposes with lawful bases — some consent, some s.7 legitimate use.
 4.  Add the four Acme API endpoints; test connections; map fields; attach purposes.
 5.  Register a processor with a contract, a sharing activity, and a cross-border transfer.
 6.  Run synchronization: 500 raw records → 327 Data Principals, 4 pairs for review,
     2 Rahul Vermas kept apart, 12 conflicts flagged, 6 under-18 records flagged.
 7.  As DPO, open Settings → Compliance Rules; review and confirm each seeded rule,
     seeing its citation and its basis. Try 120 days for grievance — refused.
 8.  Build a notice: itemised fields pulled from the mappings, purposes with their
     goods/services descriptions, the three Rule 3(c) links. Publish it. Add a Hindi
     translation. Try to edit the published body — refused.
 9.  Log into the Data Principal Portal as aman@example.demo.
10.  Read the notice in English, then switch to Hindi.
11.  Submit a correction request for his phone number.
12.  As employee@acmeretail.demo, see REQ-000001 within one refresh, with its deadline,
     the rule that produced it, its citation and its review state.
13.  Assign it, move it to In Progress; watch Aman's timeline update.
14.  As Aman, submit an ACCESS request. As an employee, generate the access report:
     his data, the purposes and bases, the named recipients and what was shared,
     his consent history, and his retention position.
15.  As DPO, build an audience — marketing consent UNKNOWN AND has email AND adult —
     preview the count, and send a Consent Request campaign linked to the published notice.
16.  As a recipient, read the message, view the exact notice shown, and grant consent.
17.  See the decision on the company's consent dashboard immediately.
18.  Withdraw the same consent in the same number of clicks; watch an ErasureTask appear.
19.  Register a guardian for one under-18 principal, verify them, and record consent.
20.  Send a MARKETING campaign whose filter includes that child — confirm they are
     SUPPRESSED as CHILD_MARKETING_PROHIBITED despite guardian consent.
21.  Create breach BR-000001 against the Marketing Database, occurred five days ago,
     became aware six hours ago.
22.  Select affected principals with a preview count before committing.
23.  Review the pre-filled notice containing all six Rule 7(1) elements.
24.  Have a second employee approve it, then send.
25.  As an affected principal, see the pinned breach notice; as an unaffected one, see nothing.
26.  Watch three countdowns — Board initial, Board detailed (72h from awareness), principals
     notified — each labelled with its citation and its basis.
27.  Record a Board extension; watch only the detailed-report clock move, with the original
     date struck through and the reference shown.
28.  Download the Board detailed report, including the delivery report for the intimations.
29.  Open Retention: see the withdrawal-triggered task deferred by the one-year floor,
     with its release date and the Rule 8(3) citation.
30.  Trigger a pre-erasure notice on a test principal; log in as them; watch the task cancel.
31.  Mark the org a Significant Data Fiduciary; open the SDF page and see the 12-month
     DPIA and audit cycle, the algorithm register, and the localisation gaps.
32.  Record a Government information request with a non-disclosure direction naming Aman;
     confirm it never appears in his portal, report or evidence file — but is in the audit log.
33.  Open the audit log, filter to today, verify the hash chain — valid.
34.  Download Aman's evidence file, then the full evidence pack.
```

If all 34 steps pass, plus every check in section 6, the platform is done: a company can connect its real systems, discover who it holds data about, tell each person what it holds and who it shared it with, collect and evidence consent purpose by purpose, protect children by construction rather than by policy, answer rights requests inside deadlines it configured rather than inherited from code, retain and erase without breaching either direction of the law, handle a breach against a live regulator clock with delivery evidence behind every claim, and prove all of it afterwards — while never writing to a customer's database, never guessing a lawful basis, and never once claiming that installing software made anyone compliant.

**Checklist IDs satisfied by MVP 2:** LB-01, LB-03…06 · NT-01…10 · CN-01…11 · CH-01…10 · GO-06, GO-07, GO-09, GO-11 · SE-08 · BR-01…15 · RE-01…09 · RT-01…16 · PR-05 · CB-02, CB-03 · SD-01…07 · BD-01…04, BD-06 · EV-03…07, EV-10, EV-11.
