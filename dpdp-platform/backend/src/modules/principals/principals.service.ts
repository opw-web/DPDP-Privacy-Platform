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
  displayName: string;
  ageStatus: AgeStatus;
  createdAt: Date;
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

const DISPLAY_NAME_FIELDS: ReadonlySet<string> = new Set([
  "FULL_NAME",
  "FIRST_NAME",
  "LAST_NAME",
]);

/**
 * Principal profile/read service. Search is deliberately raw SQL because
 * `ILIKE '%query%'` is what lets Postgres use the two pg_trgm GIN indexes
 * created in the Task 2 migration; all input is parameterized, and the
 * organization comes only from TenantContext, never a caller parameter.
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
    const rows = await this.prisma.$queryRaw<SearchRow[]>`
      SELECT "id", "reference", "displayName", "ageStatus", "createdAt"
      FROM "DataPrincipal"
      WHERE "organizationId" = ${organizationId}
        AND (${query.ageStatus ?? null}::"AgeStatus" IS NULL OR "ageStatus" = ${query.ageStatus ?? null}::"AgeStatus")
        AND (
          ${term} = ''
          OR "displayName" ILIKE '%' || ${term} || '%'
          OR EXISTS (
            SELECT 1
            FROM "PrincipalDataField" AS field
            WHERE field."organizationId" = ${organizationId}
              AND field."dataPrincipalId" = "DataPrincipal"."id"
              AND field."canonicalField" IN ('EMAIL'::"CanonicalField", 'PHONE'::"CanonicalField", 'CUSTOMER_ID'::"CanonicalField")
              AND field."value" ILIKE '%' || ${term} || '%'
          )
        )
      ORDER BY "displayName" ASC, "id" ASC
      OFFSET ${offset}
      LIMIT ${PRINCIPALS_PAGE_SIZE}
    `;

    // Do not emit a displayName with no attributable source. The assembled
    // profile is the durable source of this association, rather than trying
    // to re-infer it from a display-name string at response time.
    const fieldRows = rows.length
      ? await this.prisma.scoped.principalDataField.findMany({
          where: { dataPrincipalId: { in: rows.map((row) => row.id) } },
          select: {
            dataPrincipalId: true,
            canonicalField: true,
            sourceIds: true,
          },
        })
      : [];
    const sourceIdsByPrincipal = new Map<string, Set<string>>();
    for (const field of fieldRows) {
      // List renders DataPrincipal.displayName, so its lineage comes only
      // from assembled name fields. An unresolved source on an unrelated
      // address/email must suppress that value on detail, not make the
      // entire, independently-attributed profile disappear from search.
      if (!DISPLAY_NAME_FIELDS.has(field.canonicalField)) {
        continue;
      }
      const sourceIds =
        sourceIdsByPrincipal.get(field.dataPrincipalId) ?? new Set<string>();
      field.sourceIds.forEach((sourceId) => sourceIds.add(sourceId));
      sourceIdsByPrincipal.set(field.dataPrincipalId, sourceIds);
    }
    const allSourceIds = [
      ...new Set(
        [...sourceIdsByPrincipal.values()].flatMap((sourceIds) => [
          ...sourceIds,
        ]),
      ),
    ];
    const sources = allSourceIds.length
      ? await this.prisma.scoped.dataSource.findMany({
          where: { id: { in: allSourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const sourceById = new Map(sources.map((source) => [source.id, source]));

    const items = rows.flatMap((row) => {
      const sourceIds = [
        ...(sourceIdsByPrincipal.get(row.id) ?? new Set<string>()),
      ];
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
        return [];
      }
      return [
        {
          ...row,
          displayName: this.maskingService.maskIfNeeded(
            permissions,
            "FULL_NAME",
            row.displayName,
          ) as string,
          sources: resolvedSources,
        },
      ];
    });

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
