import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { resolveProvenance } from "./field-provenance";

const PRINCIPAL_FIELD_SELECT = {
  id: true,
  canonicalField: true,
  value: true,
  dataCategory: true,
  sourceIds: true,
  isPrimary: true,
  conflict: true,
  updatedAt: true,
} satisfies Prisma.PrincipalDataFieldSelect;

export type ResolvedPrincipalField = Omit<
  Prisma.PrincipalDataFieldGetPayload<{
    select: typeof PRINCIPAL_FIELD_SELECT;
  }>,
  "sourceIds"
> & {
  sources: Array<{ id: string; name: string }>;
};

/**
 * Resolves the immutable assembled-field lineage into the response shape.
 * A field is deliberately omitted when even one listed source cannot be
 * resolved in this tenant. This is the read-side enforcement of the source
 * lineage rule: the service never emits an unattributable personal value.
 */
@Injectable()
export class LineageService {
  constructor(private readonly prisma: PrismaService) {}

  async getResolvedFields(
    dataPrincipalId: string,
  ): Promise<ResolvedPrincipalField[]> {
    const fields = await this.prisma.scoped.principalDataField.findMany({
      where: { dataPrincipalId },
      select: PRINCIPAL_FIELD_SELECT,
      orderBy: [
        { canonicalField: "asc" },
        { isPrimary: "desc" },
        { value: "asc" },
      ],
    });
    return this.resolveFields(fields);
  }

  async getLineage(dataPrincipalId: string) {
    const principal = await this.prisma.scoped.dataPrincipal.findFirst({
      where: { id: dataPrincipalId },
      select: { id: true, reference: true },
    });
    if (!principal) {
      throw new NotFoundException(
        `Data principal "${dataPrincipalId}" not found.`,
      );
    }
    const fields = await this.getResolvedFields(dataPrincipalId);
    // Values intentionally do not appear here. Detail/data endpoints have a
    // distinct masking policy; this endpoint is a source topology view.
    return {
      principal,
      fields: fields.map((field) => ({
        id: field.id,
        canonicalField: field.canonicalField,
        dataCategory: field.dataCategory,
        isPrimary: field.isPrimary,
        conflict: field.conflict,
        updatedAt: field.updatedAt,
        sources: field.sources,
      })),
    };
  }

  async resolveFields(
    fields: readonly Prisma.PrincipalDataFieldGetPayload<{
      select: typeof PRINCIPAL_FIELD_SELECT;
    }>[],
  ): Promise<ResolvedPrincipalField[]> {
    const sourceIds = [...new Set(fields.flatMap((field) => field.sourceIds))];
    if (sourceIds.length === 0) {
      return [];
    }
    const sources = await this.prisma.scoped.dataSource.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, name: true },
    });
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    // A sourceIds array is provenance evidence, not a best-effort hint.
    // Showing a value after dropping an unknown contributor would claim a
    // complete lineage we cannot prove -- `resolveProvenance` is the one
    // shared implementation of that fail-closed rule (see field-provenance.ts).
    return resolveProvenance(fields, sourceById);
  }
}
