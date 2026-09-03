-- Distinguish profile variance from a mapping-reviewed GO-03 accuracy gap.
CREATE TYPE "MappingComparisonPolicy" AS ENUM (
  'ACCURACY_COMPARABLE',
  'MULTI_VALUE',
  'NOT_COMPARABLE'
);

ALTER TABLE "SourceFieldMapping"
  ADD COLUMN "comparisonPolicy" "MappingComparisonPolicy"
  NOT NULL DEFAULT 'NOT_COMPARABLE';

-- Existing mappings must receive a deterministic, conservative policy rather
-- than treating a canonical name as proof of semantic equivalence. City is the
-- one deliberately seeded same-fact comparison. Email and phone are contact
-- points that may legitimately have several values. The sales/e-commerce
-- total/postal mappings are different concepts; source IDs are per-system
-- identifiers; and full names are display labels with source-specific styles.
UPDATE "SourceFieldMapping"
SET "comparisonPolicy" = CASE "canonicalField"
  WHEN 'CITY' THEN 'ACCURACY_COMPARABLE'::"MappingComparisonPolicy"
  WHEN 'EMAIL' THEN 'MULTI_VALUE'::"MappingComparisonPolicy"
  WHEN 'PHONE' THEN 'MULTI_VALUE'::"MappingComparisonPolicy"
  WHEN 'EXTERNAL_ID' THEN 'NOT_COMPARABLE'::"MappingComparisonPolicy"
  WHEN 'PURCHASE_TOTAL' THEN 'NOT_COMPARABLE'::"MappingComparisonPolicy"
  WHEN 'POSTAL_CODE' THEN 'NOT_COMPARABLE'::"MappingComparisonPolicy"
  WHEN 'FULL_NAME' THEN 'NOT_COMPARABLE'::"MappingComparisonPolicy"
  ELSE 'NOT_COMPARABLE'::"MappingComparisonPolicy"
END;

ALTER TABLE "PrincipalDataField"
  ADD COLUMN "accuracyConflictEligible" BOOLEAN NOT NULL DEFAULT false;

-- Preserve historical profile variance and source lineage. Backfill the
-- durable eligibility signal only when every source represented in a field
-- has an accuracy-comparable mapping for that same canonical field.
UPDATE "PrincipalDataField" AS field
SET "accuracyConflictEligible" = true
WHERE field."conflict" = true
  AND cardinality(field."sourceIds") > 0
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(field."sourceIds") AS source_id(id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM "SourceFieldMapping" AS mapping
      WHERE mapping."dataSourceId" = source_id.id
        AND mapping."canonicalField" = field."canonicalField"
        AND mapping."comparisonPolicy" = 'ACCURACY_COMPARABLE'
    )
  );

CREATE INDEX "PrincipalDataField_organizationId_accuracyConflictEligible_idx"
  ON "PrincipalDataField"("organizationId", "accuracyConflictEligible");
