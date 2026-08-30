import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CanonicalField, DataCategory, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { AuditService } from "../../common/audit/audit.service";
import { DataSourcesService } from "./data-sources.service";
import { ReplaceMappingsDto } from "./dto/replace-mappings.dto";

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

/**
 * Distinguishes the two CN-02 warning shapes Ruling 2 requires the Task 24
 * UI to be able to tell apart, because they read very differently to a
 * DPO:
 *
 *  - `NO_PURPOSES_ATTACHED`: this source has zero purposes attached at
 *    all, so the necessary-category union is trivially empty and EVERY
 *    `containsPersonalData` mapping warns. This is legal (spec line
 *    746) -- the UI should say "no purpose configured yet", never imply
 *    the mapping itself is wrong.
 *  - `CATEGORY_OUTSIDE_PURPOSES`: at least one purpose IS attached, but
 *    none of them declares this mapping's `dataCategory` as necessary.
 *    This is the CN-02 minimisation signal proper -- the UI should name
 *    the field, the category, and the purposes that don't cover it.
 */
export type MappingWarningType =
  "NO_PURPOSES_ATTACHED" | "CATEGORY_OUTSIDE_PURPOSES";

export interface MappingWarningPurposeSummary {
  id: string;
  code: string;
  name: string;
  dataCategories: DataCategory[];
}

export interface MappingWarning {
  type: MappingWarningType;
  sourceField: string;
  canonicalField: CanonicalField;
  dataCategory: DataCategory;
  /** Every purpose currently attached to this source -- `[]` for `NO_PURPOSES_ATTACHED`. */
  attachedPurposes: MappingWarningPurposeSummary[];
  message: string;
}

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
   * CN-02: computed against the UNION of `dataCategories` across every
   * `ProcessingPurpose` CURRENTLY attached to this source (read inside
   * the same transaction the mapping write just committed to, so this
   * always reflects the mapping set as just persisted). Only mappings
   * that actually collect personal data under some category are
   * considered -- a mapping marked `containsPersonalData: false`, or
   * `canonicalField: IGNORE` (not carried forward at all per the task
   * brief), collects nothing, so CN-02 minimisation has nothing to say
   * about it.
   */
  private async computeWarnings(
    tx: ScopedTransactionClient,
    dataSourceId: string,
    mappings: PublicSourceFieldMapping[],
  ): Promise<MappingWarning[]> {
    const links = await tx.dataSourcePurpose.findMany({
      where: { dataSourceId },
      include: {
        purpose: {
          select: { id: true, code: true, name: true, dataCategories: true },
        },
      },
    });
    const attachedPurposes: MappingWarningPurposeSummary[] = links.map(
      (link) => link.purpose,
    );
    const necessaryCategories = new Set<DataCategory>(
      attachedPurposes.flatMap((p) => p.dataCategories),
    );

    const warnings: MappingWarning[] = [];
    for (const mapping of mappings) {
      if (
        !mapping.containsPersonalData ||
        mapping.canonicalField === "IGNORE"
      ) {
        continue;
      }
      if (necessaryCategories.has(mapping.dataCategory)) {
        continue;
      }
      const type: MappingWarningType =
        attachedPurposes.length === 0
          ? "NO_PURPOSES_ATTACHED"
          : "CATEGORY_OUTSIDE_PURPOSES";
      const message =
        type === "NO_PURPOSES_ATTACHED"
          ? `Field "${mapping.sourceField}" (${mapping.canonicalField}) ` +
            `collects data category ${mapping.dataCategory}, but this data ` +
            "source has no processing purpose attached -- never guess one " +
            "(spec line 746); a human must attach one via " +
            "PUT /api/data-sources/:id/purposes."
          : `Field "${mapping.sourceField}" (${mapping.canonicalField}) ` +
            `collects data category ${mapping.dataCategory}, which is not ` +
            "declared as necessary by any of this source's attached " +
            `purposes (${attachedPurposes.map((p) => p.code).join(", ")}). ` +
            "This warns -- it does not block; a human decides (CN-02).";
      warnings.push({
        type,
        sourceField: mapping.sourceField,
        canonicalField: mapping.canonicalField,
        dataCategory: mapping.dataCategory,
        attachedPurposes,
        message,
      });
    }
    return warnings;
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

      const warnings = await this.computeWarnings(tx, dataSourceId, created);

      return { mappings: created, warnings };
    });
  }
}
