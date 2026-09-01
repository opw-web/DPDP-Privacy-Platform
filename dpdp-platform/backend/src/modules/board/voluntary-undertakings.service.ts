import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateVoluntaryUndertakingDto } from "./dto/create-voluntary-undertaking.dto";
import { UpdateVoluntaryUndertakingDto } from "./dto/update-voluntary-undertaking.dto";

export const VOLUNTARY_UNDERTAKING_PUBLIC_SELECT = {
  id: true,
  reference: true,
  summary: true,
  acceptedAt: true,
  commitments: true,
  closedAt: true,
} satisfies Prisma.VoluntaryUndertakingSelect;

export type PublicVoluntaryUndertaking = Prisma.VoluntaryUndertakingGetPayload<{
  select: typeof VOLUNTARY_UNDERTAKING_PUBLIC_SELECT;
}>;

/**
 * `VoluntaryUndertaking` CRUD (BD-06, s.32). Not listed among the
 * spec's §4.13 endpoint table (only `/api/information-requests` is
 * enumerated there for this task's `board/**` ownership) -- exposed
 * anyway, under the SAME permission as `InformationRequest`
 * (`CAN_CHANGE_COMPLIANCE_CONFIG`, no new permission added), because a
 * model with a real schema entry and no way to reach it through the API
 * is a dead deliverable; see task-13-report.md "Concerns" for this
 * choice.
 *
 * Create/update actions are recorded through `AuditService` in the same
 * transaction as each row mutation, preserving Board accountability even if
 * an audit append fails.
 */
@Injectable()
export class VoluntaryUndertakingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicVoluntaryUndertaking[]> {
    return this.prisma.scoped.voluntaryUndertaking.findMany({
      orderBy: { acceptedAt: "desc" },
      select: VOLUNTARY_UNDERTAKING_PUBLIC_SELECT,
    });
  }

  async getById(id: string): Promise<PublicVoluntaryUndertaking> {
    const row = await this.prisma.scoped.voluntaryUndertaking.findFirst({
      where: { id },
      select: VOLUNTARY_UNDERTAKING_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Voluntary undertaking "${id}" not found.`);
    }
    return row;
  }

  async create(dto: CreateVoluntaryUndertakingDto): Promise<PublicVoluntaryUndertaking> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.voluntaryUndertaking.create({
        data: {
          reference: dto.reference,
          summary: dto.summary,
          acceptedAt: new Date(dto.acceptedAt),
          commitments: (dto.commitments ?? []) as unknown as Prisma.InputJsonValue,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime.
        } as never,
        select: VOLUNTARY_UNDERTAKING_PUBLIC_SELECT,
      });
      await this.auditService.record(tx, {
        action: "VOLUNTARY_UNDERTAKING_CREATED",
        resourceType: "VoluntaryUndertaking",
        resourceId: created.id,
        metadata: {
          reference: created.reference,
          acceptedAt: created.acceptedAt,
        },
      });
      return created;
    });
  }

  async update(id: string, dto: UpdateVoluntaryUndertakingDto): Promise<PublicVoluntaryUndertaking> {
    const existing = await this.prisma.scoped.voluntaryUndertaking.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Voluntary undertaking "${id}" not found.`);
    }
    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.voluntaryUndertaking.update({
        where: { id },
        data: {
          summary: dto.summary ?? existing.summary,
          commitments:
            dto.commitments !== undefined
              ? (dto.commitments as unknown as Prisma.InputJsonValue)
              : (existing.commitments as Prisma.InputJsonValue),
          closedAt: dto.closedAt ? new Date(dto.closedAt) : existing.closedAt,
        },
        select: VOLUNTARY_UNDERTAKING_PUBLIC_SELECT,
      });
      await this.auditService.record(tx, {
        action: "VOLUNTARY_UNDERTAKING_UPDATED",
        resourceType: "VoluntaryUndertaking",
        resourceId: id,
        metadata: {
          reference: updated.reference,
          closedAt: updated.closedAt,
        },
      });
      return updated;
    });
  }
}
