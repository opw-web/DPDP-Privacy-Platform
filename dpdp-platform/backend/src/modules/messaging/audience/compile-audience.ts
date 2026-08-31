import { Prisma, AgeStatus, ConsentStatus, RequestStatus, ErasureState, CanonicalField } from "@prisma/client";
import { AudienceFilterError } from "./audience-filter.error";
import {
  AUDIENCE_FILTER_FIELDS,
  AUDIENCE_FILTER_OPERATORS,
  type AudienceFilter,
  type AudienceFilterField,
  type AudienceFilterOperator,
} from "./audience-filter.types";

/**
 * The audience DSL compiler -- DPDP_MVP2_COMPLIANCE_OPERATIONS.md §4.7,
 * lines 726-752. `compileAudience(filter)` turns the JSON filter DSL
 * (lines 728-745's fenced block IS the contract) into exactly ONE
 * `Prisma.DataPrincipalWhereInput`.
 *
 * PURE FUNCTION: no `PrismaService`, no NestJS import, no I/O, no
 * `organizationId` parameter (tenant scoping happens later, when the
 * caller runs this `where` through `prisma.scoped` -- see
 * `tenant.extension.ts`; this file never sees a raw, unscoped client and
 * must not need to). Unit-testable with a bare `compileAudience(filter)`
 * call, no app bootstrap.
 *
 * Every one of the eleven fields below maps onto a REAL Prisma relation
 * on `DataPrincipal` (Ruling 10 in progress.md added the missing
 * `@relation`s to all eight MVP 2 principal-owned models specifically so
 * this could be one pure function instead of the two-query-path fallback
 * spec line 752 calls "the defect that makes previews lie" -- see this
 * task's report for the full history).
 *
 * Two design choices worth recording here, not just in the report,
 * because a caller reading only this file's exported types needs to know
 * them to predict what a filter compiles to:
 *
 *  - `country`/`city` filter through `PrincipalDataField` (canonicalField
 *    COUNTRY/CITY), NOT `NormalizedRecord.country`/`.city`. The spec
 *    names neither table explicitly for these two fields. Every other
 *    "does this principal have/lack a known value" field in the DSL
 *    (`hasEmail`, `hasField`) already reads through `PrincipalDataField`
 *    -- it is this codebase's one deduplicated, conflict-flagged,
 *    per-principal record of "what we currently believe about her"
 *    (`PrincipalDataFieldWhereInput.canonicalField`/`.value`), the same
 *    store `principal-search-query.ts` searches and `MaskingService`
 *    masks for display. `NormalizedRecord` is raw, per-source-record,
 *    per-active-link data that has not been through conflict resolution
 *    -- reading `country`/`city` through it would let a stale or
 *    since-detached source record's city leak into audience targeting.
 *    Routing all four "known value" fields through the same table also
 *    keeps their `some`/`none` shape identical and identically testable.
 *
 *  - Every relation-array field (`consent`, `dataSource`,
 *    `breachAffected`, `requestStatus`, `hasField`, `erasureState`,
 *    `country`, `city`) compiles `eq`/`in` to a relation `some` and
 *    `neq`/`notIn` to a relation `none` -- e.g. `requestStatus notIn
 *    ["COMPLETED"]` means "exclude anyone who has ANY request currently
 *    in that status", not "include anyone who has a request NOT in that
 *    status" (which `some: { status: { notIn: [...] } }` would mean, and
 *    would wrongly admit a principal who has ONE non-matching request
 *    alongside a matching one). `none` is the DSL's actual exclusion
 *    semantics for a to-many relation.
 */

const MAX_DEPTH = 2;

// ─────────────── value validators ───────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AudienceFilterError(
      `Audience filter field "${label}" expects a non-empty string value, got ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function expectStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    throw new AudienceFilterError(
      `Audience filter field "${label}" expects a non-empty array of non-empty strings, got ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new AudienceFilterError(
      `Audience filter field "${label}" expects a boolean value, got ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function expectDate(value: unknown, label: string): Date {
  if (typeof value !== "string") {
    throw new AudienceFilterError(
      `Audience filter field "${label}" expects an ISO-8601 date string value, got ${JSON.stringify(value)}.`,
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AudienceFilterError(
      `Audience filter field "${label}" value "${value}" is not a valid date.`,
    );
  }
  return parsed;
}

function expectEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new AudienceFilterError(
      `Audience filter field "${label}" value ${JSON.stringify(value)} is not one of: ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}

function expectEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AudienceFilterError(
      `Audience filter field "${label}" expects a non-empty array value, got ${JSON.stringify(value)}.`,
    );
  }
  return value.map((entry) => expectEnumValue(entry, allowed, label));
}

function unsupportedOperator(field: string, operator: string): never {
  throw new AudienceFilterError(
    `Operator "${operator}" is not supported for audience filter field "${field}".`,
  );
}

// ─────────────── per-field compilers ───────────────

function compileConsent(
  operator: AudienceFilterOperator,
  value: unknown,
  purposeId: unknown,
): Prisma.DataPrincipalWhereInput {
  if (typeof purposeId !== "string" || purposeId.length === 0) {
    throw new AudienceFilterError(
      'A "consent" audience filter rule requires a non-empty "purposeId".',
    );
  }
  const statuses = Object.values(ConsentStatus);
  switch (operator) {
    case "eq": {
      const status = expectEnumValue(value, statuses, "consent");
      return { consentRecords: { some: { purposeId, status } } };
    }
    case "neq": {
      const status = expectEnumValue(value, statuses, "consent");
      return { consentRecords: { none: { purposeId, status } } };
    }
    case "in": {
      const values = expectEnumArray(value, statuses, "consent");
      return { consentRecords: { some: { purposeId, status: { in: values } } } };
    }
    case "notIn": {
      const values = expectEnumArray(value, statuses, "consent");
      return { consentRecords: { none: { purposeId, status: { in: values } } } };
    }
    default:
      return unsupportedOperator("consent", operator);
  }
}

function compileHasEmail(
  operator: AudienceFilterOperator,
  value: unknown,
): Prisma.DataPrincipalWhereInput {
  const flag = expectBoolean(value, "hasEmail");
  let effective: boolean;
  if (operator === "eq") {
    effective = flag;
  } else if (operator === "neq") {
    effective = !flag;
  } else {
    return unsupportedOperator("hasEmail", operator);
  }
  return effective
    ? { fields: { some: { canonicalField: "EMAIL" } } }
    : { fields: { none: { canonicalField: "EMAIL" } } };
}

/** Only ACTIVE identity links count -- a DETACHED link is no longer this
 * principal's data, per `linking.service.ts`'s own convention. */
function dataSourceMatcher(
  dataSourceId: string | { in: string[] },
): Prisma.IdentityLinkWhereInput {
  return {
    status: "ACTIVE",
    normalizedRecord: { sourceRecord: { dataSourceId } },
  };
}

function compileDataSource(
  operator: AudienceFilterOperator,
  value: unknown,
): Prisma.DataPrincipalWhereInput {
  switch (operator) {
    case "eq": {
      const id = expectString(value, "dataSource");
      return { links: { some: dataSourceMatcher(id) } };
    }
    case "neq": {
      const id = expectString(value, "dataSource");
      return { links: { none: dataSourceMatcher(id) } };
    }
    case "in": {
      const ids = expectStringArray(value, "dataSource");
      return { links: { some: dataSourceMatcher({ in: ids }) } };
    }
    case "notIn": {
      const ids = expectStringArray(value, "dataSource");
      return { links: { none: dataSourceMatcher({ in: ids }) } };
    }
    default:
      return unsupportedOperator("dataSource", operator);
  }
}

function compileBreachAffected(
  operator: AudienceFilterOperator,
  value: unknown,
): Prisma.DataPrincipalWhereInput {
  switch (operator) {
    case "eq": {
      const breachId = expectString(value, "breachAffected");
      return { breachAffectations: { some: { breachId } } };
    }
    case "neq": {
      const breachId = expectString(value, "breachAffected");
      return { breachAffectations: { none: { breachId } } };
    }
    case "in": {
      const breachIds = expectStringArray(value, "breachAffected");
      return { breachAffectations: { some: { breachId: { in: breachIds } } } };
    }
    case "notIn": {
      const breachIds = expectStringArray(value, "breachAffected");
      return { breachAffectations: { none: { breachId: { in: breachIds } } } };
    }
    default:
      return unsupportedOperator("breachAffected", operator);
  }
}

