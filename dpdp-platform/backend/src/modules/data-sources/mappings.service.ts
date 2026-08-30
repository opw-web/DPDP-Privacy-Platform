import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { DataSourcesService } from "./data-sources.service";
import { ReplaceMappingsDto } from "./dto/replace-mappings.dto";
import { computeMappingWarnings } from "./mapping-warnings";
import type { MappingWarning } from "./mapping-warnings";

// Re-exported for existing/external importers of these types from this
// file (task 13 review Important-2 moved the implementation to the
// shared `mapping-warnings.ts` -- `SourcePurposesService` needs the same
// computation -- but the types are kept importable from here too so
// nothing that already does `import type { MappingWarning } from
// "./mappings.service"` breaks).
export type {
  MappingWarning,
  MappingWarningType,
  MappingWarningPurposeSummary,
} from "./mapping-warnings";

/**
 * The ONLY shape of `SourceFieldMapping` this service (or the controller
 * behind it) ever returns. Same discipline as `DATA_SOURCE_PUBLIC_SELECT`
 * / `PURPOSE_PUBLIC_SELECT`. `organizationId` and `dataSourceId` are
 * omitted -- the caller already knows the data source id from the URL,
 * and `organizationId` is never surfaced to any client per the tenant
 * extension's own contract.
 */
export const SOURCE_FIELD_MAPPING_PUBLIC_SELECT = {
  id: true,
  sourceField: true,
  canonicalField: true,
  dataCategory: true,
  containsPersonalData: true,
  isVerifiedCustomerId: true,
} satisfies Prisma.SourceFieldMappingSelect;

export type PublicSourceFieldMapping = Prisma.SourceFieldMappingGetPayload<{
  select: typeof SOURCE_FIELD_MAPPING_PUBLIC_SELECT;
}>;

export interface ReplaceMappingsResult {
  mappings: PublicSourceFieldMapping[];
  warnings: MappingWarning[];
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function duplicateSourceFieldMessage(dataSourceId: string): string {
  return (
    `The mapping set submitted for data source "${dataSourceId}" contains ` +
    "the same sourceField more than once -- each source field can have " +
    "at most one mapping."
  );
}

@Injectable()
export class MappingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly dataSourcesService: DataSourcesService,
  ) {}

  /**
   * The single authoritative enforcement point for the `isVerifiedCustomerId`
   * gate (task brief): at most one mapping per source may set it, and it
   * is only valid on a `CUSTOMER_ID` mapping. Checked here, against the
   * full incoming array, regardless of what any DTO decorator already
   * caught -- same convention as `PurposesService.validateBasis()` --
   * because a per-row decorator has no way to see the OTHER rows in the
   * array to enforce "at most one".
   */
  private validateVerifiedCustomerId(
    mappings: ReplaceMappingsDto["mappings"],
  ): void {
    const verified = mappings.filter((m) => m.isVerifiedCustomerId === true);
    if (verified.length > 1) {
      throw new BadRequestException(
        "At most one mapping per data source may set isVerifiedCustomerId " +
          `-- ${verified.length} were submitted (fields: ` +
          `${verified.map((m) => m.sourceField).join(", ")}).`,
      );
    }
    const misplaced = verified.find((m) => m.canonicalField !== "CUSTOMER_ID");
    if (misplaced) {
      throw new BadRequestException(
        `isVerifiedCustomerId is only valid on a CUSTOMER_ID mapping -- ` +
          `field "${misplaced.sourceField}" set it on a ` +
          `${misplaced.canonicalField} mapping.`,
      );
    }
  }

  /**
   * Full-set replacement in one transaction (task brief): the previous
   * `SourceFieldMapping` rows for this source are deleted and the
   * submitted set is inserted in their place. A mid-set failure -- most
   * concretely, a real `@@unique([dataSourceId, sourceField])` violation
   * when the submitted array itself repeats a `sourceField` -- rolls the
   * WHOLE transaction back, including the `deleteMany`, so the PREVIOUS
   * mapping set survives untouched. `SourceFieldMapping` is a DIRECT
   * tenant-scoped model (`TENANT_SCOPED_MODELS`, not the indirect-model
   * join-table case), so looping single `create()` calls here is not
   * required for `tenant.extension.ts`'s FK-verification reasons the way
   * it is for `DataSourcePurpose` below -- it is done anyway because each
   * row's `containsPersonalData` flag decides, per-row, whether
   * `rescrubFieldSample` must run inside this SAME transaction (Ruling 1).
   */
  async replace(
    dataSourceId: string,
    dto: ReplaceMappingsDto,
  ): Promise<ReplaceMappingsResult> {
    const dataSource = await this.prisma.scoped.dataSource.findFirst({
      where: { id: dataSourceId },
      select: { id: true },
    });
    if (!dataSource) {
      throw new NotFoundException(`Data source "${dataSourceId}" not found.`);
    }

    this.validateVerifiedCustomerId(dto.mappings);

    return this.prisma.scoped.$transaction(async (tx) => {
      await tx.sourceFieldMapping.deleteMany({ where: { dataSourceId } });

      const created: PublicSourceFieldMapping[] = [];
      try {
        for (const mapping of dto.mappings) {
          const row = await tx.sourceFieldMapping.create({
            data: {
              dataSourceId,
              sourceField: mapping.sourceField,
              canonicalField: mapping.canonicalField,
              dataCategory: mapping.dataCategory ?? "OTHER",
              containsPersonalData: mapping.containsPersonalData ?? true,
              isVerifiedCustomerId: mapping.isVerifiedCustomerId ?? false,
            } as never,
            select: SOURCE_FIELD_MAPPING_PUBLIC_SELECT,
          });
          created.push(row);

          if (row.containsPersonalData) {
            // Ruling 1: same transaction, so a rollback below (e.g. the
            // very next iteration's unique-constraint violation) undoes
            // this scrub together with the mapping write that triggered
            // it -- never a scrub that commits alone.
            //
            // Deliberately UNCONDITIONAL on `canonicalField` -- an
            // `IGNORE` mapping with `containsPersonalData: true` is
            // scrubbed here even though `computeMappingWarnings` below
            // exempts it from CN-02. The two checks answer different
            // questions on purpose: scrubbing discards a raw sample
            // nobody will ever read through this mapping (safe in
            // either direction -- IGNORE or not), while warning about an
            // IGNORE'd field would falsely claim it is being collected
            // when the whole point of IGNORE is that it is not carried
            // forward. Keep this asymmetry; it is the safe direction on
            // both sides, not an oversight.
            await this.dataSourcesService.rescrubFieldSample(
              dataSourceId,
              row.sourceField,
              tx,
            );
          }
        }
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          throw new ConflictException(
            duplicateSourceFieldMessage(dataSourceId),
          );
        }
        throw err;
      }

      await this.auditService.record(tx, {
        action: "FIELD_MAPPING_UPDATED",
        resourceType: "DataSource",
        resourceId: dataSourceId,
        metadata: {
          mappingCount: created.length,
          sourceFields: created.map((m) => m.sourceField),
        },
      });

      const warnings = await computeMappingWarnings(tx, dataSourceId, created);

      return { mappings: created, warnings };
    });
  }
}
