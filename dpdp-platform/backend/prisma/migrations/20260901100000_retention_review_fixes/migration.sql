-- Retention review fixes: a policy-defined, principal-specific PURPOSE_SERVED
-- signal. `scheduledAt` makes consumption by the scanner durable and
-- idempotent; it is set in the same transaction that creates the ErasureTask.
CREATE TABLE "PurposeServedSignal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPrincipalId" TEXT NOT NULL,
    "retentionPolicyId" TEXT NOT NULL,
    "servedAt" TIMESTAMPTZ(6) NOT NULL,
    "scheduledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurposeServedSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurposeServedSignal_organizationId_dataPrincipalId_retentionPolicyId_key"
ON "PurposeServedSignal"("organizationId", "dataPrincipalId", "retentionPolicyId");

CREATE INDEX "PurposeServedSignal_organizationId_scheduledAt_idx"
ON "PurposeServedSignal"("organizationId", "scheduledAt");

ALTER TABLE "PurposeServedSignal"
ADD CONSTRAINT "PurposeServedSignal_dataPrincipalId_fkey"
FOREIGN KEY ("dataPrincipalId") REFERENCES "DataPrincipal"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurposeServedSignal"
ADD CONSTRAINT "PurposeServedSignal_retentionPolicyId_fkey"
FOREIGN KEY ("retentionPolicyId") REFERENCES "RetentionPolicy"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
