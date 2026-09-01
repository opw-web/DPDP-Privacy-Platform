-- Reconcile the four historical ConsentRecord rows that predated the
-- DataPrincipal relation.  ConsentRecord/ConsentEvent are evidence and must
-- not be deleted or rewritten.  A tenant-owned placeholder principal keeps
-- each original dataPrincipalId stable while making the relation valid.
DO $$
DECLARE
  conflicting_id text;
BEGIN
  SELECT cr."dataPrincipalId"
    INTO conflicting_id
  FROM "ConsentRecord" cr
  LEFT JOIN "DataPrincipal" dp ON dp.id = cr."dataPrincipalId"
  WHERE dp.id IS NULL
  GROUP BY cr."dataPrincipalId"
  HAVING COUNT(DISTINCT cr."organizationId") > 1
  LIMIT 1;

  IF conflicting_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot reconcile orphan consent principal %: records belong to multiple organizations',
      conflicting_id;
  END IF;
END $$;

INSERT INTO "DataPrincipal" (
  "id",
  "organizationId",
  "reference",
  "displayName",
  "ageStatus",
  "createdAt",
  "updatedAt"
)
SELECT
  cr."dataPrincipalId",
  cr."organizationId",
  'ORPHAN-CONSENT-' || cr."dataPrincipalId",
  'Unresolved consent principal (' || cr."dataPrincipalId" || ')',
  'UNKNOWN'::"AgeStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ConsentRecord" cr
LEFT JOIN "DataPrincipal" dp ON dp.id = cr."dataPrincipalId"
WHERE dp.id IS NULL
GROUP BY cr."dataPrincipalId", cr."organizationId";

-- The prior migration added this constraint NOT VALID solely to permit the
-- historical rows above.  Validate it now that every evidence row has a
-- stable, tenant-owned principal target.
ALTER TABLE "ConsentRecord"
  VALIDATE CONSTRAINT "ConsentRecord_dataPrincipalId_fkey";
