-- SE-03 / Rule 6(1)(e)
-- AuditEvent is immutable and hash chained, so access-log retention must
-- delete a separate projection rather than corrupting the evidence chain.
CREATE TABLE "AccessLogEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditEventId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "subjectPrincipalId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AccessLogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessLogEntry_auditEventId_key"
  ON "AccessLogEntry" ("auditEventId");
CREATE INDEX "AccessLogEntry_organizationId_occurredAt_idx"
  ON "AccessLogEntry" ("organizationId", "occurredAt");
CREATE INDEX "AccessLogEntry_organizationId_subjectPrincipalId_occurredAt_idx"
  ON "AccessLogEntry" ("organizationId", "subjectPrincipalId", "occurredAt");

-- Safe backfill: only PERSONAL_DATA_VIEWED rows are copied, and no
-- AuditEvent row is changed or deleted. The anti-join makes this rerunnable
-- during local development and protects an already-partially-backfilled DB.
INSERT INTO "AccessLogEntry" (
  "id", "organizationId", "auditEventId", "sequence", "actorType",
  "actorId", "actorLabel", "subjectPrincipalId", "resourceType",
  "resourceId", "metadata", "ipAddress", "userAgent", "occurredAt"
)
SELECT
  "id", "organizationId", "id", "sequence", "actorType",
  "actorId", "actorLabel", "subjectPrincipalId", "resourceType",
  "resourceId", "metadata", "ipAddress", "userAgent", "createdAt"
FROM "AuditEvent" event
WHERE event."action" = 'PERSONAL_DATA_VIEWED'
  AND NOT EXISTS (
    SELECT 1 FROM "AccessLogEntry" projection
    WHERE projection."auditEventId" = event."id"
  );
