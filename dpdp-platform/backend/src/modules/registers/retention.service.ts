import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateRetentionPolicyDto } from "./dto/create-retention-policy.dto";
import { UpdateRetentionPolicyDto } from "./dto/update-retention-policy.dto";

/**
 * The ONLY shape of `RetentionPolicy` this service (or the controller
 * behind it) ever returns. `organizationId` deliberately absent -- same
 * discipline as every other register in this module.
 */
export const RETENTION_POLICY_PUBLIC_SELECT = {
  id: true,
  purposeId: true,
  name: true,
  triggerType: true,
  retentionValue: true,
  retentionUnit: true,
  legalBasisForRetention: true,
  legalBasisType: true,
  minimumRetentionValue: true,
  minimumRetentionUnit: true,
  preErasureNoticeHours: true,
  accountAccessCarveOut: true,
  active: true,
} satisfies Prisma.RetentionPolicySelect;

export type PublicRetentionPolicy = Prisma.RetentionPolicyGetPayload<{
  select: typeof RETENTION_POLICY_PUBLIC_SELECT;
}>;

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function duplicateNameMessage(purposeId: string, name: string): string {
  return (
    `A retention policy named "${name}" already exists for purpose ` +
    `"${purposeId}" in this organization.`
  );
}

/**
 * RE-08: the model here, the engine in MVP 2 -- this service STORES and
 * VALIDATES retention data; nothing here ever schedules, executes, or
 * compares against a running clock. Global Constraint 4: no retention
 * period may appear as a literal in application logic. `create()` below
 * deliberately omits `minimumRetentionValue`/`minimumRetentionUnit`/
 * `preErasureNoticeHours` from the write when the caller does not supply
 * them, letting Postgres's own column defaults apply, rather than this
 * service repeating those defaults as a second, code-level literal.
 */
@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicRetentionPolicy[]> {
    return this.prisma.scoped.retentionPolicy.findMany({
      orderBy: { name: "asc" },
      select: RETENTION_POLICY_PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicRetentionPolicy> {
    const row = await this.prisma.scoped.retentionPolicy.findFirst({
      where: { id },
      select: RETENTION_POLICY_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Retention policy "${id}" not found.`);
    }
    return row;
  }

  private async assertPurposeExists(purposeId: string): Promise<void> {
    const purpose = await this.prisma.scoped.processingPurpose.findFirst({
      where: { id: purposeId },
      select: { id: true },
    });
    if (!purpose) {
      throw new BadRequestException(`Unknown purpose id: ${purposeId}`);
    }
  }

  async create(dto: CreateRetentionPolicyDto): Promise<PublicRetentionPolicy> {
    await this.assertPurposeExists(dto.purposeId);

    const nameConflict = await this.prisma.scoped.retentionPolicy.findFirst({
      where: { purposeId: dto.purposeId, name: dto.name },
      select: { id: true },
    });
    if (nameConflict) {
      throw new ConflictException(
        duplicateNameMessage(dto.purposeId, dto.name),
      );
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      let created: PublicRetentionPolicy;
      try {
        created = await tx.retentionPolicy.create({
          data: {
            purposeId: dto.purposeId,
            name: dto.name,
            triggerType: dto.triggerType,
            retentionValue: dto.retentionValue,
            retentionUnit: dto.retentionUnit,
            legalBasisForRetention: dto.legalBasisForRetention,
            legalBasisType: dto.legalBasisType,
            // Omitted when the caller doesn't supply a value -- see the
            // class doc comment above.
            ...(dto.minimumRetentionValue !== undefined
              ? { minimumRetentionValue: dto.minimumRetentionValue }
              : {}),
            ...(dto.minimumRetentionUnit !== undefined
              ? { minimumRetentionUnit: dto.minimumRetentionUnit }
              : {}),
            ...(dto.preErasureNoticeHours !== undefined
              ? { preErasureNoticeHours: dto.preErasureNoticeHours }
              : {}),
            accountAccessCarveOut: dto.accountAccessCarveOut ?? false,
            active: dto.active ?? true,
            // organizationId deliberately omitted -- the tenant-scoping
            // extension supplies it at runtime.
          } as never,
          select: RETENTION_POLICY_PUBLIC_SELECT,
        });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          throw new ConflictException(
            duplicateNameMessage(dto.purposeId, dto.name),
          );
        }
        throw err;
      }

      await this.auditService.record(tx, {
        action: "RETENTION_POLICY_CREATED",
        resourceType: "RetentionPolicy",
        resourceId: created.id,
        metadata: {
          change: "CREATED",
          purposeId: created.purposeId,
          name: created.name,
          retentionValue: created.retentionValue,
          retentionUnit: created.retentionUnit,
        },
      });

      return created;
    });
  }

  async update(
    id: string,
    dto: UpdateRetentionPolicyDto,
  ): Promise<PublicRetentionPolicy> {
    const existing = await this.prisma.scoped.retentionPolicy.findFirst({
      where: { id },
      select: { purposeId: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException(`Retention policy "${id}" not found.`);
    }

    if (dto.purposeId !== undefined) {
      await this.assertPurposeExists(dto.purposeId);
    }

    const effectivePurposeId = dto.purposeId ?? existing.purposeId;
    const effectiveName = dto.name ?? existing.name;
    if (dto.purposeId !== undefined || dto.name !== undefined) {
      const nameConflict = await this.prisma.scoped.retentionPolicy.findFirst({
        where: {
          purposeId: effectivePurposeId,
          name: effectiveName,
          id: { not: id },
        },
        select: { id: true },
      });
      if (nameConflict) {
        throw new ConflictException(
          duplicateNameMessage(effectivePurposeId, effectiveName),
        );
      }
    }

    try {
      return await this.prisma.scoped.$transaction(async (tx) => {
        const updated = await tx.retentionPolicy.update({
          where: { id },
          data: {
            purposeId: dto.purposeId,
            name: dto.name,
            triggerType: dto.triggerType,
            retentionValue: dto.retentionValue,
            retentionUnit: dto.retentionUnit,
            legalBasisForRetention: dto.legalBasisForRetention,
            legalBasisType: dto.legalBasisType,
            minimumRetentionValue: dto.minimumRetentionValue,
            minimumRetentionUnit: dto.minimumRetentionUnit,
            preErasureNoticeHours: dto.preErasureNoticeHours,
            accountAccessCarveOut: dto.accountAccessCarveOut,
            active: dto.active,
          },
          select: RETENTION_POLICY_PUBLIC_SELECT,
        });

        await this.auditService.record(tx, {
          action: "RETENTION_POLICY_CREATED",
          resourceType: "RetentionPolicy",
          resourceId: updated.id,
          metadata: { change: "UPDATED" },
        });

        return updated;
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictException(
          duplicateNameMessage(effectivePurposeId, effectiveName),
        );
      }
      throw err;
    }
  }
}
