import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import {
  PURPOSE_PUBLIC_SELECT,
  toPublicPurpose,
} from "../purposes/purposes.service";
import type { PublicPurpose } from "../purposes/purposes.service";
import { AttachPurposesDto } from "./dto/attach-purposes.dto";

/**
 * Attaching purposes to a data source: `PUT /api/data-sources/:id/purposes`
 * replaces the ENTIRE `DataSourcePurpose` set for that source (task
 * brief). An empty `purposeIds` array is a valid, meaningful request --
 * spec §4.3 / line 746: a source with no purpose attached is legal to
 * sync, and "Purpose not configured" is shown everywhere it appears
 * rather than a guessed purpose. This service never invents one.
 */
@Injectable()
export class SourcePurposesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async replace(
    dataSourceId: string,
    dto: AttachPurposesDto,
  ): Promise<PublicPurpose[]> {
    const dataSource = await this.prisma.scoped.dataSource.findFirst({
      where: { id: dataSourceId },
      select: { id: true },
    });
    if (!dataSource) {
      throw new NotFoundException(`Data source "${dataSourceId}" not found.`);
    }

    // Validated BEFORE the destructive `deleteMany` below -- same
    // ordering fix as `RolesService.replacePermissions()` (Task 5
    // review, Minor): an unknown/foreign-org purposeId should be a clean
    // 400 the caller can act on, not a P2025 surfacing after the
    // previous set has already been wiped inside a transaction that then
    // has to roll back anyway. The lookup goes through
    // `prisma.scoped.processingPurpose`, so a purposeId belonging to
    // another organization is indistinguishable from an unknown one --
    // both come back "not found", never a cross-tenant leak.
    if (dto.purposeIds.length > 0) {
      const known = await this.prisma.scoped.processingPurpose.findMany({
        where: { id: { in: dto.purposeIds } },
        select: { id: true },
      });
      const knownIds = new Set(known.map((p) => p.id));
      const unknown = dto.purposeIds.filter((id) => !knownIds.has(id));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Unknown processing purpose id(s): ${unknown.join(", ")}`,
        );
      }
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      await tx.dataSourcePurpose.deleteMany({ where: { dataSourceId } });

      // Looped single `create()` calls, not `createMany` -- per
      // `tenant.extension.ts`'s documented caveat (and the identical
      // choice in `RolesService.replacePermissions()` for
      // `RolePermission`, the codebase's other indirect join-table
      // model): only the single-row `create` override is
      // transaction-aware for an indirect model's foreign-key ownership
      // check, so this is the only safe way to write `DataSourcePurpose`
      // rows inside a transaction.
      for (const purposeId of dto.purposeIds) {
        await tx.dataSourcePurpose.create({
          data: { dataSourceId, purposeId },
        });
      }

      // Task 13 review note, flagged rather than worked around: the
      // fixed `AuditAction` union (audit-actions.ts, transcribed verbatim
      // from spec lines 880-891) has no action specifically for "a data
      // source's attached-purpose set changed". `DATA_SOURCE_UPDATED` --
      // the closest fit, since this genuinely is a configuration change
      // on the named `DataSource` -- is used here instead of inventing
      // one, exactly the same call `RolesService.replacePermissions()`
      // made for `RolePermission` with `ORG_SETTINGS_UPDATED`. Flagged
      // for the spec owner in the task report.
      await this.auditService.record(tx, {
        action: "DATA_SOURCE_UPDATED",
        resourceType: "DataSource",
        resourceId: dataSourceId,
        metadata: { purposeIds: dto.purposeIds },
      });

      const purposes = await tx.processingPurpose.findMany({
        where: { id: { in: dto.purposeIds } },
        select: PURPOSE_PUBLIC_SELECT,
      });
      const byId = new Map(purposes.map((p) => [p.id, p]));
      // Returned in the caller's submitted order, via the SAME
      // `toPublicPurpose` derivation every other `PublicPurpose` call
      // site uses -- not a second, independently-maintained copy.
      return dto.purposeIds.map((id) => {
        const row = byId.get(id);
        // Cannot be undefined: every id here was already confirmed to
        // exist (and belong to this org) by the pre-check above, inside
        // the same transaction that has held them unchanged since.
        return toPublicPurpose(row!);
      });
    });
  }
}
