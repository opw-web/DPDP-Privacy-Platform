import { Injectable, NotFoundException } from "@nestjs/common";
import type { SyncJob } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext } from "../../common/tenant/tenant-context";
import { DataSourcesService } from "../data-sources/data-sources.service";
import { SyncQueueService } from "../../queues/sync.queue";
import {
  DEFAULT_SYNC_JOB_LIST_LIMIT,
  MAX_SYNC_JOB_LIST_LIMIT,
} from "./dto/list-sync-jobs.dto";

export interface TriggerSyncResult {
  queued: true;
  dataSourceId: string;
}

/**
 * The HTTP-facing half of the sync feature: `POST /api/data-sources/:id/sync`
 * and `GET /api/sync-jobs[...]` (spec lines 811, 819-820). Never runs
 * pipeline logic itself -- that is `SyncPipelineService`'s job, invoked
 * only from `SyncProcessor` once BullMQ hands a job to a worker.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataSourcesService: DataSourcesService,
    private readonly syncQueueService: SyncQueueService,
  ) {}

  /**
   * `DataSourcesService.get` is the tenant-scoping check here: it throws
   * `NotFoundException` for a `dataSourceId` that does not belong to the
   * calling employee's organization, so a data source id from another
   * tenant never reaches `SyncQueueService.trigger` (and therefore never
   * reaches a BullMQ job payload) at all.
   */
  async triggerSync(dataSourceId: string): Promise<TriggerSyncResult> {
    await this.dataSourcesService.get(dataSourceId);
    const { actorId, actorLabel } = TenantContext.get();
    await this.syncQueueService.trigger(dataSourceId, actorId ?? actorLabel);
    return { queued: true, dataSourceId };
  }

  async listJobs(
    dataSourceId?: string,
    limit: number = DEFAULT_SYNC_JOB_LIST_LIMIT,
  ): Promise<SyncJob[]> {
    return this.prisma.scoped.syncJob.findMany({
      where: dataSourceId ? { dataSourceId } : undefined,
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, MAX_SYNC_JOB_LIST_LIMIT),
    });
  }

  async getJob(id: string): Promise<SyncJob> {
    const job = await this.prisma.scoped.syncJob.findFirst({ where: { id } });
    if (!job) {
      throw new NotFoundException(`Sync job "${id}" not found.`);
    }
    return job;
  }
}
