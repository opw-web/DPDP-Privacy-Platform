import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "../notification-provider.interface";

/**
 * The system of record. Spec line 768: "`PortalProvider` (always runs --
 * the portal record is the system of record)". `NotificationsService.send`
 * calls this UNCONDITIONALLY, before it even looks at
 * `input.emailAddress` -- there is no code path in this module that
 * skips writing this row. This is what makes "a data principal with no
 * email address still receives everything" true: the row this method
 * writes IS "everything" for that principal, full stop.
 *
 * Writes via `prisma.scoped`, so `organizationId` comes from
 * `TenantContext` exactly like every other tenant-scoped write in this
 * codebase -- never accepted as an input field here (see
 * `NotificationSendInput`'s docstring).
 */
@Injectable()
export class PortalProvider implements NotificationProvider {
  readonly channel = "PORTAL" as const;

  constructor(private readonly prisma: PrismaService) {}

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const notification = await this.prisma.scoped.notification.create({
      data: {
        audience: input.audience,
        employeeId: input.audience === "EMPLOYEE" ? (input.employeeId ?? null) : null,
        dataPrincipalId:
          input.audience === "PRINCIPAL" ? (input.dataPrincipalId ?? null) : null,
        title: input.title,
        body: input.body,
        severity: input.severity ?? "INFO",
        linkPath: input.linkPath ?? null,
        campaignId: input.campaignId ?? null,
        // organizationId deliberately omitted -- the tenant-scoping
        // extension supplies it at runtime (same convention as
        // EmployeesService.create / DataSourcesService.create).
      } as never,
    });
    return { channel: "PORTAL", delivered: true, notification };
  }
}
