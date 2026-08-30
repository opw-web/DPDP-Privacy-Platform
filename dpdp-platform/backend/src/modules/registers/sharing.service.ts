import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateSharingActivityDto } from "./dto/create-sharing-activity.dto";
import { UpdateSharingActivityDto } from "./dto/update-sharing-activity.dto";

/**
 * The ONLY shape of `SharingActivity` this service (or the controller
 * behind it) ever returns. `organizationId` deliberately absent -- same
 * discipline as every other register in this module.
 */
export const SHARING_ACTIVITY_PUBLIC_SELECT = {
  id: true,
  recipientId: true,
  purposeId: true,
  dataCategories: true,
  description: true,
  sourceIds: true,
  startedAt: true,
  endedAt: true,
  active: true,
} satisfies Prisma.SharingActivitySelect;

export type PublicSharingActivity = Prisma.SharingActivityGetPayload<{
  select: typeof SHARING_ACTIVITY_PUBLIC_SELECT;
}>;

/**
 * s.11(1)(b): a `SharingActivity` with no (or a blank/whitespace-only)
 * description cannot exist -- the register would then be unable to
 * produce "a description of the personal data so shared". Checked here
 * against the EFFECTIVE value, called from both `create()` and
 * `update()`, so a PATCH cannot blank out a real description any more
 * easily than a POST can omit one -- same discipline as
 * `PurposesService.validateBasis()`'s `basisJustification` check.
 */
function assertNonBlankDescription(description: string): void {
  if (!description || description.trim().length === 0) {
    throw new BadRequestException(
      "description is required and cannot be blank -- s.11(1)(b) obliges " +
        "the company to be able to produce a description of the personal " +
        "data shared with this recipient.",
    );
  }
}

@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicSharingActivity[]> {
    return this.prisma.scoped.sharingActivity.findMany({
      orderBy: { startedAt: "desc" },
      select: SHARING_ACTIVITY_PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicSharingActivity> {
    const row = await this.prisma.scoped.sharingActivity.findFirst({
      where: { id },
      select: SHARING_ACTIVITY_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Sharing activity "${id}" not found.`);
    }
    return row;
  }

  /**
   * `recipientId`/`purposeId` are plain scalar foreign keys on a DIRECT
   * tenant-scoped model (not one of the indirect join tables the
   * extension verifies automatically) -- so, same convention as
   * `MappingsService`/`SourcePurposesService`, this looks each up
   * through the SCOPED delegate before writing: a caller-supplied id
   * belonging to another organization is indistinguishable from an
   * unknown one, and both come back a clean 400 rather than a raw
   * Postgres foreign-key error surfacing as a 500.
   */
  private async assertRecipientExists(recipientId: string): Promise<void> {
    const recipient = await this.prisma.scoped.dataRecipient.findFirst({
      where: { id: recipientId },
      select: { id: true },
    });
    if (!recipient) {
      throw new BadRequestException(`Unknown recipient id: ${recipientId}`);
    }
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

  /**
   * `sourceIds` is the array Task 20 intersects per principal to answer
   * "which recipients hold this person's data" -- a garbage or
   * foreign-org id here would silently break that answer, so every id is
   * verified against this organization's `DataSource` rows the same way
   * `SourcePurposesService.replace()` verifies `purposeIds`.
   */
  private async assertSourceIdsExist(sourceIds: string[]): Promise<void> {
    if (sourceIds.length === 0) {
      return;
    }
    const known = await this.prisma.scoped.dataSource.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true },
    });
    const knownIds = new Set(known.map((s) => s.id));
    const unknown = sourceIds.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown data source id(s) in sourceIds: ${unknown.join(", ")}`,
      );
    }
  }

  async create(dto: CreateSharingActivityDto): Promise<PublicSharingActivity> {
    assertNonBlankDescription(dto.description);
    await this.assertRecipientExists(dto.recipientId);
    await this.assertPurposeExists(dto.purposeId);
    await this.assertSourceIdsExist(dto.sourceIds);

    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.sharingActivity.create({
        data: {
          recipientId: dto.recipientId,
          purposeId: dto.purposeId,
          dataCategories: dto.dataCategories,
          description: dto.description,
          sourceIds: dto.sourceIds,
          startedAt: new Date(dto.startedAt),
          endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
          active: dto.active ?? true,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime.
        } as never,
        select: SHARING_ACTIVITY_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "SHARING_ACTIVITY_CREATED",
        resourceType: "SharingActivity",
        resourceId: created.id,
        metadata: {
          recipientId: created.recipientId,
          purposeId: created.purposeId,
          dataCategories: created.dataCategories,
        },
      });

      return created;
    });
  }

  /**
   * Fix-round-1-style note recorded up front rather than after review:
   * the fixed `AuditAction` union (audit-actions.ts) has no
   * `SHARING_ACTIVITY_UPDATED` -- only `SHARING_ACTIVITY_CREATED`. Unlike
   * `SourcePurposesService.replace()` reusing `DATA_SOURCE_UPDATED` (a
   * generic "this DataSource changed" action that genuinely names the
   * resource being changed), there is no existing action anywhere in the
   * union that names `SharingActivity` other than the CREATED one, so
   * there is nothing defensible to borrow without mislabeling an update
   * as a creation. Per the task dispatch's explicit instruction not to
   * invent a new action, this PATCH performs the write but does NOT call
   * `AuditService.record()`. Flagged for the spec owner in the task
   * report.
   */
  async update(
    id: string,
    dto: UpdateSharingActivityDto,
  ): Promise<PublicSharingActivity> {
    const existing = await this.prisma.scoped.sharingActivity.findFirst({
      where: { id },
      select: { description: true },
    });
    if (!existing) {
      throw new NotFoundException(`Sharing activity "${id}" not found.`);
    }

    const effectiveDescription = dto.description ?? existing.description;
    assertNonBlankDescription(effectiveDescription);

    if (dto.recipientId !== undefined) {
      await this.assertRecipientExists(dto.recipientId);
    }
    if (dto.purposeId !== undefined) {
      await this.assertPurposeExists(dto.purposeId);
    }
    if (dto.sourceIds !== undefined) {
      await this.assertSourceIdsExist(dto.sourceIds);
    }

    return this.prisma.scoped.sharingActivity.update({
      where: { id },
      data: {
        recipientId: dto.recipientId,
        purposeId: dto.purposeId,
        dataCategories: dto.dataCategories,
        description: dto.description,
        sourceIds: dto.sourceIds,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
        endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
        active: dto.active,
      },
      select: SHARING_ACTIVITY_PUBLIC_SELECT,
    });
  }
}
