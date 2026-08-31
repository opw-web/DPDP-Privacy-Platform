import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import type { TenantStore } from "../common/tenant/tenant-context";
import { RequestsService } from "../modules/requests/requests.service";
import type { DeadlineScanOrgResult } from "../modules/requests/requests.service";
import { DEADLINE_SCAN_ACTOR_LABEL } from "../modules/requests/requests.constants";
import { DEADLINE_SCAN_QUEUE_NAME } from "./deadline-scan.queue";
import type { DeadlineScanJobData } from "./deadline-scan.queue";

export interface DeadlineScanSummary {
  organizationsScanned: number;
  warningsSent: number;
  overdueMarked: number;
  escalated: number;
}

/**
 * The BullMQ worker side of the `deadline-scan` queue. Unlike `sync`
 * (triggered per data source, which already carries its own
 * `organizationId`), `deadline-scan` is a single GLOBAL job that must
 * walk every organization itself -- there is no per-tenant job payload.
 *
 * The one RAW (unscoped) `PrismaService` read in this whole task --
 * `organization.findMany({ select: { id: true } })` -- exists for
 * exactly this reason: establishing which tenants exist at all, the same
 * ruling `SyncPipelineService.run()` documents for its own single
 * unscoped read. Every actual scan query after that goes through
 * `RequestsService`'s `prisma.scoped`, resolved against the
 * `TenantContext` this class binds per organization.
 *
 * Declared as a provider of `RequestsModule` (physically filed under
 * `src/queues/` alongside the rest of the BullMQ plumbing) -- same
 * reasoning `SyncProcessor`'s doc comment gives for living in
 * `SyncModule` rather than `QueuesModule`: it needs `RequestsService` in
 * scope, and putting it there avoids a circular import.
 *
 * `runScanCycle()` is the actual work, callable directly (bypassing
 * BullMQ) -- this is what `test/requests.e2e-spec.ts`'s Check 5 calls
 * four times in a row rather than waiting on real 15-minute cron ticks.
 * `process()` is the BullMQ entry point and does nothing but delegate to
 * it, so the real queued path and the test path run identical code.
 */
@Processor(DEADLINE_SCAN_QUEUE_NAME)
export class DeadlineScanProcessor extends WorkerHost {
  private readonly logger = new Logger(DeadlineScanProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: RequestsService,
  ) {
    super();
  }

  async process(_job: Job<DeadlineScanJobData>): Promise<DeadlineScanSummary> {
    return this.runScanCycle();
  }

  async runScanCycle(now: Date = new Date()): Promise<DeadlineScanSummary> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    const summary: DeadlineScanSummary = {
      organizationsScanned: 0,
      warningsSent: 0,
      overdueMarked: 0,
      escalated: 0,
    };

    for (const org of orgs) {
      const store: TenantStore = {
        organizationId: org.id,
        actorType: "SYSTEM",
        actorId: null,
        actorLabel: DEADLINE_SCAN_ACTOR_LABEL,
      };
      try {
        const result: DeadlineScanOrgResult = await TenantContext.run(store, () =>
          this.requestsService.scanOrgDeadlines(now),
        );
        summary.organizationsScanned += 1;
        summary.warningsSent += result.warningsSent;
        summary.overdueMarked += result.overdueMarked;
        summary.escalated += result.escalated;
      } catch (err) {
        // One organization's failure must never abort the scan for every
        // other tenant -- logged and skipped, matching
        // `ScheduleReconciliationService`'s per-item error isolation.
        this.logger.error(
          `deadline-scan failed for organization "${org.id}": ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        );
      }
    }

    return summary;
  }
}
