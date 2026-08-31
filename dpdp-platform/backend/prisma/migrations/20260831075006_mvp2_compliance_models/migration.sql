-- CreateEnum
CREATE TYPE "RuleBasis" AS ENUM ('STATUTORY', 'SECTORAL', 'ORG_POLICY', 'INTERNAL_TARGET');

-- CreateEnum
CREATE TYPE "DeadlineUnit" AS ENUM ('HOURS', 'DAYS', 'MONTHS', 'YEARS');

-- CreateEnum
CREATE TYPE "NoticeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('ACCESS', 'CORRECTION', 'COMPLETION', 'UPDATE', 'ERASURE', 'CONSENT_WITHDRAWAL', 'GRIEVANCE', 'NOMINATION', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'VERIFICATION_REQUIRED', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PRINCIPAL', 'ESCALATED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'DENIED', 'WITHDRAWN', 'UNKNOWN', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('PORTAL', 'EMAIL', 'IMPORTED', 'IN_PERSON', 'API', 'CONSENT_MANAGER');

-- CreateEnum
CREATE TYPE "GuardianKind" AS ENUM ('PARENT_OF_CHILD', 'LAWFUL_GUARDIAN_OF_PWD');

-- CreateEnum
CREATE TYPE "GuardianVerification" AS ENUM ('NONE', 'EXISTING_RELIABLE_DETAILS', 'SELF_PROVIDED_DETAILS', 'VIRTUAL_TOKEN', 'DIGITAL_LOCKER', 'COURT_ORDER', 'DESIGNATED_AUTHORITY', 'LOCAL_LEVEL_COMMITTEE');

-- CreateEnum
CREATE TYPE "MessageCategory" AS ENUM ('NOTICE', 'CONSENT_REQUEST', 'COMPLIANCE_NOTICE', 'BREACH_NOTICE', 'REQUEST_UPDATE', 'PRE_ERASURE_NOTICE', 'GENERAL_NOTIFICATION', 'MARKETING');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('PORTAL', 'EMAIL');

