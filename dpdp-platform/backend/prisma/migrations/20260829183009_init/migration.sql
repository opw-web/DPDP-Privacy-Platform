-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "EntityRole" AS ENUM ('DATA_FIDUCIARY', 'DATA_PROCESSOR', 'BOTH');

-- CreateEnum
CREATE TYPE "ThirdScheduleClass" AS ENUM ('NONE', 'ECOMMERCE', 'ONLINE_GAMING', 'SOCIAL_MEDIA');

-- CreateEnum
CREATE TYPE "LawfulBasis" AS ENUM ('CONSENT', 'LEGITIMATE_USE');

-- CreateEnum
CREATE TYPE "LegitimateUseLimb" AS ENUM ('VOLUNTARY_PROVISION', 'STATE_SUBSIDY_BENEFIT', 'STATE_FUNCTION', 'MEDICAL_EMERGENCY', 'EPIDEMIC_PUBLIC_HEALTH', 'DISASTER_PUBLIC_ORDER', 'EMPLOYMENT', 'SAFEGUARD_EMPLOYER_LOSS', 'OTHER_S7');

-- CreateEnum
CREATE TYPE "DataSourceStatus" AS ENUM ('DRAFT', 'CONNECTED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('BEARER', 'API_KEY_HEADER', 'BASIC', 'NONE');

-- CreateEnum
CREATE TYPE "SyncFrequency" AS ENUM ('MANUAL', 'EVERY_15_MIN', 'HOURLY', 'DAILY');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "CanonicalField" AS ENUM ('FULL_NAME', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE', 'DATE_OF_BIRTH', 'GENDER', 'ADDRESS_LINE1', 'ADDRESS_LINE2', 'CITY', 'STATE', 'POSTAL_CODE', 'COUNTRY', 'CUSTOMER_ID', 'ACCOUNT_STATUS', 'LAST_ACTIVITY_AT', 'PURCHASE_TOTAL', 'EXTERNAL_ID', 'IGNORE');

-- CreateEnum
CREATE TYPE "DataCategory" AS ENUM ('IDENTITY', 'CONTACT', 'DEMOGRAPHIC', 'FINANCIAL', 'TRANSACTIONAL', 'BEHAVIOURAL', 'LOCATION', 'HEALTH', 'BIOMETRIC', 'GOVT_ID', 'OTHER');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('EMAIL', 'PHONE', 'CUSTOMER_ID');

-- CreateEnum
CREATE TYPE "MatchConfidence" AS ENUM ('EXACT', 'HIGH', 'POSSIBLE', 'UNMATCHED');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('ACTIVE', 'DETACHED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('EMPLOYEE', 'PRINCIPAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AgeStatus" AS ENUM ('UNKNOWN', 'ADULT', 'CHILD', 'GUARDIAN_REPRESENTED');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('DATA_PROCESSOR', 'OTHER_DATA_FIDUCIARY');

-- CreateEnum
CREATE TYPE "ContactDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "PrincipalAccountStatus" AS ENUM ('UNCLAIMED', 'ACTIVE', 'LOCKED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "entityRole" "EntityRole" NOT NULL DEFAULT 'DATA_FIDUCIARY',
    "country" TEXT NOT NULL DEFAULT 'IN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "offersGoodsServicesInIndia" BOOLEAN NOT NULL DEFAULT true,
    "dpoName" TEXT,
    "dpoEmail" TEXT,
    "dpoPhone" TEXT,
    "dpoIsIndiaBased" BOOLEAN NOT NULL DEFAULT false,
    "responsiblePersonName" TEXT,
    "responsiblePersonEmail" TEXT,
    "grievanceContactEmail" TEXT,
    "publicPrivacyPageUrl" TEXT,
    "isSignificantDataFiduciary" BOOLEAN NOT NULL DEFAULT false,
    "sdfNotifiedAt" TIMESTAMPTZ(6),
    "sdfNotificationRef" TEXT,
    "thirdScheduleClass" "ThirdScheduleClass" NOT NULL DEFAULT 'NONE',
    "registeredUserCount" BIGINT,
    "classDeclaredByEmployeeId" TEXT,
    "classDeclaredAt" TIMESTAMPTZ(6),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionCode" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionCode")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipalAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "PrincipalAccountStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrincipalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingPurpose" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lawfulBasis" "LawfulBasis" NOT NULL,
    "legitimateUseLimb" "LegitimateUseLimb",
    "basisJustification" TEXT NOT NULL,
    "dataCategories" "DataCategory"[],
    "goodsOrServicesDescription" TEXT,
    "reviewedByEmployeeId" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProcessingPurpose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemType" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "recordsPath" TEXT NOT NULL,
    "externalIdField" TEXT NOT NULL,
    "authType" "AuthType" NOT NULL DEFAULT 'BEARER',
    "credentialCipher" TEXT,
    "credentialHint" TEXT,
    "supportsIncremental" BOOLEAN NOT NULL DEFAULT false,
    "incrementalParam" TEXT,
    "paginationStyle" TEXT NOT NULL DEFAULT 'PAGE',
    "pageSize" INTEGER NOT NULL DEFAULT 100,
    "syncFrequency" "SyncFrequency" NOT NULL DEFAULT 'MANUAL',
    "status" "DataSourceStatus" NOT NULL DEFAULT 'DRAFT',
    "containsOnlyPubliclyAvailableData" BOOLEAN NOT NULL DEFAULT false,
    "publiclyAvailableJustification" TEXT,
    "hostingCountry" TEXT NOT NULL DEFAULT 'IN',
    "lastSyncAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourceField" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "sampleValue" TEXT,
    "inferredType" TEXT NOT NULL,

    CONSTRAINT "DataSourceField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFieldMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "sourceField" TEXT NOT NULL,
    "canonicalField" "CanonicalField" NOT NULL,
    "dataCategory" "DataCategory" NOT NULL DEFAULT 'OTHER',
    "containsPersonalData" BOOLEAN NOT NULL DEFAULT true,
    "isVerifiedCustomerId" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SourceFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourcePurpose" (
    "dataSourceId" TEXT NOT NULL,
    "purposeId" TEXT NOT NULL,

    CONSTRAINT "DataSourcePurpose_pkey" PRIMARY KEY ("dataSourceId","purposeId")
);

-- CreateTable
CREATE TABLE "DataRecipient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RecipientType" NOT NULL,
    "contactEmail" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "contractExists" BOOLEAN NOT NULL DEFAULT false,
    "contractReference" TEXT,
    "contractSignedAt" TIMESTAMPTZ(6),
    "contractExpiresAt" TIMESTAMPTZ(6),
    "contractHasSecurityClause" BOOLEAN NOT NULL DEFAULT false,
    "contractHasErasureClause" BOOLEAN NOT NULL DEFAULT false,
    "contractHasAuditRights" BOOLEAN NOT NULL DEFAULT false,
    "subProcessorsDisclosed" BOOLEAN NOT NULL DEFAULT false,
    "subProcessorNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DataRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharingActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "purposeId" TEXT NOT NULL,
    "dataCategories" "DataCategory"[],
    "description" TEXT NOT NULL,
    "sourceIds" TEXT[],
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "endedAt" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SharingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossBorderTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "dataCategories" "DataCategory"[],
    "purposeDescription" TEXT NOT NULL,
    "govtRestrictionChecked" BOOLEAN NOT NULL DEFAULT false,
    "govtRestrictionNotes" TEXT,
    "sectoralRestrictionNotes" TEXT,
    "localisationRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewedByEmployeeId" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "CrossBorderTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purposeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "retentionValue" INTEGER NOT NULL,
    "retentionUnit" TEXT NOT NULL,
    "legalBasisForRetention" TEXT NOT NULL,
    "legalBasisType" TEXT NOT NULL,
    "minimumRetentionValue" INTEGER NOT NULL DEFAULT 1,
    "minimumRetentionUnit" TEXT NOT NULL DEFAULT 'YEARS',
    "preErasureNoticeHours" INTEGER NOT NULL DEFAULT 48,
    "accountAccessCarveOut" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityMeasure" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataSourceId" TEXT,
    "ruleReference" TEXT NOT NULL,
    "measureType" TEXT NOT NULL,
    "implemented" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "evidenceReference" TEXT,
    "lastReviewedAt" TIMESTAMPTZ(6),
    "reviewedByEmployeeId" TEXT,

    CONSTRAINT "SecurityMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "status" "SyncStatus" NOT NULL DEFAULT 'QUEUED',
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "principalsCreated" INTEGER NOT NULL DEFAULT 0,
    "principalsLinked" INTEGER NOT NULL DEFAULT 0,
    "candidatesRaised" INTEGER NOT NULL DEFAULT 0,
    "errorLog" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "fullName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "emailRaw" TEXT,
    "emailNormalized" TEXT,
    "phoneRaw" TEXT,
    "phoneNormalized" TEXT,
    "customerId" TEXT,
    "dateOfBirth" TIMESTAMPTZ(6),
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "nameKey" TEXT,
    "extras" JSONB NOT NULL DEFAULT '{}',
    "normalizedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataPrincipal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "lastPrincipalContactAt" TIMESTAMPTZ(6),
    "lastPrincipalContactSource" TEXT,
    "ageStatus" "AgeStatus" NOT NULL DEFAULT 'UNKNOWN',
    "ageStatusSource" TEXT,
    "ageStatusSetAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DataPrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipalIdentifier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PrincipalIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "normalizedRecordId" TEXT NOT NULL,
    "confidence" "MatchConfidence" NOT NULL,
    "matchedOn" JSONB NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "linkedByEmployeeId" TEXT,
    "detachedAt" TIMESTAMPTZ(6),
    "detachReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipalDataField" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "canonicalField" "CanonicalField" NOT NULL,
    "value" TEXT NOT NULL,
    "dataCategory" "DataCategory" NOT NULL,
    "sourceIds" TEXT[],
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "conflict" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PrincipalDataField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchCandidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "normalizedRecordId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "confidence" "MatchConfidence" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByEmployeeId" TEXT,
    "decidedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipalContactEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "direction" "ContactDirection" NOT NULL,
    "channel" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrincipalContactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "subjectPrincipalId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("organizationId","name")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_code_key" ON "Role"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Employee_organizationId_idx" ON "Employee"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_organizationId_email_key" ON "Employee"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PrincipalAccount_dataPrincipalId_key" ON "PrincipalAccount"("dataPrincipalId");

-- CreateIndex
CREATE UNIQUE INDEX "PrincipalAccount_organizationId_email_key" ON "PrincipalAccount"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_actorType_actorId_idx" ON "RefreshToken"("actorType", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingPurpose_organizationId_code_key" ON "ProcessingPurpose"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_organizationId_name_key" ON "DataSource"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DataSourceField_dataSourceId_fieldName_key" ON "DataSourceField"("dataSourceId", "fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFieldMapping_dataSourceId_sourceField_key" ON "SourceFieldMapping"("dataSourceId", "sourceField");

-- CreateIndex
CREATE UNIQUE INDEX "DataRecipient_organizationId_name_key" ON "DataRecipient"("organizationId", "name");

-- CreateIndex
CREATE INDEX "SharingActivity_organizationId_recipientId_idx" ON "SharingActivity"("organizationId", "recipientId");

-- CreateIndex
CREATE INDEX "CrossBorderTransfer_organizationId_idx" ON "CrossBorderTransfer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_organizationId_purposeId_name_key" ON "RetentionPolicy"("organizationId", "purposeId", "name");

-- CreateIndex
CREATE INDEX "SecurityMeasure_organizationId_ruleReference_idx" ON "SecurityMeasure"("organizationId", "ruleReference");

-- CreateIndex
CREATE INDEX "SyncJob_organizationId_dataSourceId_startedAt_idx" ON "SyncJob"("organizationId", "dataSourceId", "startedAt");

-- CreateIndex
CREATE INDEX "SourceRecord_organizationId_idx" ON "SourceRecord"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRecord_dataSourceId_sourceRecordKey_key" ON "SourceRecord"("dataSourceId", "sourceRecordKey");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedRecord_sourceRecordId_key" ON "NormalizedRecord"("sourceRecordId");

-- CreateIndex
CREATE INDEX "NormalizedRecord_organizationId_emailNormalized_idx" ON "NormalizedRecord"("organizationId", "emailNormalized");

-- CreateIndex
CREATE INDEX "NormalizedRecord_organizationId_phoneNormalized_idx" ON "NormalizedRecord"("organizationId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "DataPrincipal_organizationId_displayName_idx" ON "DataPrincipal"("organizationId", "displayName");

-- CreateIndex
CREATE INDEX "DataPrincipal_organizationId_ageStatus_idx" ON "DataPrincipal"("organizationId", "ageStatus");

-- CreateIndex
CREATE UNIQUE INDEX "DataPrincipal_organizationId_reference_key" ON "DataPrincipal"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "PrincipalIdentifier_dataPrincipalId_idx" ON "PrincipalIdentifier"("dataPrincipalId");

-- CreateIndex
CREATE UNIQUE INDEX "PrincipalIdentifier_organizationId_type_value_key" ON "PrincipalIdentifier"("organizationId", "type", "value");

-- CreateIndex
CREATE INDEX "IdentityLink_dataPrincipalId_status_idx" ON "IdentityLink"("dataPrincipalId", "status");

-- CreateIndex
CREATE INDEX "PrincipalDataField_organizationId_dataPrincipalId_idx" ON "PrincipalDataField"("organizationId", "dataPrincipalId");

-- CreateIndex
CREATE UNIQUE INDEX "PrincipalDataField_dataPrincipalId_canonicalField_value_key" ON "PrincipalDataField"("dataPrincipalId", "canonicalField", "value");

-- CreateIndex
CREATE INDEX "MatchCandidate_organizationId_status_idx" ON "MatchCandidate"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchCandidate_normalizedRecordId_dataPrincipalId_key" ON "MatchCandidate"("normalizedRecordId", "dataPrincipalId");

-- CreateIndex
CREATE INDEX "PrincipalContactEvent_organizationId_dataPrincipalId_occurr_idx" ON "PrincipalContactEvent"("organizationId", "dataPrincipalId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_subjectPrincipalId_createdAt_idx" ON "AuditEvent"("organizationId", "subjectPrincipalId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_resourceType_resourceId_idx" ON "AuditEvent"("organizationId", "resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_organizationId_sequence_key" ON "AuditEvent"("organizationId", "sequence");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "Permission"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrincipalAccount" ADD CONSTRAINT "PrincipalAccount_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSourceField" ADD CONSTRAINT "DataSourceField_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceFieldMapping" ADD CONSTRAINT "SourceFieldMapping_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSourcePurpose" ADD CONSTRAINT "DataSourcePurpose_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSourcePurpose" ADD CONSTRAINT "DataSourcePurpose_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "ProcessingPurpose"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharingActivity" ADD CONSTRAINT "SharingActivity_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "DataRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharingActivity" ADD CONSTRAINT "SharingActivity_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "ProcessingPurpose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossBorderTransfer" ADD CONSTRAINT "CrossBorderTransfer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "DataRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "ProcessingPurpose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityMeasure" ADD CONSTRAINT "SecurityMeasure_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedRecord" ADD CONSTRAINT "NormalizedRecord_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrincipalIdentifier" ADD CONSTRAINT "PrincipalIdentifier_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityLink" ADD CONSTRAINT "IdentityLink_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityLink" ADD CONSTRAINT "IdentityLink_normalizedRecordId_fkey" FOREIGN KEY ("normalizedRecordId") REFERENCES "NormalizedRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrincipalDataField" ADD CONSTRAINT "PrincipalDataField_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrincipalContactEvent" ADD CONSTRAINT "PrincipalContactEvent_dataPrincipalId_fkey" FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
