import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { RecipientType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateRecipientDto } from "./dto/create-recipient.dto";
import { UpdateRecipientDto } from "./dto/update-recipient.dto";

/**
 * The ONLY shape of `DataRecipient` this service (or the controller
 * behind it) ever returns. `organizationId` deliberately absent -- same
 * discipline as `DATA_SOURCE_PUBLIC_SELECT` / `PURPOSE_PUBLIC_SELECT`.
 */
export const RECIPIENT_PUBLIC_SELECT = {
  id: true,
  name: true,
  type: true,
  contactEmail: true,
  country: true,
  contractExists: true,
  contractReference: true,
  contractSignedAt: true,
  contractExpiresAt: true,
  contractHasSecurityClause: true,
  contractHasErasureClause: true,
  contractHasAuditRights: true,
  subProcessorsDisclosed: true,
  subProcessorNotes: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DataRecipientSelect;

export type PublicRecipient = Prisma.DataRecipientGetPayload<{
  select: typeof RECIPIENT_PUBLIC_SELECT;
}>;

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function duplicateNameMessage(name: string): string {
  return `A recipient named "${name}" already exists in this organization.`;
}

@Injectable()
export class RecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicRecipient[]> {
    return this.prisma.scoped.dataRecipient.findMany({
      orderBy: { name: "asc" },
      select: RECIPIENT_PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicRecipient> {
    const row = await this.prisma.scoped.dataRecipient.findFirst({
      where: { id },
      select: RECIPIENT_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Recipient "${id}" not found.`);
    }
    return row;
  }

  /**
   * s.8(2) / GO-02 / Check 13: a `DATA_PROCESSOR` recipient may never be
   * `active` without a valid contract on file. Checked here against the
   * EFFECTIVE (existing + patch) state -- called from both `create()`
   * (against the values about to be written) and `update()` (against
   * `existing` merged with the patch) -- so neither "create it active
   * with no contract" nor a two-step PATCH ("flip active to true", or
   * "flip contractExists to false while still active") can slip the
   * rule. This is the API-level half of a two-layer defence: the
   * database's `processor_requires_contract` CHECK constraint
   * (migration `20260829183100_constraints_and_triggers`) is the
   * backstop that holds even if this method is ever bypassed or has a
   * bug -- see `test/registers.e2e-spec.ts`'s raw-SQL test for proof the
   * constraint fires independently of this check.
   */
  private assertProcessorRule(
    type: RecipientType,
    active: boolean,
    contractExists: boolean,
  ): void {
    if (type === "DATA_PROCESSOR" && active && !contractExists) {
      throw new BadRequestException(
        "A DATA_PROCESSOR recipient cannot be active without a valid " +
          "contract on file (contractExists must be true) -- s.8(2).",
      );
    }
  }

  async create(dto: CreateRecipientDto): Promise<PublicRecipient> {
    const type = dto.type;
    const active = dto.active ?? true;
    const contractExists = dto.contractExists ?? false;
    this.assertProcessorRule(type, active, contractExists);

    const nameConflict = await this.prisma.scoped.dataRecipient.findFirst({
      where: { name: dto.name },
      select: { id: true },
    });
    if (nameConflict) {
      throw new ConflictException(duplicateNameMessage(dto.name));
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      let created: PublicRecipient;
      try {
        created = await tx.dataRecipient.create({
          data: {
            name: dto.name,
            type,
            contactEmail: dto.contactEmail ?? null,
            country: dto.country ?? "IN",
            contractExists,
            contractReference: dto.contractReference ?? null,
            contractSignedAt: dto.contractSignedAt
              ? new Date(dto.contractSignedAt)
              : null,
            contractExpiresAt: dto.contractExpiresAt
              ? new Date(dto.contractExpiresAt)
              : null,
            contractHasSecurityClause: dto.contractHasSecurityClause ?? false,
            contractHasErasureClause: dto.contractHasErasureClause ?? false,
            contractHasAuditRights: dto.contractHasAuditRights ?? false,
            subProcessorsDisclosed: dto.subProcessorsDisclosed ?? false,
            subProcessorNotes: dto.subProcessorNotes ?? null,
            active,
            // organizationId deliberately omitted -- the tenant-scoping
            // extension supplies it at runtime (same convention as
            // EmployeesService.create / DataSourcesService.create).
          } as never,
          select: RECIPIENT_PUBLIC_SELECT,
        });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          throw new ConflictException(duplicateNameMessage(dto.name));
        }
        throw err;
      }

      await this.auditService.record(tx, {
        action: "RECIPIENT_CREATED",
        resourceType: "DataRecipient",
        resourceId: created.id,
        metadata: { name: created.name, type: created.type },
      });

      return created;
    });
  }

  async update(id: string, dto: UpdateRecipientDto): Promise<PublicRecipient> {
    const existing = await this.prisma.scoped.dataRecipient.findFirst({
      where: { id },
      select: { type: true, active: true, contractExists: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException(`Recipient "${id}" not found.`);
    }

    const effectiveType = dto.type ?? existing.type;
    const effectiveActive = dto.active ?? existing.active;
    const effectiveContractExists =
      dto.contractExists ?? existing.contractExists;
    this.assertProcessorRule(
      effectiveType,
      effectiveActive,
      effectiveContractExists,
    );

    if (dto.name !== undefined) {
      const nameConflict = await this.prisma.scoped.dataRecipient.findFirst({
        where: { name: dto.name, id: { not: id } },
        select: { id: true },
      });
      if (nameConflict) {
        throw new ConflictException(duplicateNameMessage(dto.name));
      }
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      let updated: PublicRecipient;
      try {
        updated = await tx.dataRecipient.update({
          where: { id },
          data: {
            name: dto.name,
            type: dto.type,
            contactEmail: dto.contactEmail,
            country: dto.country,
            contractExists: dto.contractExists,
            contractReference: dto.contractReference,
            contractSignedAt: dto.contractSignedAt
              ? new Date(dto.contractSignedAt)
              : undefined,
            contractExpiresAt: dto.contractExpiresAt
              ? new Date(dto.contractExpiresAt)
              : undefined,
            contractHasSecurityClause: dto.contractHasSecurityClause,
            contractHasErasureClause: dto.contractHasErasureClause,
            contractHasAuditRights: dto.contractHasAuditRights,
            subProcessorsDisclosed: dto.subProcessorsDisclosed,
            subProcessorNotes: dto.subProcessorNotes,
            active: dto.active,
          },
          select: RECIPIENT_PUBLIC_SELECT,
        });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          throw new ConflictException(duplicateNameMessage(dto.name ?? ""));
        }
        throw err;
      }

      await this.auditService.record(tx, {
        action: "RECIPIENT_UPDATED",
        resourceType: "DataRecipient",
        resourceId: id,
        metadata: { name: updated.name, active: updated.active },
      });

      return updated;
    });
  }
}
