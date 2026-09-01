import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { TenantContext, type TenantStore } from "../common/tenant/tenant-context";
import { AuditChainService } from "../modules/evidence/audit-chain.service";
import { NotificationsService } from "../modules/notifications/notifications.service";

export const AUDIT_CHAIN_VERIFY_QUEUE_NAME = "audit-chain-verify";
export const ACCESS_LOG_RETENTION_QUEUE_NAME = "access-log-retention";
export interface AuditChainVerifyJobData { triggeredBy: string; }
export interface AuditChainVerifySummary { organizationsScanned: number; brokenChains: number; notificationsSent: number; }

/** Daily audit-chain check. Each tenant is verified and notified independently. */
@Processor(AUDIT_CHAIN_VERIFY_QUEUE_NAME)
export class AuditChainVerifyProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditChainVerifyProcessor.name);
  constructor(private readonly prisma: PrismaService, private readonly auditChainService: AuditChainService, private readonly notificationsService: NotificationsService) { super(); }
  async process(_job: Job<AuditChainVerifyJobData>): Promise<AuditChainVerifySummary> { return this.runVerificationCycle(); }
  async runVerificationCycle(): Promise<AuditChainVerifySummary> {
    const organizations = await this.prisma.organization.findMany({ select: { id: true } });
    const summary: AuditChainVerifySummary = { organizationsScanned: 0, brokenChains: 0, notificationsSent: 0 };
    for (const organization of organizations) {
      const store: TenantStore = { organizationId: organization.id, actorType: "SYSTEM", actorId: null, actorLabel: "audit-chain-verify" };
      try {
        const result = await TenantContext.run(store, () => this.auditChainService.verifyChain());
        summary.organizationsScanned += 1;
        if (result.valid) continue;
        summary.brokenChains += 1;
        const admins = await TenantContext.run(store, () => this.prisma.scoped.employee.findMany({ where: { status: "ACTIVE", role: { code: "ADMIN" } }, select: { id: true } }));
        await TenantContext.run(store, async () => {
          await Promise.all(admins.map((admin) => this.notificationsService.send({ audience: "EMPLOYEE", employeeId: admin.id, severity: "CRITICAL", title: "Audit chain verification failed", body: `The audit chain failed verification at sequence ${result.firstBrokenSequence ?? "unknown"}: ${result.reason ?? "unknown reason"}. Investigate immediately.`, linkPath: "/app/audit" })));
        });
        summary.notificationsSent += admins.length;
      } catch (error) {
        this.logger.error(`audit-chain-verify failed for organization "${organization.id}": ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    return summary;
  }
}
