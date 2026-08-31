import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { SetAgeStatusDto } from "./dto/set-age-status.dto";

/**
 * The `ageStatusSource` value this service (and ONLY this service) ever
 * writes -- the counterpart of `AgeService`'s own `DOB_DERIVED_SOURCE`
 * constant (`src/modules/identity/age.service.ts`). `AgeService.derive()`
 * bails out before touching a principal whose `ageStatusSource` already
 * reads `EMPLOYEE_SET` (or `SELF_DECLARED`), so writing this string here
 * is what makes a subsequent DOB re-derivation leave this determination
 * alone.
 */
const EMPLOYEE_SET_SOURCE = "EMPLOYEE_SET";

const AGE_STATUS_PUBLIC_SELECT = {
  id: true,
  ageStatus: true,
  ageStatusSource: true,
  ageStatusSetAt: true,
} as const;

/**
 * `POST /api/principals/:id/age-status` (CH-01, spec line 670): the
 * platform's ONLY route that lets a human declare age status directly.
 * Age is never inferred from behaviour, product category, or name --
 * DOB-derivation is `AgeService.derive()`'s separate, narrower job.
 */
@Injectable()
export class AgeStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async setAgeStatus(id: string, dto: SetAgeStatusDto) {
    const existing = await this.prisma.scoped.dataPrincipal.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Data principal "${id}" not found.`);
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.dataPrincipal.update({
        where: { id },
        data: {
          ageStatus: dto.ageStatus,
          ageStatusSource: EMPLOYEE_SET_SOURCE,
          ageStatusSetAt: new Date(),
        },
        select: AGE_STATUS_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "AGE_STATUS_SET",
        resourceType: "DataPrincipal",
        resourceId: id,
        subjectPrincipalId: id,
        metadata: {
          ageStatus: updated.ageStatus,
          derivation: EMPLOYEE_SET_SOURCE,
        },
      });

      return updated;
    });
  }

  /**
   * CH-04/spec line 670's "age-status gaps": the count of principals this
   * org cannot yet classify as adult or child, surfaced prominently
   * because a company that cannot tell the two apart cannot satisfy s.9
   * at all. No endpoint elsewhere in the spec's own table (lines
   * 847-850) names a route for this figure, so it is exposed at
   * `GET /api/principals/age-status/unknown-count` -- reported in this
   * task's report as an addition beyond the spec's fixed table, guarded
   * by the same `CAN_MANAGE_CHILD_DATA` permission as the rest of the
   * `/app/children` page this number belongs to.
   */
  async countUnknown(): Promise<number> {
    return this.prisma.scoped.dataPrincipal.count({
      where: { ageStatus: "UNKNOWN" },
    });
  }
}
