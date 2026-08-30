import { Injectable, NotFoundException } from "@nestjs/common";
import type { AgeStatus } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";

type DobCandidate = {
  dateOfBirth: Date;
  lastSeenAt: Date;
  sourceRecordId: string;
  normalizedRecordId: string;
};

function compareNewest(left: DobCandidate, right: DobCandidate): number {
  return (
    right.lastSeenAt.getTime() - left.lastSeenAt.getTime() ||
    left.sourceRecordId.localeCompare(right.sourceRecordId) ||
    left.normalizedRecordId.localeCompare(right.normalizedRecordId)
  );
}

export function ageStatusFor(dateOfBirth: Date, now: Date): "CHILD" | "ADULT" {
  const adulthood = new Date(
    Date.UTC(
      dateOfBirth.getUTCFullYear() + 18,
      dateOfBirth.getUTCMonth(),
      dateOfBirth.getUTCDate(),
    ),
  );
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // 18 is the statute's definition of a child, not a configurable deadline.
  return today < adulthood ? "CHILD" : "ADULT";
}

/** Derives CH-01 age state exclusively from a mapped date of birth. */
@Injectable()
export class AgeService {
  constructor(private readonly auditService: AuditService) {}

  async derive(
    tx: ScopedTransactionClient,
    dataPrincipalId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const principal = await tx.dataPrincipal.findFirst({
      where: { id: dataPrincipalId },
      select: {
        id: true,
        ageStatus: true,
        ageStatusSource: true,
        ageStatusSetAt: true,
      },
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
            select: { id: true, sourceRecordId: true, dateOfBirth: true },
          });
    const sourceRecordIds = records.map((record) => record.sourceRecordId);
    const sources =
      sourceRecordIds.length === 0
        ? []
        : await tx.sourceRecord.findMany({
            where: { id: { in: sourceRecordIds } },
            select: { id: true, dataSourceId: true, lastSeenAt: true },
          });
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const dataSourceIds = [
      ...new Set(sources.map((source) => source.dataSourceId)),
    ];
    const dobMappings =
      dataSourceIds.length === 0
        ? []
        : await tx.sourceFieldMapping.findMany({
            where: {
              dataSourceId: { in: dataSourceIds },
              canonicalField: "DATE_OF_BIRTH",
            },
            select: { dataSourceId: true },
          });
    const mappedDataSourceIds = new Set(
      dobMappings.map((mapping) => mapping.dataSourceId),
    );
    const candidates: DobCandidate[] = records.flatMap((record) => {
      const source = sourceById.get(record.sourceRecordId);
      return record.dateOfBirth &&
        source &&
        mappedDataSourceIds.has(source.dataSourceId)
        ? [
            {
              dateOfBirth: record.dateOfBirth,
              lastSeenAt: source.lastSeenAt,
              sourceRecordId: source.id,
              normalizedRecordId: record.id,
            },
          ]
        : [];
    });
    const selected = [...candidates].sort(compareNewest)[0];
    const nextStatus: AgeStatus = selected
      ? ageStatusFor(selected.dateOfBirth, now)
      : "UNKNOWN";
    const nextSource = selected ? "DOB_DERIVED" : null;
    const stateChanged =
      principal.ageStatus !== nextStatus ||
      principal.ageStatusSource !== nextSource ||
      (selected !== undefined && principal.ageStatusSetAt === null) ||
      (selected === undefined && principal.ageStatusSetAt !== null);
    if (!stateChanged) {
      return;
    }

    const ageStatusSetAt = selected ? now : null;
    await tx.dataPrincipal.update({
      where: { id: dataPrincipalId },
      data: {
        ageStatus: nextStatus,
        ageStatusSource: nextSource,
        ageStatusSetAt,
      },
    });
    await this.auditService.record(tx, {
      action: "AGE_STATUS_SET",
      resourceType: "DataPrincipal",
      resourceId: dataPrincipalId,
      subjectPrincipalId: dataPrincipalId,
      metadata: {
        ageStatus: nextStatus,
        derivation: selected ? "DATE_OF_BIRTH" : "NONE",
      },
    });
  }
}
