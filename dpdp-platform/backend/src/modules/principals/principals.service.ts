import { Injectable, NotFoundException } from "@nestjs/common";
import type { AgeStatus, Prisma } from "@prisma/client";
import { AccessLogService } from "../../common/audit/access-log.service";
import { MaskingService } from "../../common/masking/masking.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { TenantContext } from "../../common/tenant/tenant-context";
import { PRINCIPALS_PAGE_SIZE } from "./dto/list-principals.dto";
import type { ResolvedPrincipalField } from "./lineage.service";

type SearchRow = {
  id: string;
  reference: string;
  ageStatus: AgeStatus;
  createdAt: Date;
};

type PrincipalListItem = SearchRow & {
  displayName: string | null;
  sources: Array<{ id: string; name: string }>;
};

type PrincipalFieldRow = {
  id: string;
  canonicalField: Prisma.PrincipalDataFieldGetPayload<{
    select: { canonicalField: true };
  }>["canonicalField"];
  value: string;
  dataCategory: Prisma.PrincipalDataFieldGetPayload<{
    select: { dataCategory: true };
  }>["dataCategory"];
  sourceIds: string[];
  isPrimary: boolean;
  conflict: boolean;
  updatedAt: Date;
};

const PRINCIPAL_DETAIL_SELECT = {
  id: true,
  reference: true,
  displayName: true,
  ageStatus: true,
  ageStatusSource: true,
  ageStatusSetAt: true,
  lastPrincipalContactAt: true,
  lastPrincipalContactSource: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DataPrincipalSelect;

/**
 * Principal profile/read service. Search is deliberately raw SQL because
 * each independent `ILIKE '%query%'` branch can use its Task 2 pg_trgm GIN
 * index. The candidate-ID UNION is intentional: an OR/EXISTS query makes
 * PostgreSQL choose a broad plan that can skip those indexes. All input is
 * parameterized and the organization comes only from TenantContext.
 */
@Injectable()
export class PrincipalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maskingService: MaskingService,
    private readonly accessLogService: AccessLogService,
  ) {}

  async list(
    query: { q?: string; ageStatus?: AgeStatus; page: number },
    permissions: ReadonlySet<string>,
  ) {
    const organizationId = TenantContext.get().organizationId;
    const term = query.q?.trim() ?? "";
    const offset = (query.page - 1) * PRINCIPALS_PAGE_SIZE;
    const rows =
      term === ""
        ? await this.prisma.$queryRaw<SearchRow[]>`
          SELECT "id", "reference", "ageStatus", "createdAt"
          FROM "DataPrincipal"
          WHERE "organizationId" = ${organizationId}
            AND (${query.ageStatus ?? null}::"AgeStatus" IS NULL OR "ageStatus" = ${query.ageStatus ?? null}::"AgeStatus")
          ORDER BY "displayName" ASC, "id" ASC
          OFFSET ${offset}
          LIMIT ${PRINCIPALS_PAGE_SIZE}
        `
        : await this.prisma.$queryRaw<SearchRow[]>`
          WITH "nameMatches" AS MATERIALIZED (
            SELECT "id"
            FROM "DataPrincipal"
            WHERE "displayName" ILIKE '%' || ${term} || '%'
          ), "fieldValueMatches" AS MATERIALIZED (
            SELECT "dataPrincipalId" AS "id"
            FROM "PrincipalDataField"
            WHERE "value" ILIKE '%' || ${term} || '%'
          ), "candidateIds" AS MATERIALIZED (
            (
              SELECT "id" FROM "nameMatches"
              INTERSECT
              SELECT "id" FROM "DataPrincipal" WHERE "organizationId" = ${organizationId}
            )
            UNION
            (
              SELECT "id" FROM "fieldValueMatches"
              INTERSECT
              SELECT "dataPrincipalId" AS "id"
              FROM "PrincipalDataField"
              WHERE "organizationId" = ${organizationId}
                AND "canonicalField" IN ('EMAIL'::"CanonicalField", 'PHONE'::"CanonicalField", 'CUSTOMER_ID'::"CanonicalField")
            )
          )
          SELECT principal."id", principal."reference", principal."ageStatus", principal."createdAt"
          FROM "DataPrincipal" AS principal
          INNER JOIN "candidateIds" AS candidate ON candidate."id" = principal."id"
          WHERE principal."organizationId" = ${organizationId}
            AND (${query.ageStatus ?? null}::"AgeStatus" IS NULL OR principal."ageStatus" = ${query.ageStatus ?? null}::"AgeStatus")
          ORDER BY principal."displayName" ASC, principal."id" ASC
          OFFSET ${offset}
          LIMIT ${PRINCIPALS_PAGE_SIZE}
        `;

    // The top-level list name is itself personal data. It must be derived
    // from an attributable FULL_NAME assembled field, never copied from
    // DataPrincipal.displayName (which deliberately stores no source IDs).
    const fieldRows = rows.length
      ? await this.prisma.scoped.principalDataField.findMany({
          where: { dataPrincipalId: { in: rows.map((row) => row.id) } },
          select: {
            dataPrincipalId: true,
            canonicalField: true,
            value: true,
            sourceIds: true,
            isPrimary: true,
          },
        })
      : [];
    const nameFieldByPrincipal = new Map<
      string,
      { value: string; sourceIds: string[] }
    >();
    for (const field of fieldRows) {
      if (field.canonicalField !== "FULL_NAME" || !field.isPrimary) {
        continue;
      }
      const current = nameFieldByPrincipal.get(field.dataPrincipalId);
      if (!current || field.value.localeCompare(current.value) < 0) {
        nameFieldByPrincipal.set(field.dataPrincipalId, {
          value: field.value,
          sourceIds: field.sourceIds,
        });
      }
    }
    const allSourceIds = [
      ...new Set(
        [...nameFieldByPrincipal.values()].flatMap((field) => field.sourceIds),
      ),
    ];
    const sources = allSourceIds.length
      ? await this.prisma.scoped.dataSource.findMany({
          where: { id: { in: allSourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const sourceById = new Map(sources.map((source) => [source.id, source]));

    const items: PrincipalListItem[] = rows.flatMap<PrincipalListItem>(
      (row) => {
        const nameField = nameFieldByPrincipal.get(row.id);
        if (!nameField) {
          return [{ ...row, displayName: null, sources: [] }];
        }
        const sourceIds = nameField.sourceIds;
        const resolvedSources = sourceIds
          .map((id) => sourceById.get(id))
          .filter(
            (source): source is { id: string; name: string } =>
              source !== undefined,
          )
          .sort(
            (left, right) =>
              left.name.localeCompare(right.name) ||
              left.id.localeCompare(right.id),
          );
        if (
          sourceIds.length === 0 ||
          resolvedSources.length !== sourceIds.length
        ) {
          return [{ ...row, displayName: null, sources: [] }];
        }
        return [
          {
            ...row,
            displayName: this.maskingService.maskIfNeeded(
              permissions,
              "FULL_NAME",
              nameField.value,
            ) as string,
            sources: resolvedSources,
          },
        ];
      },
    );

    return { items, page: query.page, pageSize: PRINCIPALS_PAGE_SIZE };
  }

  async getDetail(id: string, permissions: ReadonlySet<string>) {
    return this.prisma.scoped.$transaction(async (tx) => {
      const profile = await this.loadProfile(tx, id, permissions);
      await this.accessLogService.recordPersonalDataViewed(tx, {
        subjectPrincipalId: id,
        resourceType: "DataPrincipal",
        resourceId: id,
        context: { view: "detail" },
      });
      return profile;
    });
  }

  /** Reusable unmasked shape for Task 22's authenticated self-service API. */
  async getUnmaskedProfile(id: string) {
    return this.prisma.scoped.$transaction((tx) =>
      this.loadProfile(tx, id, new Set(["CAN_VIEW_ALL_PERSONAL_DATA"])),
    );
  }

  async getSourceRecords(id: string) {
    return this.prisma.scoped.$transaction(async (tx) => {
      const principal = await tx.dataPrincipal.findFirst({
        where: { id },
        select: { id: true, reference: true },
      });
      if (!principal) {
        throw new NotFoundException(`Data principal "${id}" not found.`);
      }
      const links = await tx.identityLink.findMany({
        where: { dataPrincipalId: id, status: "ACTIVE" },
        select: {
          normalizedRecordId: true,
          confidence: true,
          matchedOn: true,
          createdAt: true,
        },
      });
      const normalizedRecordIds = links.map((link) => link.normalizedRecordId);
      const normalizedRecords = normalizedRecordIds.length
        ? await tx.normalizedRecord.findMany({
            where: { id: { in: normalizedRecordIds } },
            select: { id: true, sourceRecordId: true },
          })
        : [];
      const linkByNormalizedId = new Map(
        links.map((link) => [link.normalizedRecordId, link]),
      );
      const sourceRecords = normalizedRecords.length
        ? await tx.sourceRecord.findMany({
            where: {
              id: {
                in: normalizedRecords.map((record) => record.sourceRecordId),
              },
            },
            select: {
              id: true,
              dataSourceId: true,
              sourceRecordKey: true,
              rawPayload: true,
              firstSeenAt: true,
              lastSeenAt: true,
            },
          })
        : [];
      const sourceIds = [
        ...new Set(sourceRecords.map((record) => record.dataSourceId)),
      ];
      const sources = sourceIds.length
        ? await tx.dataSource.findMany({
            where: { id: { in: sourceIds } },
            select: { id: true, name: true },
          })
        : [];
      const sourceById = new Map(sources.map((source) => [source.id, source]));
      const normalizedBySourceRecordId = new Map(
        normalizedRecords.map((record) => [record.sourceRecordId, record]),
      );
      const records = sourceRecords.flatMap((record) => {
        const source = sourceById.get(record.dataSourceId);
        const normalized = normalizedBySourceRecordId.get(record.id);
        if (!source || !normalized) {
          return [];
        }
        const link = linkByNormalizedId.get(normalized.id);
        if (!link) {
          return [];
        }
        return [{ ...record, source, normalizedRecordId: normalized.id, link }];
      });
      await this.accessLogService.recordPersonalDataViewed(tx, {
        subjectPrincipalId: id,
        resourceType: "DataPrincipal",
        resourceId: id,
        context: { view: "source-records" },
      });
      return { principal, records };
    });
  }

  private async loadProfile(
    tx: ScopedTransactionClient,
    id: string,
    permissions: ReadonlySet<string>,
  ) {
    const principal = await tx.dataPrincipal.findFirst({
      where: { id },
      select: PRINCIPAL_DETAIL_SELECT,
    });
    if (!principal) {
      throw new NotFoundException(`Data principal "${id}" not found.`);
    }
    const fields = await tx.principalDataField.findMany({
      where: { dataPrincipalId: id },
      select: {
        id: true,
        canonicalField: true,
        value: true,
        dataCategory: true,
        sourceIds: true,
        isPrimary: true,
        conflict: true,
        updatedAt: true,
      },
      orderBy: [
        { canonicalField: "asc" },
        { isPrimary: "desc" },
        { value: "asc" },
      ],
    });
    const resolvedFields = await this.resolveFieldsInTransaction(tx, fields);
    return {
      ...principal,
      displayName: this.maskingService.maskIfNeeded(
        permissions,
        "FULL_NAME",
        principal.displayName,
      ),
      fields: resolvedFields.map((field) => ({
        ...field,
        value: this.maskingService.maskIfNeeded(
          permissions,
          field.canonicalField,
          field.value,
        ),
      })),
    };
  }

  private async resolveFieldsInTransaction(
    tx: ScopedTransactionClient,
    fields: readonly PrincipalFieldRow[],
  ): Promise<ResolvedPrincipalField[]> {
    const sourceIds = [...new Set(fields.flatMap((field) => field.sourceIds))];
    if (sourceIds.length === 0) {
      return [];
    }
    const sources = await tx.dataSource.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, name: true },
    });
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    return fields.flatMap((field) => {
      const resolvedSources = field.sourceIds
        .map((sourceId) => sourceById.get(sourceId))
        .filter(
          (source): source is { id: string; name: string } =>
            source !== undefined,
        )
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name) ||
            left.id.localeCompare(right.id),
        );
      return resolvedSources.length === field.sourceIds.length &&
        resolvedSources.length > 0
        ? [{ ...field, sources: resolvedSources }]
        : [];
    });
  }
}