function compileRequestStatus(
  operator: AudienceFilterOperator,
  value: unknown,
): Prisma.DataPrincipalWhereInput {
  const statuses = Object.values(RequestStatus);
  switch (operator) {
    case "eq": {
      const status = expectEnumValue(value, statuses, "requestStatus");
      return { requests: { some: { status } } };
    }
    case "neq": {
      const status = expectEnumValue(value, statuses, "requestStatus");
      return { requests: { none: { status } } };
    }
    case "in": {
      const values = expectEnumArray(value, statuses, "requestStatus");
      return { requests: { some: { status: { in: values } } } };
    }
    case "notIn": {
      const values = expectEnumArray(value, statuses, "requestStatus");
      return { requests: { none: { status: { in: values } } } };
    }
    default:
      return unsupportedOperator("requestStatus", operator);
  }
}

function compileAgeStatus(
  operator: AudienceFilterOperator,
  value: unknown,
): Prisma.DataPrincipalWhereInput {
  const statuses = Object.values(AgeStatus);
  switch (operator) {
    case "eq":
      return { ageStatus: expectEnumValue(value, statuses, "ageStatus") };
    case "neq":
      return { ageStatus: { not: expectEnumValue(value, statuses, "ageStatus") } };
    case "in":
      return { ageStatus: { in: expectEnumArray(value, statuses, "ageStatus") } };
    case "notIn":
      return { ageStatus: { notIn: expectEnumArray(value, statuses, "ageStatus") } };
    default:
      return unsupportedOperator("ageStatus", operator);
  }
}

/** Shared shape for `country`/`city`: both read the deduplicated,
 * conflict-resolved `PrincipalDataField` store, keyed by canonical field. */
function compileCanonicalFieldStringValue(
  field: "country" | "city",
  canonicalField: Extract<CanonicalField, "COUNTRY" | "CITY">,
  operator: AudienceFilterOperator,
  value: unknown,
): Prisma.DataPrincipalWhereInput {
  switch (operator) {
    case "eq": {
      const stringValue = expectString(value, field);
      return { fields: { some: { canonicalField, value: stringValue } } };
    }
    case "neq": {
      const stringValue = expectString(value, field);
      return { fields: { none: { canonicalField, value: stringValue } } };
    }
    case "in": {
      const values = expectStringArray(value, field);
      return { fields: { some: { canonicalField, value: { in: values } } } };
    }
    case "notIn": {
      const values = expectStringArray(value, field);
      return { fields: { none: { canonicalField, value: { in: values } } } };
    }
    default:
      return unsupportedOperator(field, operator);
  }
}

function compileLastContactAt(
  operator: AudienceFilterOperator,
  value: unknown,
): Prisma.DataPrincipalWhereInput {
  switch (operator) {
    case "before":
      return { lastPrincipalContactAt: { lt: expectDate(value, "lastContactAt") } };
    case "after":
      return { lastPrincipalContactAt: { gt: expectDate(value, "lastContactAt") } };
    default:
      return unsupportedOperator("lastContactAt", operator);
  }
}

function compileHasField(
  operator: AudienceFilterOperator,
  value: unknown,
): Prisma.DataPrincipalWhereInput {
  const fields = Object.values(CanonicalField);
  switch (operator) {
    case "eq":
      return { fields: { some: { canonicalField: expectEnumValue(value, fields, "hasField") } } };
    case "neq":
      return { fields: { none: { canonicalField: expectEnumValue(value, fields, "hasField") } } };
    case "in":
      return {
        fields: { some: { canonicalField: { in: expectEnumArray(value, fields, "hasField") } } },
      };
    case "notIn":
      return {
        fields: { none: { canonicalField: { in: expectEnumArray(value, fields, "hasField") } } },
      };
    default:
      return unsupportedOperator("hasField", operator);
  }
}

function compileErasureState(
  operator: AudienceFilterOperator,
  value: unknown,
): Prisma.DataPrincipalWhereInput {
  const states = Object.values(ErasureState);
  switch (operator) {
    case "eq":
      return { erasureTasks: { some: { state: expectEnumValue(value, states, "erasureState") } } };
    case "neq":
      return { erasureTasks: { none: { state: expectEnumValue(value, states, "erasureState") } } };
    case "in":
      return {
        erasureTasks: { some: { state: { in: expectEnumArray(value, states, "erasureState") } } },
      };
    case "notIn":
      return {
        erasureTasks: { none: { state: { in: expectEnumArray(value, states, "erasureState") } } },
      };
    default:
      return unsupportedOperator("erasureState", operator);
  }
}

