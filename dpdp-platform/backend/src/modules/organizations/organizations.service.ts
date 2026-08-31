import { Injectable } from "@nestjs/common";
import type { Organization } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext } from "../../common/tenant/tenant-context";
import { AuditService } from "../../common/audit/audit.service";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";

const SDF_FIELD_NAMES = [
  "isSignificantDataFiduciary",
  "sdfNotifiedAt",
  "sdfNotificationRef",
] as const;
const THIRD_SCHEDULE_FIELD_NAMES = [
  "thirdScheduleClass",
  "registeredUserCount",
] as const;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async get(): Promise<Organization> {
    return this.prisma.scoped.organization.findFirstOrThrow();
  }

  /**
   * Splits the incoming DTO into three buckets and writes one audit event
   * per non-empty bucket, all inside the same transaction as the update
   * itself. The Third Schedule bucket additionally stamps
   * `classDeclaredByEmployeeId` / `classDeclaredAt` on the row -- the
   * platform never infers this classification, so the row itself, not
   * just the audit log, records who declared it and when (spec: "no
   * inference").
   */
  async update(dto: UpdateOrganizationDto): Promise<Organization> {
    const { organizationId, actorId } = TenantContext.get();

    const sdfChanges: Record<string, unknown> = {};
    for (const field of SDF_FIELD_NAMES) {
      if (dto[field] !== undefined) {
        sdfChanges[field] =
          field === "sdfNotifiedAt"
            ? new Date(dto[field] as string)
            : dto[field];
      }
    }

    const thirdScheduleChanges: Record<string, unknown> = {};
    if (dto.thirdScheduleClass !== undefined) {
      thirdScheduleChanges["thirdScheduleClass"] = dto.thirdScheduleClass;
    }
    if (dto.registeredUserCount !== undefined) {
      thirdScheduleChanges["registeredUserCount"] = BigInt(
        dto.registeredUserCount,
      );
    }

    const generalChanges: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      if (
        (SDF_FIELD_NAMES as readonly string[]).includes(key) ||
        (THIRD_SCHEDULE_FIELD_NAMES as readonly string[]).includes(key)
      ) {
        continue;
      }
      generalChanges[key] = value;
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const data: Record<string, unknown> = { ...generalChanges };
      if (Object.keys(sdfChanges).length > 0) {
        Object.assign(data, sdfChanges);
      }
      if (Object.keys(thirdScheduleChanges).length > 0) {
        Object.assign(data, thirdScheduleChanges, {
          classDeclaredByEmployeeId: actorId,
          classDeclaredAt: new Date(),
        });
      }

      const updated = await tx.organization.update({
        where: { id: organizationId },
        data,
      });

      if (Object.keys(sdfChanges).length > 0) {
        await this.auditService.record(tx, {
          action: "SDF_STATUS_DECLARED",
          resourceType: "Organization",
          resourceId: organizationId,
          metadata: {
            isSignificantDataFiduciary: sdfChanges[
              "isSignificantDataFiduciary"
            ] as boolean | undefined,
            sdfNotifiedAt: sdfChanges["sdfNotifiedAt"] as Date | undefined,
            sdfNotificationRef: sdfChanges["sdfNotificationRef"] as
              string | undefined,
          },
        });
      }

      if (Object.keys(thirdScheduleChanges).length > 0) {
        await this.auditService.record(tx, {
          action: "THIRD_SCHEDULE_CLASS_DECLARED",
          resourceType: "Organization",
          resourceId: organizationId,
          metadata: {
            thirdScheduleClass: thirdScheduleChanges["thirdScheduleClass"] as
              string | undefined,
            registeredUserCount:
              thirdScheduleChanges["registeredUserCount"] !== undefined
                ? String(thirdScheduleChanges["registeredUserCount"])
                : undefined,
            declaredByEmployeeId: actorId,
          },
        });
      }

      if (Object.keys(generalChanges).length > 0) {
        await this.auditService.record(tx, {
          action: "ORG_SETTINGS_UPDATED",
          resourceType: "Organization",
          resourceId: organizationId,
          metadata: { changedFields: Object.keys(generalChanges) },
        });
      }

      return updated;
    });
  }
}