-- CreateEnum
CREATE TYPE "BreachStatus" AS ENUM ('DETECTED', 'INVESTIGATING', 'CONTAINED', 'PRINCIPALS_NOTIFIED', 'BOARD_NOTIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'WAIVED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ErasureState" AS ENUM ('EVALUATED', 'NOTICE_SENT', 'DEFERRED_RETENTION_FLOOR', 'ON_LEGAL_HOLD', 'READY_FOR_ERASURE', 'ERASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SdfAssessmentKind" AS ENUM ('DPIA', 'AUDIT');

-- NOTE: `prisma migrate dev`'s diff wanted to DROP "principal_name_trgm"
-- and "pdf_value_trgm" here. Both are real, deployed indexes -- created by
-- raw SQL in the 20260829183100_constraints_and_triggers migration using a
-- GIN/pg_trgm index type Prisma's schema DSL cannot express, so
-- schema.prisma has no representation of them and every future diff will
-- propose dropping them. Deliberately removed from the generated SQL: this
-- migration adds MVP 2 tables, it must not silently regress MVP 1's
-- trigram name/value search.

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'IN',
    "legalSource" TEXT NOT NULL,
    "basis" "RuleBasis" NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "deadlineValue" INTEGER NOT NULL,
    "deadlineUnit" "DeadlineUnit" NOT NULL,
    "warningLead" INTEGER NOT NULL,
    "escalateOnBreach" BOOLEAN NOT NULL DEFAULT false,
    "publishedPeriodText" TEXT,
    "effectiveFrom" TIMESTAMPTZ(6) NOT NULL,
    "effectiveUntil" TIMESTAMPTZ(6),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reviewedByEmployeeId" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyNotice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purposeIds" TEXT[],
    "status" "NoticeStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "itemisedDataFields" JSONB NOT NULL,
    "purposeStatements" JSONB NOT NULL,
    "withdrawalUrl" TEXT NOT NULL,
    "rightsUrl" TEXT NOT NULL,
    "boardComplaintUrl" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(6),
    "retiredAt" TIMESTAMPTZ(6),
    "createdByEmployeeId" TEXT NOT NULL,
    "approvedByEmployeeId" TEXT,

    CONSTRAINT "NoticeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeTranslation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "noticeVersionId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "translatedByEmployeeId" TEXT,

    CONSTRAINT "NoticeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "purposeId" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "grantedAt" TIMESTAMPTZ(6),
    "withdrawnAt" TIMESTAMPTZ(6),
    "deniedAt" TIMESTAMPTZ(6),
    "channel" "ConsentChannel",
    "noticeVersionId" TEXT,
    "noticeContentHash" TEXT,
    "givenByGuardianId" TEXT,
    "consentManagerRef" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consentRecordId" TEXT NOT NULL,
    "fromStatus" "ConsentStatus",
    "toStatus" "ConsentStatus" NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "noticeVersionId" TEXT,
    "noticeContentHash" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "actorType" "ActorType" NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianRelationship" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "kind" "GuardianKind" NOT NULL,
    "guardianName" TEXT NOT NULL,
    "guardianEmail" TEXT,
    "guardianPhone" TEXT,
    "verification" "GuardianVerification" NOT NULL DEFAULT 'NONE',
    "verificationReference" TEXT,
    "verifiedByEmployeeId" TEXT,
    "verifiedAt" TIMESTAMPTZ(6),
    "appointingAuthority" TEXT,
    "appointmentReference" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildExemptionClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purposeId" TEXT NOT NULL,
    "schedulePart" TEXT NOT NULL,
    "scheduleRow" INTEGER NOT NULL,
    "conditionText" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "claimedByEmployeeId" TEXT NOT NULL,
    "claimedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByEmployeeId" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ChildExemptionClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipalRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "submittedByGuardianId" TEXT,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requestedChanges" JSONB NOT NULL DEFAULT '{}',
    "channel" TEXT NOT NULL DEFAULT 'PORTAL',
    "identityVerifiedBy" TEXT,
    "identityVerifiedAt" TIMESTAMPTZ(6),
    "assignedEmployeeId" TEXT,
    "escalatedAt" TIMESTAMPTZ(6),
    "ruleId" TEXT,
    "ruleCodeSnapshot" TEXT,
    "ruleVersionSnapshot" INTEGER,
    "ruleBasisSnapshot" "RuleBasis",
    "legalSourceSnapshot" TEXT,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(6),
    "warningAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "isFrivolousFlagged" BOOLEAN NOT NULL DEFAULT false,
    "frivolousReason" TEXT,
    "outcomeCode" TEXT,
    "outcome" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PrincipalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus",
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "note" TEXT,
    "visibleToPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nomination" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "nomineeName" TEXT NOT NULL,
    "nomineeEmail" TEXT,
    "nomineePhone" TEXT,
    "relationship" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "activationCondition" TEXT NOT NULL,
    "particularsProvided" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Nomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErasureTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "retentionPolicyId" TEXT,
    "trigger" TEXT NOT NULL,
    "state" "ErasureState" NOT NULL DEFAULT 'EVALUATED',
    "evaluatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preErasureNoticeDueAt" TIMESTAMPTZ(6),
    "preErasureNoticeSentAt" TIMESTAMPTZ(6),
    "erasureDueAt" TIMESTAMPTZ(6),
    "retentionFloorUntil" TIMESTAMPTZ(6),
    "legalHoldId" TEXT,
    "systemChecklist" JSONB NOT NULL DEFAULT '[]',
    "processorChecklist" JSONB NOT NULL DEFAULT '[]',
    "completedAt" TIMESTAMPTZ(6),
    "completedByEmployeeId" TEXT,
    "cancelledReason" TEXT,
    "ruleCodeSnapshot" TEXT,
    "ruleVersionSnapshot" INTEGER,

    CONSTRAINT "ErasureTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "legalCitation" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(6),
    "createdByEmployeeId" TEXT NOT NULL,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "variables" TEXT[],
    "requiredVariables" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "templateId" TEXT,
    "subject" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "audienceFilter" JSONB NOT NULL,
    "purposeId" TEXT,
    "noticeVersionId" TEXT,
    "breachId" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "createdByEmployeeId" TEXT NOT NULL,
    "approvedByEmployeeId" TEXT,
    "approvedAt" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "address" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "suppressReason" TEXT,
    "renderedSubject" TEXT,
    "renderedBody" TEXT,
    "sentAt" TIMESTAMPTZ(6),
    "failureReason" TEXT,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "audience" "ActorType" NOT NULL,
    "employeeId" TEXT,
    "dataPrincipalId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "linkPath" TEXT,
    "campaignId" TEXT,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreachIncident" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(6),
    "becameAwareAt" TIMESTAMPTZ(6) NOT NULL,
    "discoveredByEmployeeId" TEXT NOT NULL,
    "affectedSourceIds" TEXT[],
    "dataCategories" "DataCategory"[],
    "involvesChildren" BOOLEAN NOT NULL DEFAULT false,
    "natureExtentTiming" TEXT,
    "consequences" TEXT,
    "mitigationMeasures" TEXT,
    "safetyMeasuresForPrincipals" TEXT,
    "responderContact" TEXT,
    "boardBroadFacts" TEXT,
    "boardMitigation" TEXT,
    "boardPerpetratorFindings" TEXT,
    "boardRemedialMeasures" TEXT,
    "boardExtensionRequestedAt" TIMESTAMPTZ(6),
    "boardExtensionGrantedUntil" TIMESTAMPTZ(6),
    "boardExtensionReference" TEXT,
    "status" "BreachStatus" NOT NULL DEFAULT 'DETECTED',
    "closedAt" TIMESTAMPTZ(6),
    "closureNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BreachIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreachObligation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "breachId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ruleCodeSnapshot" TEXT NOT NULL,
    "ruleVersionSnapshot" INTEGER NOT NULL,
    "legalSourceSnapshot" TEXT NOT NULL,
    "basisSnapshot" "RuleBasis" NOT NULL,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "warningAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "ObligationStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMPTZ(6),
    "completedByEmployeeId" TEXT,
    "evidenceReference" TEXT,
    "waiverReason" TEXT,

    CONSTRAINT "BreachObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreachAffectedPrincipal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "breachId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMPTZ(6),
    "notificationChannel" "DeliveryChannel",
    "campaignRecipientId" TEXT,
    "addedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreachAffectedPrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdfAssessment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "SdfAssessmentKind" NOT NULL,
    "cycleStartedAt" TIMESTAMPTZ(6) NOT NULL,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "conductedBy" TEXT NOT NULL,
    "isIndependent" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMPTZ(6),
    "significantObservations" TEXT,
    "reportReference" TEXT,
    "furnishedToBoardAt" TIMESTAMPTZ(6),
    "furnishedReference" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SdfAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlgorithmRegisterEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "operations" TEXT[],
    "riskAssessment" TEXT,
    "riskToRightsIdentified" BOOLEAN NOT NULL DEFAULT false,
    "mitigations" TEXT,
    "lastReviewedAt" TIMESTAMPTZ(6),
    "reviewedByEmployeeId" TEXT,

    CONSTRAINT "AlgorithmRegisterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformationRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "requestingBody" TEXT NOT NULL,
    "authorisedPersonRef" TEXT NOT NULL,
    "purposeCited" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL,
    "responseDueAt" TIMESTAMPTZ(6) NOT NULL,
    "nonDisclosureDirected" BOOLEAN NOT NULL DEFAULT false,
    "nonDisclosurePermissionRef" TEXT,
    "affectedPrincipalIds" TEXT[],
    "respondedAt" TIMESTAMPTZ(6),
    "responseReference" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InformationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoluntaryUndertaking" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(6) NOT NULL,
    "commitments" JSONB NOT NULL DEFAULT '[]',
    "closedAt" TIMESTAMPTZ(6),

    CONSTRAINT "VoluntaryUndertaking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceRule_organizationId_appliesTo_enabled_idx" ON "ComplianceRule"("organizationId", "appliesTo", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRule_organizationId_ruleCode_version_key" ON "ComplianceRule"("organizationId", "ruleCode", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyNotice_organizationId_code_key" ON "PrivacyNotice"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeVersion_noticeId_version_key" ON "NoticeVersion"("noticeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeTranslation_noticeVersionId_languageCode_key" ON "NoticeTranslation"("noticeVersionId", "languageCode");

-- CreateIndex
CREATE INDEX "ConsentRecord_organizationId_purposeId_status_idx" ON "ConsentRecord"("organizationId", "purposeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_dataPrincipalId_purposeId_key" ON "ConsentRecord"("dataPrincipalId", "purposeId");

-- CreateIndex
CREATE INDEX "ConsentEvent_consentRecordId_createdAt_idx" ON "ConsentEvent"("consentRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "GuardianRelationship_organizationId_dataPrincipalId_idx" ON "GuardianRelationship"("organizationId", "dataPrincipalId");

-- CreateIndex
CREATE INDEX "ChildExemptionClaim_organizationId_purposeId_idx" ON "ChildExemptionClaim"("organizationId", "purposeId");

-- CreateIndex
CREATE INDEX "PrincipalRequest_organizationId_status_dueAt_idx" ON "PrincipalRequest"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "PrincipalRequest_organizationId_dataPrincipalId_idx" ON "PrincipalRequest"("organizationId", "dataPrincipalId");

-- CreateIndex
CREATE UNIQUE INDEX "PrincipalRequest_organizationId_reference_key" ON "PrincipalRequest"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "Nomination_organizationId_dataPrincipalId_idx" ON "Nomination"("organizationId", "dataPrincipalId");

-- CreateIndex
CREATE INDEX "ErasureTask_organizationId_state_erasureDueAt_idx" ON "ErasureTask"("organizationId", "state", "erasureDueAt");

-- CreateIndex
CREATE INDEX "ErasureTask_organizationId_dataPrincipalId_idx" ON "ErasureTask"("organizationId", "dataPrincipalId");

-- CreateIndex
CREATE INDEX "LegalHold_organizationId_idx" ON "LegalHold"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_organizationId_code_version_key" ON "MessageTemplate"("organizationId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MessageCampaign_organizationId_reference_key" ON "MessageCampaign"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "CampaignRecipient_organizationId_dataPrincipalId_idx" ON "CampaignRecipient"("organizationId", "dataPrincipalId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_dataPrincipalId_channel_key" ON "CampaignRecipient"("campaignId", "dataPrincipalId", "channel");

-- CreateIndex
CREATE INDEX "Notification_organizationId_employeeId_readAt_idx" ON "Notification"("organizationId", "employeeId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_dataPrincipalId_readAt_idx" ON "Notification"("organizationId", "dataPrincipalId", "readAt");

-- CreateIndex
CREATE INDEX "BreachIncident_organizationId_status_idx" ON "BreachIncident"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BreachIncident_organizationId_reference_key" ON "BreachIncident"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "BreachObligation_organizationId_status_dueAt_idx" ON "BreachObligation"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "BreachObligation_breachId_code_key" ON "BreachObligation"("breachId", "code");

-- CreateIndex
CREATE INDEX "BreachAffectedPrincipal_organizationId_dataPrincipalId_idx" ON "BreachAffectedPrincipal"("organizationId", "dataPrincipalId");

-- CreateIndex
CREATE UNIQUE INDEX "BreachAffectedPrincipal_breachId_dataPrincipalId_key" ON "BreachAffectedPrincipal"("breachId", "dataPrincipalId");

-- CreateIndex
CREATE INDEX "SdfAssessment_organizationId_kind_dueAt_idx" ON "SdfAssessment"("organizationId", "kind", "dueAt");

-- CreateIndex
CREATE INDEX "AlgorithmRegisterEntry_organizationId_idx" ON "AlgorithmRegisterEntry"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "InformationRequest_organizationId_reference_key" ON "InformationRequest"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "VoluntaryUndertaking_organizationId_reference_key" ON "VoluntaryUndertaking"("organizationId", "reference");

-- AddForeignKey
ALTER TABLE "NoticeVersion" ADD CONSTRAINT "NoticeVersion_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "PrivacyNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeTranslation" ADD CONSTRAINT "NoticeTranslation_noticeVersionId_fkey" FOREIGN KEY ("noticeVersionId") REFERENCES "NoticeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_consentRecordId_fkey" FOREIGN KEY ("consentRecordId") REFERENCES "ConsentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrincipalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MessageCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreachObligation" ADD CONSTRAINT "BreachObligation_breachId_fkey" FOREIGN KEY ("breachId") REFERENCES "BreachIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreachAffectedPrincipal" ADD CONSTRAINT "BreachAffectedPrincipal_breachId_fkey" FOREIGN KEY ("breachId") REFERENCES "BreachIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
