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
