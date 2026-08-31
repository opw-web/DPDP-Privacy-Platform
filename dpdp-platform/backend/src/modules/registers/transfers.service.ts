import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { UpdateTransferDto } from "./dto/update-transfer.dto";

/**
 * The ONLY shape of `CrossBorderTransfer` this service (or the
 * controller behind it) ever returns. `organizationId` deliberately
 * absent -- same discipline as every other register in this module.
 */
export const TRANSFER_PUBLIC_SELECT = {
  id: true,
  recipientId: true,
  destinationCountry: true,
  dataCategories: true,
  purposeDescription: true,
  govtRestrictionChecked: true,
  govtRestrictionNotes: true,
  sectoralRestrictionNotes: true,
  localisationRequired: true,
  reviewedByEmployeeId: true,
  reviewedAt: true,
} satisfies Prisma.CrossBorderTransferSelect;

export type PublicTransfer = Prisma.CrossBorderTransferGetPayload<{
  select: typeof TRANSFER_PUBLIC_SELECT;
}>;

/**
 * `CrossBorderTransfer` records what a human checked and when -- it
 * never decides whether a transfer is lawful (task brief). There is
 * deliberately NO validation anywhere in this service that inspects
 * `destinationCountry`, `govtRestrictionChecked` or
 * `sectoralRestrictionNotes` to approve, block, or infer lawfulness. Do
 * not add any.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicTransfer[]> {
    return this.prisma.scoped.crossBorderTransfer.findMany({
      orderBy: { destinationCountry: "asc" },
      select: TRANSFER_PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicTransfer> {
    const row = await this.prisma.scoped.crossBorderTransfer.findFirst({
      where: { id },
      select: TRANSFER_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Cross-border transfer "${id}" not found.`);
    }
    return row;
  }

  /** Same convention as `SharingService.assertRecipientExists()`. */
  private async assertRecipientExists(recipientId: string): Promise<void> {
    const recipient = await this.prisma.scoped.dataRecipient.findFirst({
      where: { id: recipientId },
      select: { id: true },
    });
    if (!recipient) {
      throw new BadRequestException(`Unknown recipient id: ${recipientId}`);
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

  async create(dto: CreateTransferDto): Promise<PublicTransfer> {
    await this.assertRecipientExists(dto.recipientId);
    if (
      dto.reviewedByEmployeeId !== undefined &&
      dto.reviewedByEmployeeId !== null
    ) {
      await this.assertEmployeeExists(dto.reviewedByEmployeeId);
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.crossBorderTransfer.create({
        data: {
          recipientId: dto.recipientId,
          destinationCountry: dto.destinationCountry,
          dataCategories: dto.dataCategories ?? [],
          purposeDescription: dto.purposeDescription,
          govtRestrictionChecked: dto.govtRestrictionChecked ?? false,
          govtRestrictionNotes: dto.govtRestrictionNotes ?? null,
          sectoralRestrictionNotes: dto.sectoralRestrictionNotes ?? null,
          localisationRequired: dto.localisationRequired ?? false,
          reviewedByEmployeeId: dto.reviewedByEmployeeId ?? null,
          reviewedAt: dto.reviewedAt ? new Date(dto.reviewedAt) : null,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime.
        } as never,
        select: TRANSFER_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "TRANSFER_CREATED",
        resourceType: "CrossBorderTransfer",
        resourceId: created.id,
        metadata: {
          change: "CREATED",
          recipientId: created.recipientId,
          destinationCountry: created.destinationCountry,
        },
      });

      return created;
    });
  }

  async update(id: string, dto: UpdateTransferDto): Promise<PublicTransfer> {
    const existing = await this.prisma.scoped.crossBorderTransfer.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Cross-border transfer "${id}" not found.`);
    }

    if (dto.recipientId !== undefined) {
      await this.assertRecipientExists(dto.recipientId);
    }
    if (
      dto.reviewedByEmployeeId !== undefined &&
      dto.reviewedByEmployeeId !== null
    ) {
      await this.assertEmployeeExists(dto.reviewedByEmployeeId);
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.crossBorderTransfer.update({
        where: { id },
        data: {
          recipientId: dto.recipientId,
          destinationCountry: dto.destinationCountry,
          dataCategories: dto.dataCategories,
          purposeDescription: dto.purposeDescription,
          govtRestrictionChecked: dto.govtRestrictionChecked,
          govtRestrictionNotes: dto.govtRestrictionNotes,
          sectoralRestrictionNotes: dto.sectoralRestrictionNotes,
          localisationRequired: dto.localisationRequired,
          reviewedByEmployeeId: dto.reviewedByEmployeeId,
          reviewedAt:
            dto.reviewedAt === undefined
              ? undefined
              : dto.reviewedAt === null
                ? null
                : new Date(dto.reviewedAt),
        },
        select: TRANSFER_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "TRANSFER_CREATED",
        resourceType: "CrossBorderTransfer",
        resourceId: updated.id,
        metadata: { change: "UPDATED" },
      });

      return updated;
    });
  }
}
