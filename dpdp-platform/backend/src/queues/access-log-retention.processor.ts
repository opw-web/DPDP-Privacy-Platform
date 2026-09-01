import { ConfigService } from "@nestjs/config";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { subDays } from "date-fns";
import { PrismaService } from "../common/prisma/prisma.service";
import type { AppConfig } from "../config/configuration";
import { ACCESS_LOG_RETENTION_FLOOR_DAYS } from "../config/access-log-retention.constant";
import { ACCESS_LOG_RETENTION_QUEUE_NAME } from "./audit-chain-verify.processor";

export { ACCESS_LOG_RETENTION_QUEUE_NAME } from "./audit-chain-verify.processor";
export interface AccessLogRetentionJobData { triggeredBy: string; }
export interface AccessLogRetentionSummary { deleted: number; cutoff: Date; }

/**
 * Enforces the configured Rule 6(1)(e) floor without weakening the
 * append-only AuditEvent evidence chain. Only AccessLogEntry projection rows
 * are purged; the source AuditEvent rows remain available for chain
 * verification forever.
 */
@Processor(ACCESS_LOG_RETENTION_QUEUE_NAME)
export class AccessLogRetentionProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService, configService: ConfigService) { super(); this.accessLogRetentionDays = configService.get<AppConfig>("app")?.accessLogRetentionDays ?? ACCESS_LOG_RETENTION_FLOOR_DAYS; }
  private readonly accessLogRetentionDays: number;
  async process(_job: Job<AccessLogRetentionJobData>): Promise<AccessLogRetentionSummary> { return this.runRetention(); }
  async runRetention(now = new Date()): Promise<AccessLogRetentionSummary> {
    if (this.accessLogRetentionDays < ACCESS_LOG_RETENTION_FLOOR_DAYS) throw new Error(`ACCESS_LOG_RETENTION_DAYS=${this.accessLogRetentionDays} is below the Rule 6(1)(e) minimum of ${ACCESS_LOG_RETENTION_FLOOR_DAYS} days; refusing access-log retention.`);
    const cutoff = subDays(now, this.accessLogRetentionDays);
    // Keep a compatibility branch for the small unit double used by the
    // original scheduled-jobs test, which predates AccessLogEntry. Real
    // PrismaService instances always expose the projection delegate.
    const projection = (this.prisma as PrismaService & {
      accessLogEntry?: {
        deleteMany(args: unknown): Promise<{ count: number }>;
      };
    }).accessLogEntry;
    if (!projection) {
      const legacy = await this.prisma.auditEvent.findFirst({
        where: { action: "PERSONAL_DATA_VIEWED", createdAt: { lt: cutoff } },
        select: { id: true },
      });
      if (legacy) {
        throw new Error(
          "Expired PERSONAL_DATA_VIEWED audit events cannot be purged safely " +
            "without the AccessLogEntry projection.",
        );
      }
      return { deleted: 0, cutoff };
    }
    const result = await projection.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });
    return { deleted: result.count, cutoff };
  }
}
