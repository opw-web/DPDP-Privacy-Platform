import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AgeStatus } from "@prisma/client";
import { AccessLogService } from "../../common/audit/access-log.service";
import { MaskingService } from "../../common/masking/masking.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { TenantContext } from "../../common/tenant/tenant-context";
import { PRINCIPALS_PAGE_SIZE } from "./dto/list-principals.dto";
import { pickDisplayName, resolveProvenance } from "./field-provenance";
import type { ResolvedPrincipalField } from "./lineage.service";
import { buildPrincipalSearchQuery } from "./principal-search-query";

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
  ageStatus: true,
  ageStatusSource: true,
  ageStatusSetAt: true,
  lastPrincipalContactAt: true,
  lastPrincipalContactSource: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DataPrincipalSelect;

/**
 * Principal profile/read service. Search (`buildPrincipalSearchQuery` in
 * `./principal-search-query.ts`) is deliberately raw SQL because each
 * independent `ILIKE '%query%'` branch can use its Task 2 pg_trgm GIN index;
 * an `OR`/`EXISTS` query makes PostgreSQL choose a broad plan that skips
 * those indexes, so the two branches are combined with a `UNION` over their
 * matched ids instead. Each branch's `WHERE` carries its own tenant
 * predicate (and, for the field-value branch, the canonical-field
 * restriction) alongside its `ILIKE`, so a candidate set is bounded by the
 * match, not by tenant size, while the tenant boundary -- which raw SQL
 * bypasses the Prisma extension for entirely -- stays explicit everywhere.
 * All input is parameterized and the organization comes only from
 * TenantContext.
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
    const rows = await this.prisma.$queryRaw<SearchRow[]>(
      buildPrincipalSearchQuery({
        organizationId,
        term,
        ageStatus: query.ageStatus ?? null,
        limit: PRINCIPALS_PAGE_SIZE,
        offset,
      }),
    );

    // The top-level list name is itself personal data. It must be derived
    // from an attributable FULL_NAME assembled field, never copied from
    // DataPrincipal.displayName (which deliberately stores no source IDs).
    // Provenance is resolved BEFORE the tie-break (via `resolveProvenance`
    // then `pickDisplayName`, both shared with `loadProfile`) so list and
    // detail cannot disagree about which name wins when a principal carries
    // more than one primary FULL_NAME field -- see fix round 3, Important 6.
    const fieldRows = rows.length
      ? await this.prisma.scoped.principalDataField.findMany({
          where: {
            dataPrincipalId: { in: rows.map((row) => row.id) },
            canonicalField: "FULL_NAME",
            isPrimary: true,
          },
          select: {
            dataPrincipalId: true,
            value: true,
            sourceIds: true,
          },
        })
      : [];
    const allSourceIds = [
      ...new Set(fieldRows.flatMap((field) => field.sourceIds)),
    ];
    const sources = allSourceIds.length
      ? await this.prisma.scoped.dataSource.findMany({
          where: { id: { in: allSourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const resolvedNameFields = resolveProvenance(fieldRows, sourceById);
    const nameFieldsByPrincipal = new Map<
      string,
      Array<(typeof resolvedNameFields)[number]>
    >();
    for (const field of resolvedNameFields) {
      const current = nameFieldsByPrincipal.get(field.dataPrincipalId) ?? [];
      current.push(field);
      nameFieldsByPrincipal.set(field.dataPrincipalId, current);
    }

    const items: PrincipalListItem[] = rows.map((row) => {
      const chosen = pickDisplayName(nameFieldsByPrincipal.get(row.id) ?? []);
      if (!chosen) {
        return { ...row, displayName: null, sources: [] };
      }
      return {
        ...row,
        displayName:
          this.maskingService.maskIfNeeded(
            permissions,
            "FULL_NAME",
            chosen.value,
          ) ?? null,
        sources: chosen.sources,
      };
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
    // resolvedFields is already provenance-filtered (resolveFieldsInTransaction
    // drops any field with an unresolved source), so filtering to FULL_NAME
    // candidates here and handing them to the shared tie-break preserves the
    // "resolve, then pick" order list() now also follows.
    const displayNameField = pickDisplayName(
      resolvedFields.filter(
        (field) => field.canonicalField === "FULL_NAME" && field.isPrimary,
      ),
    );
    return {
      ...principal,
      // DataPrincipal.displayName has no source IDs, so it must never be
      // serialized from detail. The presented name is only a resolved,
      // primary FULL_NAME value and carries its own complete provenance.
      displayName: displayNameField
        ? this.maskingService.maskIfNeeded(
            permissions,
            "FULL_NAME",
            displayNameField.value,
          )
        : null,
      displayNameSources: displayNameField?.sources ?? [],
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
    return resolveProvenance(fields, sourceById);
  }
}
