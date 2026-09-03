-- Correct the previous migration's `comparisonPolicy` backfill.
--
-- The `20260903090000_mapping_comparison_policy` migration guessed a
-- mapping's comparison policy from its `canonicalField` name (CITY ->
-- ACCURACY_COMPARABLE, EMAIL/PHONE -> MULTI_VALUE, everything else ->
-- NOT_COMPARABLE) and then derived `accuracyConflictEligible` from that
-- guess. That is the exact defect `step-6-conflict-diagnosis.md` warns
-- against under a different name: "A static global allowlist beyond
-- EXTERNAL_ID would still be wrong for another tenant whose two postal
-- codes genuinely disagree." A canonical field's NAME never establishes
-- that two source systems' values are the same fact -- that is a
-- judgement `MappingComparisonPolicy` exists so an administrator can make
-- deliberately, per mapping, after reviewing the actual source fields
-- (mapping wizard / `PUT /api/data-sources/:id/mappings`), never one this
-- platform infers for every existing tenant from a field's canonical
-- name.
--
-- This migration is a plain reset to the column's own conservative
-- default -- it does not read or branch on `canonicalField` for any row,
-- so it is not a reintroduction of the same defect. Every mapping goes
-- back to NOT_COMPARABLE ("not yet reviewed"); every field's
-- `accuracyConflictEligible` goes back to false to match. An
-- administrator who reviews a source's mappings and confirms a policy
-- (e.g. City is genuinely the same fact across two systems) causes
-- `MappingsService.replace()` to call `AssemblyService.rebuild()` for
-- every principal with an ACTIVE link from that source, in the same
-- transaction as the reviewed mapping write -- the supported, no-hand-SQL
-- path back to an accurate `accuracyConflictEligible` signal. Raw profile
-- variance (`PrincipalDataField.conflict`, with every value and its
-- lineage) is untouched by either migration.
UPDATE "SourceFieldMapping"
SET "comparisonPolicy" = 'NOT_COMPARABLE';

UPDATE "PrincipalDataField"
SET "accuracyConflictEligible" = false
WHERE "accuracyConflictEligible" = true;
