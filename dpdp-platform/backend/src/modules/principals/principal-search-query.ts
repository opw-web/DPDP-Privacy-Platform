import { Prisma } from "@prisma/client";
import type { AgeStatus } from "@prisma/client";

export type PrincipalSearchQueryParams = {
  organizationId: string;
  /** Trimmed search term. Pass `""` for the unfiltered/browse branch. */
  term: string;
  ageStatus: AgeStatus | null;
  limit: number;
  offset: number;
};

/**
 * The exact query `PrincipalsService.list` issues, exported so nothing else
 * ever hand-copies it. Task 20 fix round 3 (Important 2) found the search
 * EXPLAIN test had drifted from the service's real query (a different LIMIT,
 * a literal `NULL::"AgeStatus"` where the service binds a parameter) and
 * could stay green after the service's query changed underneath it. Every
 * caller -- production and the EXPLAIN test alike -- must build the query
 * through this one function so an EXPLAIN of its output is provably an
 * EXPLAIN of what production runs, and any future edit to the query shape
 * is visible to both at once.
 *
 * Each independent `ILIKE '%term%'` branch carries the tenant predicate
 * and, on the field-value side, the canonical-field restriction, directly
 * in its own `WHERE` -- not as a separate `INTERSECT` arm against an
 * unqualified full-tenant scan. Task 20 fix round 3 (Important 1, Important
 * 4) found the earlier `INTERSECT`-based shape both (a) let a match on any
 * canonical field's value through the door as long as the same principal
 * happened to also own a contact identifier -- the canonical-field
 * restriction was never actually tied to the matching row -- and (b) forced
 * Postgres to materialize the *entire tenant's* ids as the right-hand side of
 * every `INTERSECT`, making the query cost O(tenant size) instead of
 * O(matches). Filtering by tenant and canonical field in the same `WHERE` as
 * the `ILIKE` keeps each candidate set bounded by the match while still
 * carrying its own explicit, parameterized tenant predicate (raw SQL bypasses
 * the Prisma tenant extension entirely, so that predicate is not optional).
 */
export function buildPrincipalSearchQuery({
  organizationId,
  term,
  ageStatus,
  limit,
  offset,
}: PrincipalSearchQueryParams): Prisma.Sql {
  if (term === "") {
    return Prisma.sql`
      SELECT "id", "reference", "ageStatus", "createdAt"
      FROM "DataPrincipal"
      WHERE "organizationId" = ${organizationId}
        AND (${ageStatus}::"AgeStatus" IS NULL OR "ageStatus" = ${ageStatus}::"AgeStatus")
      ORDER BY "displayName" ASC, "id" ASC
      OFFSET ${offset}
      LIMIT ${limit}
    `;
  }
  return Prisma.sql`
    WITH "nameMatches" AS MATERIALIZED (
      SELECT "id"
      FROM "DataPrincipal"
      WHERE "organizationId" = ${organizationId}
        AND "displayName" ILIKE '%' || ${term} || '%'
    ), "fieldValueMatches" AS MATERIALIZED (
      SELECT DISTINCT "dataPrincipalId" AS "id"
      FROM "PrincipalDataField"
      WHERE "organizationId" = ${organizationId}
        AND "canonicalField" IN ('EMAIL'::"CanonicalField", 'PHONE'::"CanonicalField", 'CUSTOMER_ID'::"CanonicalField")
        AND "value" ILIKE '%' || ${term} || '%'
    ), "candidateIds" AS MATERIALIZED (
      SELECT "id" FROM "nameMatches"
      UNION
      SELECT "id" FROM "fieldValueMatches"
    )
    SELECT principal."id", principal."reference", principal."ageStatus", principal."createdAt"
    FROM "DataPrincipal" AS principal
    INNER JOIN "candidateIds" AS candidate ON candidate."id" = principal."id"
    WHERE principal."organizationId" = ${organizationId}
      AND (${ageStatus}::"AgeStatus" IS NULL OR principal."ageStatus" = ${ageStatus}::"AgeStatus")
    ORDER BY principal."displayName" ASC, principal."id" ASC
    OFFSET ${offset}
    LIMIT ${limit}
  `;
}
