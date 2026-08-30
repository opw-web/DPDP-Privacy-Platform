import { Injectable, NotFoundException } from "@nestjs/common";
import type { CanonicalField, DataCategory } from "@prisma/client";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";

type AssemblyMapping = {
  dataSourceId: string;
  sourceField: string;
  canonicalField: CanonicalField;
  dataCategory: DataCategory;
};

type AssemblyRecord = {
  id: string;
  sourceRecordId: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  customerId: string | null;
  dateOfBirth: Date | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  extras: unknown;
};

type SourceRecordContext = {
  id: string;
  dataSourceId: string;
  lastSeenAt: Date;
};

type Contribution = {
  canonicalField: CanonicalField;
  value: string;
  dataCategory: DataCategory;
  dataSourceId: string;
  lastSeenAt: Date;
  normalizedRecordId: string;
  sourceRecordId: string;
};

export type AssembledField = {
  canonicalField: CanonicalField;
  value: string;
  dataCategory: DataCategory;
  sourceIds: string[];
  isPrimary: boolean;
  conflict: boolean;
};

const SCALAR_COLUMNS: ReadonlyArray<
  readonly [CanonicalField, keyof AssemblyRecord]
> = [
  ["FULL_NAME", "fullName"],
  ["FIRST_NAME", "firstName"],
  ["LAST_NAME", "lastName"],
  ["EMAIL", "emailNormalized"],
  ["PHONE", "phoneNormalized"],
  ["DATE_OF_BIRTH", "dateOfBirth"],
  ["ADDRESS_LINE1", "addressLine1"],
  ["CITY", "city"],
  ["STATE", "state"],
  ["POSTAL_CODE", "postalCode"],
  ["COUNTRY", "country"],
  ["CUSTOMER_ID", "customerId"],
];

const EXTRA_FIELDS = new Set<CanonicalField>([
  "GENDER",
  "ADDRESS_LINE2",
  "ACCOUNT_STATUS",
  "LAST_ACTIVITY_AT",
  "PURCHASE_TOTAL",
  "EXTERNAL_ID",
]);

function compareNewest(left: Contribution, right: Contribution): number {
  return (
    right.lastSeenAt.getTime() - left.lastSeenAt.getTime() ||
    left.sourceRecordId.localeCompare(right.sourceRecordId) ||
    left.normalizedRecordId.localeCompare(right.normalizedRecordId)
  );
}

function jsonValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() === "" ? null : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
    );
  }
  return String(value);
}

function normalizedValue(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    // Normalized DOB is stored at UTC midnight; expose the canonical calendar
    // date, not a locale-dependent timestamp.
    return value.toISOString().slice(0, 10);
  }
  return value.trim() === "" ? null : value;
}

function extrasObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mappingsForSource(
  mappings: readonly AssemblyMapping[],
  dataSourceId: string,
): AssemblyMapping[] {
  return mappings
    .filter((mapping) => mapping.dataSourceId === dataSourceId)
    .sort(
      (left, right) =>
        left.sourceField.localeCompare(right.sourceField) ||
        left.canonicalField.localeCompare(right.canonicalField),
    );
}

/**
 * Deterministically turns linked records into the persisted profile view.
 * Newest means SourceRecord.lastSeenAt descending; ties use sourceRecordId,
 * then normalizedRecordId, ascending. This is deliberately shared for the
 * primary flag and a value's category selection.
 */
export function assembleFields(
  records: readonly AssemblyRecord[],
  sourceRecords: ReadonlyMap<string, SourceRecordContext>,
  mappings: readonly AssemblyMapping[],
): AssembledField[] {
  const contributions: Contribution[] = [];

  for (const record of records) {
    const source = sourceRecords.get(record.sourceRecordId);
    if (!source) {
      continue;
    }
    const sourceMappings = mappingsForSource(mappings, source.dataSourceId);
    const mappingByCanonical = new Map<CanonicalField, AssemblyMapping>();
    for (const mapping of sourceMappings) {
      if (
        mapping.canonicalField !== "IGNORE" &&
        !mappingByCanonical.has(mapping.canonicalField)
      ) {
        mappingByCanonical.set(mapping.canonicalField, mapping);
      }
    }

    const add = (
      mapping: AssemblyMapping | undefined,
      value: string | null,
    ): void => {
      if (!mapping || mapping.canonicalField === "IGNORE" || value === null) {
        return;
      }
      contributions.push({
        canonicalField: mapping.canonicalField,
        value,
        dataCategory: mapping.dataCategory,
        dataSourceId: source.dataSourceId,
        lastSeenAt: source.lastSeenAt,
        normalizedRecordId: record.id,
        sourceRecordId: source.id,
      });
    };

    for (const [canonicalField, column] of SCALAR_COLUMNS) {
      add(
        mappingByCanonical.get(canonicalField),
        normalizedValue(record[column] as string | Date | null),
      );
    }

    const extras = extrasObject(record.extras);
    for (const mapping of sourceMappings) {
      if (!EXTRA_FIELDS.has(mapping.canonicalField)) {
        continue;
      }
      add(mapping, jsonValue(extras[mapping.sourceField]));
    }
  }

  const byField = new Map<CanonicalField, Contribution[]>();
  for (const contribution of contributions) {
    const values = byField.get(contribution.canonicalField) ?? [];
    values.push(contribution);
    byField.set(contribution.canonicalField, values);
  }

  const rows: AssembledField[] = [];
  for (const [canonicalField, fieldContributions] of byField) {
    const primary = [...fieldContributions].sort(compareNewest)[0];
    if (!primary) {
      continue;
    }
    const byValue = new Map<string, Contribution[]>();
    for (const contribution of fieldContributions) {
      const values = byValue.get(contribution.value) ?? [];
      values.push(contribution);
      byValue.set(contribution.value, values);
    }
    const conflict = byValue.size > 1;
    for (const [value, valueContributions] of byValue) {
      const newestForValue = [...valueContributions].sort(compareNewest)[0];
      if (!newestForValue) {
        continue;
      }
      const sourceIds = [
        ...new Set(valueContributions.map((item) => item.dataSourceId)),
      ].sort();
      if (sourceIds.length === 0) {
        throw new Error(
          "Assembly attempted to persist a field without source lineage.",
        );
      }
      rows.push({
        canonicalField,
        value,
        dataCategory: newestForValue.dataCategory,
        sourceIds,
        isPrimary: value === primary.value,
        conflict,
      });
    }
  }

  return rows.sort(
    (left, right) =>
      left.canonicalField.localeCompare(right.canonicalField) ||
      left.value.localeCompare(right.value),
  );
}

