import { Injectable } from "@nestjs/common";
import {
  CanonicalField,
  type Prisma,
  type SourceFieldMapping,
  type SourceRecord,
} from "@prisma/client";
import { normalizeDate } from "./normalizers/date";
import { normalizeEmail } from "./normalizers/email";
import { normalizeName } from "./normalizers/name";
import { normalizePhone } from "./normalizers/phone";

export type NormalizationMapping = Pick<
  SourceFieldMapping,
  | "sourceField"
  | "canonicalField"
  | "dataCategory"
  | "containsPersonalData"
  | "isVerifiedCustomerId"
>;

/**
 * The database's SourceRecord plus the organization country resolved by the
 * caller that fetched it. SourceRecord intentionally has no organization
 * relation, so Task 18 supplies this optional projection; India remains the
 * documented default while that country is unavailable.
 */
export type NormalizationSourceRecord = Pick<
  SourceRecord,
  "id" | "rawPayload"
> & {
  organizationCountry?: string | null;
};

/** The tenant extension supplies organizationId when this is persisted. */
export interface NormalizedRecordInput {
  sourceRecordId: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  emailRaw: string | null;
  emailNormalized: string | null;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  customerId: string | null;
  dateOfBirth: Date | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  nameKey: string | null;
  extras: Prisma.InputJsonValue;
}

type RawPayload = Record<string, unknown>;

function asPayload(value: unknown): RawPayload {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RawPayload)
    : {};
}

function rawString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function nullableString(value: unknown): string | null {
  const raw = rawString(value);
  return raw === null || raw.trim().length === 0 ? null : raw.trim();
}

function copyJson(value: unknown): Prisma.InputJsonValue {
  // SourceRecord.rawPayload is JSON. A round trip produces a detached value,
  // preventing callers from observing accidental mutation of their payload.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stableMappings(mappings: readonly NormalizationMapping[]) {
  return [...mappings].sort(
    (left, right) =>
      left.sourceField.localeCompare(right.sourceField) ||
      left.canonicalField.localeCompare(right.canonicalField),
  );
}

/**
 * Pure SourceRecord -> NormalizedRecord transformation. It deliberately does
 * not inject Prisma, read tenant context, or persist: a separate caller owns
 * the sourceRecordId-keyed upsert.
 */
@Injectable()
export class NormalizationService {
  normalize(
    sourceRecord: NormalizationSourceRecord,
    mappings: readonly NormalizationMapping[],
  ): NormalizedRecordInput {
    const payload = asPayload(sourceRecord.rawPayload);
    const extras: Record<string, Prisma.InputJsonValue> = {};
    const result: NormalizedRecordInput = {
      sourceRecordId: sourceRecord.id,
      fullName: null,
      firstName: null,
      lastName: null,
      emailRaw: null,
      emailNormalized: null,
      phoneRaw: null,
      phoneNormalized: null,
      customerId: null,
      dateOfBirth: null,
      addressLine1: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      nameKey: null,
      extras,
    };

    const mappedSourceFields = new Set<string>();
    const assignedCanonicalFields = new Set<CanonicalField>();

    for (const mapping of stableMappings(mappings)) {
      // Duplicate source-field mappings and collisions map by sorted source
      // field, then sorted canonical field. The winning mapping owns the raw
      // value; a losing canonical collision is preserved in extras below.
      if (mappedSourceFields.has(mapping.sourceField)) {
        continue;
      }
      mappedSourceFields.add(mapping.sourceField);

      if (
        !(mapping.sourceField in payload) ||
        mapping.canonicalField === "IGNORE"
      ) {
        continue;
      }

      const value = payload[mapping.sourceField];
      if (assignedCanonicalFields.has(mapping.canonicalField)) {
        extras[mapping.sourceField] = copyJson(value);
        continue;
      }
      assignedCanonicalFields.add(mapping.canonicalField);

      switch (mapping.canonicalField) {
        case "FULL_NAME": {
          const name = normalizeName(value);
          result.fullName = name.display || null;
          result.nameKey = name.nameKey || null;
          break;
        }
        case "FIRST_NAME":
          result.firstName = normalizeName(value).display || null;
          break;
        case "LAST_NAME":
          result.lastName = normalizeName(value).display || null;
          break;
        case "EMAIL":
          result.emailRaw = rawString(value);
          result.emailNormalized = normalizeEmail(value);
          break;
        case "PHONE":
          result.phoneRaw = rawString(value);
          result.phoneNormalized = normalizePhone(
            value,
            sourceRecord.organizationCountry ?? "IN",
          );
          break;
        case "DATE_OF_BIRTH":
          result.dateOfBirth = normalizeDate(value);
          if (
            result.dateOfBirth === null &&
            value !== null &&
            value !== undefined
          ) {
            extras[mapping.sourceField] = copyJson(value);
          }
          break;
        case "ADDRESS_LINE1":
          result.addressLine1 = nullableString(value);
          break;
        case "CITY":
          result.city = nullableString(value);
          break;
        case "STATE":
          result.state = nullableString(value);
          break;
        case "POSTAL_CODE":
          result.postalCode = nullableString(value);
          break;
        case "COUNTRY":
          result.country = nullableString(value);
          break;
        case "CUSTOMER_ID":
          result.customerId = nullableString(value);
          break;
        case "GENDER":
        case "ADDRESS_LINE2":
        case "ACCOUNT_STATUS":
        case "LAST_ACTIVITY_AT":
        case "PURCHASE_TOTAL":
        case "EXTERNAL_ID":
          extras[mapping.sourceField] = copyJson(value);
          break;
      }
    }

    for (const [field, value] of Object.entries(payload)) {
      if (!mappedSourceFields.has(field)) {
        extras[field] = copyJson(value);
      }
    }

    if (!result.nameKey && (result.firstName || result.lastName)) {
      const name = normalizeName(
        [result.firstName, result.lastName].filter(Boolean).join(" "),
      );
      result.nameKey = name.nameKey || null;
    }

    return result;
  }
}
