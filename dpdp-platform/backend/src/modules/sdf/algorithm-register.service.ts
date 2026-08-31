import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateAlgorithmEntryDto } from "./dto/create-algorithm-entry.dto";
import { UpdateAlgorithmEntryDto } from "./dto/update-algorithm-entry.dto";

export const ALGORITHM_ENTRY_PUBLIC_SELECT = {
  id: true,
  name: true,
  description: true,
  operations: true,
  riskAssessment: true,
  riskToRightsIdentified: true,
  mitigations: true,
  lastReviewedAt: true,
  reviewedByEmployeeId: true,
} satisfies Prisma.AlgorithmRegisterEntrySelect;

export type PublicAlgorithmEntry = Prisma.AlgorithmRegisterEntryGetPayload<{
  select: typeof ALGORITHM_ENTRY_PUBLIC_SELECT;
}>;

/**
 * `AlgorithmRegisterEntry` CRUD (SD-05, Rule 13(3)). Only one audit
 * action exists in the catalogue for this model
 * (`ALGORITHM_REGISTER_UPDATED` -- `src/common/audit/audit-actions.ts`
 * has no separate "created" variant), so both `create` and `update` use
 * it; `metadata.change` distinguishes them for a reader of the log,
 * mirroring how `RecipientsService`'s audit metadata carries
 * `change: "CREATED"`.
 */
@Injectable()
export class AlgorithmRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicAlgorithmEntry[]> {
    return this.prisma.scoped.algorithmRegisterEntry.findMany({
      orderBy: { name: "asc" },
      select: ALGORITHM_ENTRY_PUBLIC_SELECT,
    });
  }

  async getById(id: string): Promise<PublicAlgorithmEntry> {
    const row = await this.prisma.scoped.algorithmRegisterEntry.findFirst({
      where: { id },
      select: ALGORITHM_ENTRY_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Algorithm register entry "${id}" not found.`);
    }
    return row;
  }

  async create(dto: CreateAlgorithmEntryDto): Promise<PublicAlgorithmEntry> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.algorithmRegisterEntry.create({
        data: {
          name: dto.name,
          description: dto.description,
          operations: dto.operations,
          riskAssessment: dto.riskAssessment ?? null,
          riskToRightsIdentified: dto.riskToRightsIdentified ?? false,
          mitigations: dto.mitigations ?? null,
          lastReviewedAt: dto.lastReviewedAt ? new Date(dto.lastReviewedAt) : null,
          reviewedByEmployeeId: dto.reviewedByEmployeeId ?? null,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime.
        } as never,
        select: ALGORITHM_ENTRY_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "ALGORITHM_REGISTER_UPDATED",
        resourceType: "AlgorithmRegisterEntry",
        resourceId: created.id,
        metadata: { change: "CREATED", name: created.name, operations: created.operations },
      });

      return created;
    });
  }

  async update(id: string, dto: UpdateAlgorithmEntryDto): Promise<PublicAlgorithmEntry> {
    const existing = await this.prisma.scoped.algorithmRegisterEntry.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Algorithm register entry "${id}" not found.`);
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.algorithmRegisterEntry.update({
        where: { id },
        data: {
          name: dto.name ?? existing.name,
          description: dto.description ?? existing.description,
          operations: dto.operations ?? existing.operations,
          riskAssessment: dto.riskAssessment !== undefined ? dto.riskAssessment : existing.riskAssessment,
          riskToRightsIdentified: dto.riskToRightsIdentified ?? existing.riskToRightsIdentified,
          mitigations: dto.mitigations !== undefined ? dto.mitigations : existing.mitigations,
          lastReviewedAt: dto.lastReviewedAt ? new Date(dto.lastReviewedAt) : existing.lastReviewedAt,
          reviewedByEmployeeId:
            dto.reviewedByEmployeeId !== undefined
              ? dto.reviewedByEmployeeId
              : existing.reviewedByEmployeeId,
        },
        select: ALGORITHM_ENTRY_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "ALGORITHM_REGISTER_UPDATED",
        resourceType: "AlgorithmRegisterEntry",
        resourceId: id,
        metadata: { change: "UPDATED", name: updated.name },
      });

      return updated;
    });
  }
}
