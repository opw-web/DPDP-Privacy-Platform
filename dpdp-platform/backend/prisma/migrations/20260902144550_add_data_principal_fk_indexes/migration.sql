-- Task 20 fix round 4 (principals.e2e-spec.ts contention/timeout
-- investigation): nine tables carry a foreign key to DataPrincipal(id)
-- (onDelete Restrict, Cascade, or SetNull) but only had a compound index
-- with dataPrincipalId as a NON-leading column, or no index at all.
-- Postgres cannot use a non-leading column of a B-tree index to satisfy
-- the FK action's `WHERE "dataPrincipalId" = $1` check, so every one of
-- these ran a sequential scan of the whole child table ONCE PER DELETED
-- PRINCIPAL. Measured directly against the live e2e database (~9k
-- accumulated rows in the worst-hit tables from other suites sharing the
-- same Postgres): a 50,000-row DataPrincipal delete took ~7s per 2,000
-- rows (~175s extrapolated for the full batch), with EXPLAIN confirming
-- "Seq Scan" on every one of the nine tables below; adding this index on
-- all nine dropped the same 50,000-row delete to ~6.7s end to end. This
-- is the dominant cause of principals.e2e-spec.ts's afterAll intermittently
-- exceeding its 120s hook timeout under full-suite load, and it is not
-- only a test-fixture concern -- any real erasure/deletion of a
-- DataPrincipal in production pays the same seq-scan cost as these
-- tables grow.
--
-- NOTE: `prisma migrate dev`'s diff also proposed dropping the raw-SQL
-- GIN trigram indexes "principal_name_trgm" / "pdf_value_trgm" (Prisma's
-- schema DSL cannot express them, so schema.prisma has no representation
-- and every diff proposes dropping them -- see the identical note in
-- 20260831075006_mvp2_compliance_models/migration.sql) and a cosmetic
-- rename of PurposeServedSignal's existing (unrelated, pre-existing)
-- unique-constraint index name. Both deliberately omitted: this
-- migration's only intended effect is the nine CREATE INDEX statements
-- below.

-- CreateIndex
CREATE INDEX "BreachAffectedPrincipal_dataPrincipalId_idx" ON "BreachAffectedPrincipal"("dataPrincipalId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_dataPrincipalId_idx" ON "CampaignRecipient"("dataPrincipalId");

-- CreateIndex
CREATE INDEX "ErasureTask_dataPrincipalId_idx" ON "ErasureTask"("dataPrincipalId");

-- CreateIndex
CREATE INDEX "GuardianRelationship_dataPrincipalId_idx" ON "GuardianRelationship"("dataPrincipalId");

-- CreateIndex
CREATE INDEX "Nomination_dataPrincipalId_idx" ON "Nomination"("dataPrincipalId");

-- CreateIndex
CREATE INDEX "Notification_dataPrincipalId_idx" ON "Notification"("dataPrincipalId");

-- CreateIndex
CREATE INDEX "PrincipalContactEvent_dataPrincipalId_idx" ON "PrincipalContactEvent"("dataPrincipalId");

-- CreateIndex
CREATE INDEX "PrincipalRequest_dataPrincipalId_idx" ON "PrincipalRequest"("dataPrincipalId");

-- CreateIndex
CREATE INDEX "PurposeServedSignal_dataPrincipalId_idx" ON "PurposeServedSignal"("dataPrincipalId");