// ─────────────── rule/group dispatch ───────────────

function compileRule(node: Record<string, unknown>): Prisma.DataPrincipalWhereInput {
  const { field, operator, value, purposeId } = node;
  if (typeof field !== "string") {
    throw new AudienceFilterError('Each audience filter rule must have a string "field".');
  }
  if (!(AUDIENCE_FILTER_FIELDS as readonly string[]).includes(field)) {
    throw new AudienceFilterError(
      `Unknown audience filter field "${field}". Allowed fields: ${AUDIENCE_FILTER_FIELDS.join(", ")}.`,
    );
  }
  if (typeof operator !== "string" || !(AUDIENCE_FILTER_OPERATORS as readonly string[]).includes(operator)) {
    throw new AudienceFilterError(
      `Unknown audience filter operator ${JSON.stringify(operator)} for field "${field}". ` +
        `Allowed operators: ${AUDIENCE_FILTER_OPERATORS.join(", ")}.`,
    );
  }
  const typedOperator = operator as AudienceFilterOperator;
  switch (field as AudienceFilterField) {
    case "consent":
      return compileConsent(typedOperator, value, purposeId);
    case "hasEmail":
      return compileHasEmail(typedOperator, value);
    case "dataSource":
      return compileDataSource(typedOperator, value);
    case "breachAffected":
      return compileBreachAffected(typedOperator, value);
    case "requestStatus":
      return compileRequestStatus(typedOperator, value);
    case "ageStatus":
      return compileAgeStatus(typedOperator, value);
    case "country":
      return compileCanonicalFieldStringValue("country", "COUNTRY", typedOperator, value);
    case "city":
      return compileCanonicalFieldStringValue("city", "CITY", typedOperator, value);
    case "lastContactAt":
      return compileLastContactAt(typedOperator, value);
    case "hasField":
      return compileHasField(typedOperator, value);
    case "erasureState":
      return compileErasureState(typedOperator, value);
  }
}

function compileGroup(node: unknown, depth: number): Prisma.DataPrincipalWhereInput {
  if (depth > MAX_DEPTH) {
    throw new AudienceFilterError(
      `Audience filter nesting exceeds the maximum depth of ${MAX_DEPTH}.`,
    );
  }
  if (!isPlainObject(node)) {
    throw new AudienceFilterError(
      'An audience filter group must be an object with "op" and "rules".',
    );
  }
  const { op, rules } = node;
  if (op !== "AND" && op !== "OR") {
    throw new AudienceFilterError(
      `Unknown audience filter group operator ${JSON.stringify(op)}. Expected "AND" or "OR".`,
    );
  }
  if (!Array.isArray(rules)) {
    throw new AudienceFilterError('An audience filter group\'s "rules" must be an array.');
  }
  const compiled = rules.map((entry) => compileNode(entry, depth));
  return op === "AND" ? { AND: compiled } : { OR: compiled };
}

function compileNode(node: unknown, depth: number): Prisma.DataPrincipalWhereInput {
  if (!isPlainObject(node)) {
    throw new AudienceFilterError("Each audience filter entry must be an object.");
  }
  if (Array.isArray(node["rules"])) {
    // A nested group -- one level deeper than its parent.
    return compileGroup(node, depth + 1);
  }
  if (typeof node["field"] === "string") {
    return compileRule(node);
  }
  throw new AudienceFilterError(
    'Each audience filter entry must be a group ({ "op", "rules" }) or a rule ({ "field", "operator", "value" }).',
  );
}

/**
 * Compiles the audience DSL (§4.7) into one `Prisma.DataPrincipalWhereInput`.
 * The root of `filter` is depth 1; a nested group is depth 2; a group
 * nested inside THAT is depth 3 and throws `AudienceFilterError`.
 *
 * Throws `AudienceFilterError` -- never returns a partial/best-effort
 * result -- for an unknown field, an unknown operator, a malformed value,
 * a `consent` rule missing `purposeId`, or nesting beyond depth 2. The
 * caller (`AudienceService`/`AudienceController`) maps that to a 400.
 */
export function compileAudience(filter: AudienceFilter): Prisma.DataPrincipalWhereInput {
  return compileGroup(filter, 1);
}
