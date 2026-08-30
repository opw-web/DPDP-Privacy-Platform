import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateSecurityMeasureDto } from "./dto/create-security-measure.dto";
import { UpdateSecurityMeasureDto } from "./dto/update-security-measure.dto";

/**
 * The ONLY shape of `SecurityMeasure` this service (or the controller
 * behind it) ever returns. `organizationId` deliberately absent -- same
 * discipline as every other register in this module.
 */
export const SECURITY_MEASURE_PUBLIC_SELECT = {
  id: true,
  dataSourceId: true,
  ruleReference: true,
  measureType: true,
  implemented: true,
  description: true,
  evidenceReference: true,
  lastReviewedAt: true,
  reviewedByEmployeeId: true,
} satisfies Prisma.SecurityMeasureSelect;

export type PublicSecurityMeasure = Prisma.SecurityMeasureGetPayload<{
  select: typeof SECURITY_MEASURE_PUBLIC_SELECT;
}>;

/**
 * `GET /api/registers/security`'s response shape (task brief: "security
 * measures list grouped by rule reference with implemented counts") --
 * one entry per distinct `ruleReference` this organization has at least
 * one measure for, in "Rule 6(1)(a)" .. "Rule 6(1)(g)" order (a plain
 * string sort already produces this order for the fixed set of single
 * trailing letters).
 */
export interface SecurityMeasureGroup {
  ruleReference: string;
  totalCount: number;
  implementedCount: number;
  measures: PublicSecurityMeasure[];
}

function groupByRuleReference(
  measures: PublicSecurityMeasure[],
): SecurityMeasureGroup[] {
  const byRule = new Map<string, PublicSecurityMeasure[]>();
  for (const measure of measures) {
    const bucket = byRule.get(measure.ruleReference) ?? [];
    bucket.push(measure);
    byRule.set(measure.ruleReference, bucket);
  }
  return Array.from(byRule.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ruleReference, groupMeasures]) => ({
      ruleReference,
      totalCount: groupMeasures.length,
      implementedCount: groupMeasures.filter((m) => m.implemented).length,
      measures: groupMeasures,
    }));
}

@Injectable()
export class SecurityMeasuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<SecurityMeasureGroup[]> {
    const measures = await this.prisma.scoped.securityMeasure.findMany({
      select: SECURITY_MEASURE_PUBLIC_SELECT,
    });
    return groupByRuleReference(measures);
  }

  async get(id: string): Promise<PublicSecurityMeasure> {
    const row = await this.prisma.scoped.securityMeasure.findFirst({
      where: { id },
      select: SECURITY_MEASURE_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Security measure "${id}" not found.`);
    }
    return row;
  }

  private async assertDataSourceExists(dataSourceId: string): Promise<void> {
    const dataSource = await this.prisma.scoped.dataSource.findFirst({
      where: { id: dataSourceId },
      select: { id: true },
    });
    if (!dataSource) {
      throw new BadRequestException(`Unknown data source id: ${dataSourceId}`);
    }
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.scoped.employee.findFirst({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new BadRequestException(`Unknown employee id: ${employeeId}`);
    }
  }

  /**
   * The fixed `AuditAction` union has `SECURITY_MEASURE_UPDATED` but no
   * `SECURITY_MEASURE_CREATED` -- the reverse gap from
   * sharing/transfers/retention (which have a CREATED action but no
   * UPDATED one). `SECURITY_MEASURE_UPDATED` is the only action in the
   * union that names this resource at all, so, unlike the
   * sharing/transfers/retention PATCHes (where nothing in the union
   * names the resource and skipping audit is the honest choice), this
   * create() call reuses it rather than skip auditing entirely -- the
   * same "closest fit over inventing a new one" call
   * `SourcePurposesService.replace()` made reusing `DATA_SOURCE_UPDATED`
   * for a change that is not literally an update of the `DataSource` row
   * itself. Flagged for the spec owner in the task report all the same.
   */
  async create(dto: CreateSecurityMeasureDto): Promise<PublicSecurityMeasure> {
    if (dto.dataSourceId !== undefined && dto.dataSourceId !== null) {
      await this.assertDataSourceExists(dto.dataSourceId);
    }
    if (
      dto.reviewedByEmployeeId !== undefined &&
      dto.reviewedByEmployeeId !== null
    ) {
      await this.assertEmployeeExists(dto.reviewedByEmployeeId);
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.securityMeasure.create({
        data: {
          dataSourceId: dto.dataSourceId ?? null,
          ruleReference: dto.ruleReference,
          measureType: dto.measureType,
          implemented: dto.implemented ?? false,
          description: dto.description,
          evidenceReference: dto.evidenceReference ?? null,
          lastReviewedAt: dto.lastReviewedAt
            ? new Date(dto.lastReviewedAt)
            : null,
          reviewedByEmployeeId: dto.reviewedByEmployeeId ?? null,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime.
        } as never,
        select: SECURITY_MEASURE_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "SECURITY_MEASURE_UPDATED",
        resourceType: "SecurityMeasure",
        resourceId: created.id,
        metadata: {
          change: "CREATED",
          ruleReference: created.ruleReference,
          measureType: created.measureType,
          implemented: created.implemented,
        },
      });

      return created;
    });
  }

  async update(
    id: string,
    dto: UpdateSecurityMeasureDto,
  ): Promise<PublicSecurityMeasure> {
    const existing = await this.prisma.scoped.securityMeasure.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Security measure "${id}" not found.`);
    }

    if (dto.dataSourceId !== undefined && dto.dataSourceId !== null) {
      await this.assertDataSourceExists(dto.dataSourceId);
    }
    if (
      dto.reviewedByEmployeeId !== undefined &&
      dto.reviewedByEmployeeId !== null
    ) {
      await this.assertEmployeeExists(dto.reviewedByEmployeeId);
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.securityMeasure.update({
        where: { id },
        data: {
          dataSourceId: dto.dataSourceId,
          ruleReference: dto.ruleReference,
          measureType: dto.measureType,
          implemented: dto.implemented,
          description: dto.description,
          evidenceReference: dto.evidenceReference,
          lastReviewedAt:
            dto.lastReviewedAt === undefined
              ? undefined
              : dto.lastReviewedAt === null
                ? null
                : new Date(dto.lastReviewedAt),
          reviewedByEmployeeId: dto.reviewedByEmployeeId,
        },
        select: SECURITY_MEASURE_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "SECURITY_MEASURE_UPDATED",
        resourceType: "SecurityMeasure",
        resourceId: id,
        metadata: {
          change: "UPDATED",
          ruleReference: updated.ruleReference,
          implemented: updated.implemented,
        },
      });

      return updated;
    });
  }
}
