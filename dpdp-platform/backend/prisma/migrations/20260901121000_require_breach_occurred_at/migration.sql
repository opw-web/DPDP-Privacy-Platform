-- BR-14 stores two distinct clocks: when the incident occurred and when the
-- fiduciary became aware.  Do not infer one from the other for historical
-- rows. Operators must reconcile nulls from their source evidence first;
-- this migration never fabricates an occurrence time. On a clean database
-- the column is made NOT NULL. If legacy rows are present, they remain
-- explicitly nullable until an operator reconciles them, while a trigger
-- enforces the invariant for every new or edited row.
DO $$
DECLARE
  missing_count bigint;
BEGIN
  SELECT COUNT(*)
    INTO missing_count
  FROM "BreachIncident"
  WHERE "occurredAt" IS NULL;

  IF missing_count = 0 THEN
    ALTER TABLE "BreachIncident"
      ALTER COLUMN "occurredAt" SET NOT NULL;
  ELSE
    RAISE NOTICE
      'BreachIncident.occurredAt remains nullable for % historical row(s); reconcile from source evidence before setting NOT NULL',
      missing_count;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION breach_occurred_at_required() RETURNS trigger AS $$
BEGIN
  IF NEW."occurredAt" IS NULL THEN
    RAISE EXCEPTION
      'BreachIncident.occurredAt is required for new or edited incidents; reconcile historical rows before enforcing NOT NULL';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS breach_occurred_at_required ON "BreachIncident";
CREATE TRIGGER breach_occurred_at_required
  BEFORE INSERT OR UPDATE ON "BreachIncident"
  FOR EACH ROW EXECUTE FUNCTION breach_occurred_at_required();
