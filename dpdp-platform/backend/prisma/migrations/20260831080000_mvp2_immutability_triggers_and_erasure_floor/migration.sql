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
