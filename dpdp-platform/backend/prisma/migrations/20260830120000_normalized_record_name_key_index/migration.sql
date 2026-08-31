-- Supporting-signal matching searches nameKey within a tenant.
CREATE INDEX "NormalizedRecord_organizationId_nameKey_idx"
  ON "NormalizedRecord"("organizationId", "nameKey");
