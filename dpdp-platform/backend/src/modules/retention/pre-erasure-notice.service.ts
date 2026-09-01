import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import {
  TenantContext,
  type TenantStore,
} from "../../common/tenant/tenant-context";
import { NotificationsService } from "../notifications/notifications.service";
import type { NotificationSendInput } from "../notifications/notification-provider.interface";
import { lockRetentionWorkflow } from "./retention-transaction-lock.util";

const PRE_ERASURE_NOTICE_ACTOR_LABEL = "pre-erasure-notice";

export interface PreErasureNoticeSummary {
  noticesSent: number;
  tasksCancelled: number;
}

/**
 * RE-05's exact three Rule 8(2) conditions -- named verbatim so the
 * notice body always states all three, not a paraphrase. Kept as a
 * function of `erasureDueAt` (not a module-level constant string) only
 * so the date is interpolated; the three conditions themselves never
 * vary per task.
 */
function buildPreErasureNoticeBody(erasureDueAt: Date | null): string {
  const dateText = erasureDueAt
    ? erasureDueAt.toISOString()
    : "the scheduled date";
  return (
    `Your personal data is scheduled to be erased on ${dateText} because it is ` +
    "no longer required for the purpose it was collected for. Under Rule 8(2) of " +
    "the Digital Personal Data Protection Rules, 2025, you can stop this before " +
    "that date by: (1) logging into your account, (2) contacting us for the " +
    "purpose your data was collected for, or (3) exercising your rights under " +
    "the Digital Personal Data Protection Act, 2023."
  );
}

function buildCancellationReason(channel: string): string {
  return (
    "Erasure cancelled under Rule 8(2): principal-initiated contact received " +
    `(channel: ${channel}) before the scheduled erasure date.`
  );
}

/**
 * The `pre-erasure-notice` job's domain logic (spec §4.6/RE-05, daily
 * 01:30). Same "plain injectable service the processor delegates to, so
 * an e2e test can call it directly" shape as `RetentionScanService`.
 *
 * `cancelOnContact` is what makes RE-05's "any of the three arriving
 * cancels the task" actually true in this codebase without this task
 * touching `src/modules/auth/**` (out of scope, another task's
 * directory): `principal-auth.service.ts` (MVP 1) already writes an
 * INBOUND `PrincipalContactEvent` on every portal login. This method
 * treats ANY INBOUND `PrincipalContactEvent` occurring after
 * `preErasureNoticeSentAt` as satisfying Rule 8(2) -- login, a recorded
 * inbound email/phone contact, or (once Wave 2's requests module writes
 * its own INBOUND contact event for a new `PrincipalRequest`, per that
 * task's own design) exercising a right -- rather than trying to
 * distinguish which of the three occurred from the channel alone, since
 * all three manifest as exactly this one signal.
 */
