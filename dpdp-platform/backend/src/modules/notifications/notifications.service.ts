import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Notification } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EMAIL_PROVIDER } from "./email-provider.factory";
import type { NotificationCallerActor } from "./guards/jwt-any-actor.guard";
import type {
  NotificationProvider,
  NotificationSendInput,
} from "./notification-provider.interface";
import { PortalProvider } from "./providers/portal.provider";

/**
 * The ONLY shape a `Notification` row is ever returned in from this
 * service. Mirrors `PURPOSE_PUBLIC_SELECT` in `purposes.service.ts`.
 */
export const NOTIFICATION_PUBLIC_SELECT = {
  id: true,
  audience: true,
  title: true,
  body: true,
  severity: true,
  linkPath: true,
  campaignId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_PUBLIC_SELECT;
}>;

export type PublicNotification = NotificationRow;

export function toPublicNotification(row: NotificationRow): PublicNotification {
  return row;
}

/** The `organizationId`-implicit (via `prisma.scoped`) ownership filter
 * shared by `list`, `markRead` and `markAllRead` -- shaped to hit
 * `Notification`'s own indexes: `@@index([organizationId, employeeId,
 * readAt])` / `@@index([organizationId, dataPrincipalId, readAt])`. */
function ownershipWhere(
  actor: NotificationCallerActor,
): Prisma.NotificationWhereInput {
  return actor.audience === "EMPLOYEE"
    ? { audience: "EMPLOYEE", employeeId: actor.employeeId! }
    : { audience: "PRINCIPAL", dataPrincipalId: actor.dataPrincipalId! };
}

/** How many rows `list()` returns -- polled every 20s (spec line 901);
 * kept small and fixed rather than paginated, matching the brief's "keep
 * it cheap" instruction. */
const LIST_LIMIT = 50;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portalProvider: PortalProvider,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: NotificationProvider,
  ) {}

  /**
   * The single method Tasks 6, 9, 11, 14 and 15 all call to send a
   * notification. Portal-first (spec line 768): `PortalProvider` runs
   * FIRST and UNCONDITIONALLY -- the row it writes is what this method
   * returns, and is the system of record regardless of what happens
   * next. The email channel (whichever of `SmtpProvider` /
   * `ConsoleProvider` `EMAIL_PROVIDER` resolved to) then runs
   * best-effort: a missing `emailAddress` is not an error (the provider
   * itself returns `NO_ADDRESS`, not a rejection), and any thrown
   * delivery failure is swallowed here rather than propagated -- the
   * portal delivery already succeeded and must not be undone or
   * reported as failed because SMTP hiccuped. A caller that needs to
   * KNOW whether the email channel succeeded (to record a per-recipient
   * suppression/delivery row of its own, e.g. `CampaignRecipient`) must
   * call the email provider itself rather than relying on this method's
   * return value, which only ever carries the portal result.
   */
  async send(input: NotificationSendInput): Promise<Notification> {
    if (input.audience === "EMPLOYEE" && !input.employeeId) {
      throw new Error(
        "NotificationsService.send(): employeeId is required when audience is EMPLOYEE",
      );
    }
    if (input.audience === "PRINCIPAL" && !input.dataPrincipalId) {
      throw new Error(
        "NotificationsService.send(): dataPrincipalId is required when audience is PRINCIPAL",
      );
    }

    const portalResult = await this.portalProvider.send(input);

    try {
      await this.emailProvider.send(input);
    } catch {
      // Deliberately swallowed -- see doc comment above. Portal delivery
      // has already succeeded; an SMTP failure must never appear to undo
      // or block it.
    }

    return portalResult.notification!;
  }

  async list(
    actor: NotificationCallerActor,
  ): Promise<{ items: PublicNotification[]; unreadCount: number }> {
    const where = ownershipWhere(actor);
    const [rows, unreadCount] = await Promise.all([
      this.prisma.scoped.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
        select: NOTIFICATION_PUBLIC_SELECT,
      }),
      this.prisma.scoped.notification.count({
        where: { ...where, readAt: null },
      }),
    ]);
    return { items: rows.map(toPublicNotification), unreadCount };
  }

  /** Idempotent: re-marking an already-read notification is a no-op
   * (200, unchanged row), not an error. A notification that does not
   * exist, or belongs to someone else, is a 404 -- never a 403, so this
   * response carries no signal about whether the id exists at all
   * outside the caller's own rows. */
  async markRead(
    id: string,
    actor: NotificationCallerActor,
  ): Promise<PublicNotification> {
    const where = ownershipWhere(actor);
    const existing = await this.prisma.scoped.notification.findFirst({
      where: { id, ...where },
      select: NOTIFICATION_PUBLIC_SELECT,
    });
    if (!existing) {
      throw new NotFoundException("Notification not found");
    }
    if (existing.readAt) {
      return toPublicNotification(existing);
    }
    const updated = await this.prisma.scoped.notification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
      select: NOTIFICATION_PUBLIC_SELECT,
    });
    return toPublicNotification(updated);
  }

  /** Marks only the caller's own unread rows read. Reading your own
   * notifications is not a state change worth auditing -- same
   * convention `EmployeeAuthController.me()` documents for reading your
   * own session -- so no `AuditService.record` call anywhere in this
   * file. */
  async markAllRead(actor: NotificationCallerActor): Promise<{ updated: number }> {
    const where = ownershipWhere(actor);
    const result = await this.prisma.scoped.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