function displayNameFrom(
  records: readonly AssemblyRecord[],
  sourceRecords: ReadonlyMap<string, SourceRecordContext>,
): string | null {
  const candidates: Array<{
    priority: number;
    value: string;
    contribution: Contribution;
  }> = [];
  for (const record of records) {
    const source = sourceRecords.get(record.sourceRecordId);
    if (!source) {
      continue;
    }
    const base = {
      canonicalField: "FULL_NAME" as CanonicalField,
      value: "",
      dataCategory: "IDENTITY" as DataCategory,
      dataSourceId: source.dataSourceId,
      lastSeenAt: source.lastSeenAt,
      normalizedRecordId: record.id,
      sourceRecordId: source.id,
    };
    const add = (priority: number, value: string | null): void => {
      const normalized = normalizedValue(value);
      if (normalized) {
        candidates.push({
          priority,
          value: normalized,
          contribution: { ...base, value: normalized },
        });
      }
    };
    // Profile labels favour a supplied full name, then a single-record
    // first+last composition, then either component. Newest resolves ties.
    add(0, record.fullName);
    add(
      1,
      [record.firstName, record.lastName].filter(Boolean).join(" ") || null,
    );
    add(2, record.firstName);
    add(3, record.lastName);
  }
  return (
    candidates.sort(
      (left, right) =>
        left.priority - right.priority ||
        compareNewest(left.contribution, right.contribution),
    )[0]?.value ?? null
  );
}

@Injectable()
export class AssemblyService {
  async rebuild(
    tx: ScopedTransactionClient,
    dataPrincipalId: string,
  ): Promise<void> {
    const principal = await tx.dataPrincipal.findFirst({
      where: { id: dataPrincipalId },
      select: { id: true, displayName: true },
    });
    if (!principal) {
      throw new NotFoundException(
        `Data principal "${dataPrincipalId}" not found.`,
      );
    }

    const links = await tx.identityLink.findMany({
      where: { dataPrincipalId, status: "ACTIVE" },
      select: { normalizedRecordId: true },
    });
    const normalizedRecordIds = links.map((link) => link.normalizedRecordId);
    const records =
      normalizedRecordIds.length === 0
        ? []
        : await tx.normalizedRecord.findMany({
            where: { id: { in: normalizedRecordIds } },
            select: {
              id: true,
              sourceRecordId: true,
              fullName: true,
              firstName: true,
              lastName: true,
              emailNormalized: true,
              phoneNormalized: true,
              customerId: true,
              dateOfBirth: true,
              addressLine1: true,
              city: true,
              state: true,
              postalCode: true,
              country: true,
              extras: true,
            },
          });
    const sourceRecordIds = records.map((record) => record.sourceRecordId);
    const sources =
      sourceRecordIds.length === 0
        ? []
        : await tx.sourceRecord.findMany({
            where: { id: { in: sourceRecordIds } },
            select: { id: true, dataSourceId: true, lastSeenAt: true },
          });
    const dataSourceIds = [
      ...new Set(sources.map((source) => source.dataSourceId)),
    ];
    const mappings =
      dataSourceIds.length === 0
        ? []
        : await tx.sourceFieldMapping.findMany({
            where: { dataSourceId: { in: dataSourceIds } },
            select: {
              dataSourceId: true,
              sourceField: true,
              canonicalField: true,
              dataCategory: true,
            },
          });
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const fields = assembleFields(records, sourceById, mappings);

    await tx.principalDataField.deleteMany({ where: { dataPrincipalId } });
    if (fields.length > 0) {
      await tx.principalDataField.createMany({
        data: fields.map((field) => ({ dataPrincipalId, ...field })),
      } as never);
    }

    const nextDisplayName = displayNameFrom(records, sourceById);
    if (nextDisplayName && nextDisplayName !== principal.displayName) {
      await tx.dataPrincipal.update({
        where: { id: dataPrincipalId },
        data: { displayName: nextDisplayName },
      });
    }
  }
}