@Injectable()
export class PreErasureNoticeService {
  private readonly logger = new Logger(PreErasureNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async runForAllOrganizations(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
    });
    for (const org of orgs) {
      const store: TenantStore = {
        organizationId: org.id,
        actorType: "SYSTEM",
        actorId: null,
        actorLabel: PRE_ERASURE_NOTICE_ACTOR_LABEL,
      };
      try {
        await TenantContext.run(store, () => this.runForCurrentOrganization());
      } catch (err) {
        this.logger.error(
          `pre-erasure-notice failed for organization "${org.id}": ` +
            `${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }
  }

  /** Must be called inside a bound `TenantContext`. */
  async runForCurrentOrganization(): Promise<PreErasureNoticeSummary> {
    const now = new Date();
    const tasksCancelled = await this.cancelOnContact();
    const noticesSent = await this.sendDueNotices(now);
    return { noticesSent, tasksCancelled };
  }

  private async sendDueNotices(now: Date): Promise<number> {
    const due = await this.prisma.scoped.erasureTask.findMany({
      where: {
        state: "EVALUATED",
        preErasureNoticeDueAt: { lte: now },
        preErasureNoticeSentAt: null,
      },
      select: { id: true, dataPrincipalId: true, erasureDueAt: true },
    });

    let sent = 0;
    for (const task of due) {
      // Keep the advisory lock until the durable portal notification,
      // audited CAS transition and transaction commit. External email is
      // dispatched only after that commit, so rollback can never leave a
      // delivered message whose task/audit evidence did not persist.
      const committedNotification = await this.prisma.scoped.$transaction(
        async (tx) => {
          await lockRetentionWorkflow(tx, `erasure-task:${task.id}`);
          const current = await tx.erasureTask.findFirst({
            where: {
              id: task.id,
              state: "EVALUATED",
              preErasureNoticeDueAt: { lte: now },
              preErasureNoticeSentAt: null,
            },
            select: { dataPrincipalId: true, erasureDueAt: true },
          });
          if (!current) return false;

          const notificationInput: NotificationSendInput = {
            audience: "PRINCIPAL",
            dataPrincipalId: current.dataPrincipalId,
            title: "Your data is scheduled for erasure",
            body: buildPreErasureNoticeBody(current.erasureDueAt),
            severity: "WARNING",
            linkPath: "/me",
          };
          await this.notificationsService.createPortalInTransaction(
            tx,
            notificationInput,
          );
          const result = await tx.erasureTask.updateMany({
            where: {
              id: task.id,
              state: "EVALUATED",
              preErasureNoticeSentAt: null,
            },
            data: { state: "NOTICE_SENT", preErasureNoticeSentAt: now },
          });
          if (result.count !== 1) return false;
          await this.auditService.record(tx, {
            action: "ERASURE_TASK_PRE_ERASURE_NOTICE_SENT",
            resourceType: "ErasureTask",
            resourceId: task.id,
            subjectPrincipalId: current.dataPrincipalId,
            metadata: {
              fromState: "EVALUATED",
              toState: "NOTICE_SENT",
            },
          });
          return notificationInput;
        },
      );
      if (!committedNotification) {
        continue;
      }
      await this.notificationsService.deliverEmailBestEffort(
        committedNotification,
      );
      sent += 1;
    }
    return sent;
  }

  private async cancelOnContact(): Promise<number> {
    const noticed = await this.prisma.scoped.erasureTask.findMany({
      where: { state: "NOTICE_SENT" },
      select: { id: true, dataPrincipalId: true, preErasureNoticeSentAt: true },
    });

    let cancelled = 0;
    for (const task of noticed) {
      if (!task.preErasureNoticeSentAt) {
        continue;
      }
      const contact = await this.prisma.scoped.principalContactEvent.findFirst({
        where: {
          dataPrincipalId: task.dataPrincipalId,
          direction: "INBOUND",
          occurredAt: { gt: task.preErasureNoticeSentAt },
        },
        orderBy: { occurredAt: "desc" },
        select: { channel: true },
      });
      if (!contact) {
        continue;
      }

      const reason = buildCancellationReason(contact.channel);
      const transitioned = await this.prisma.scoped.$transaction(async (tx) => {
        await lockRetentionWorkflow(tx, `erasure-task:${task.id}`);
        const current = await tx.erasureTask.findFirst({
          where: {
            id: task.id,
            state: "NOTICE_SENT",
            preErasureNoticeSentAt: task.preErasureNoticeSentAt,
          },
          select: { dataPrincipalId: true },
        });
        if (!current) return false;
        const result = await tx.erasureTask.updateMany({
          where: {
            id: task.id,
            state: "NOTICE_SENT",
            preErasureNoticeSentAt: task.preErasureNoticeSentAt,
          },
          data: { state: "CANCELLED", cancelledReason: reason },
        });
        if (result.count !== 1) return false;
        await this.auditService.record(tx, {
          action: "ERASURE_TASK_CANCELLED",
          resourceType: "ErasureTask",
          resourceId: task.id,
          subjectPrincipalId: task.dataPrincipalId,
          metadata: {
            fromState: "NOTICE_SENT",
            toState: "CANCELLED",
            reason,
            channel: contact.channel,
          },
        });
        return true;
      });
      if (transitioned) cancelled += 1;
    }
    return cancelled;
  }
}
