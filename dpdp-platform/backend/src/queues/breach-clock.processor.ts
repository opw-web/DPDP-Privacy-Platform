import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import type { TenantStore } from "../common/tenant/tenant-context";
import { BreachService } from "../modules/breaches/breach.service";

export const BREACH_CLOCK_QUEUE_NAME = "breach-clock";
export interface BreachClockJobData {
  triggeredBy?: string;
}
export interface BreachClockSummary {
  organizationsScanned: number;
  warningsSent: number;
  overdueMarked: number;
  principalNoticeDispatchesQueued: number;
}

/** Five-minute breach obligation scanner. Every tenant is isolated through TenantContext. */
@Processor(BREACH_CLOCK_QUEUE_NAME)
export class BreachClockProcessor extends WorkerHost {
  private readonly logger = new Logger(BreachClockProcessor.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly breachService: BreachService,
  ) {
    super();
  }

  async process(job: Job<BreachClockJobData>): Promise<BreachClockSummary> {
    void job;
    return this.runClockCycle();
  }

  async runClockCycle(now = new Date()): Promise<BreachClockSummary> {
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
    });
    const summary: BreachClockSummary = {
      organizationsScanned: 0,
      warningsSent: 0,
      overdueMarked: 0,
      principalNoticeDispatchesQueued: 0,
    };
    for (const organization of organizations) {
      const store: TenantStore = {
        organizationId: organization.id,
        actorType: "SYSTEM",
        actorId: null,
        actorLabel: "breach-clock",
      };
      try {
        const result = await TenantContext.run(store, () =>
          this.breachService.scanClock(now),
        );
        summary.organizationsScanned += 1;
        summary.warningsSent += result.warningsSent;
        summary.overdueMarked += result.overdueMarked;
        summary.principalNoticeDispatchesQueued +=
          result.principalNoticeDispatchesQueued;
      } catch (error) {
        this.logger.error(
          `breach-clock failed for organization "${organization.id}": ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
    return summary;
  }
}
