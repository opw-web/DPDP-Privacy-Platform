import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { DataSourcesModule } from "../data-sources/data-sources.module";
import { NormalizationModule } from "../normalization/normalization.module";
import { IdentityModule } from "../identity/identity.module";
import { QueuesModule } from "../../queues/queues.module";
import { SyncProcessor } from "../../queues/sync.processor";
import { SyncController, SyncJobsController } from "./sync.controller";
import { SyncService } from "./sync.service";
import { SyncPipelineService } from "./sync-pipeline.service";

/**
 * Wires the sync feature together: the HTTP surface (`SyncController` /
 * `SyncJobsController` / `SyncService`), the pipeline itself
 * (`SyncPipelineService`), and the BullMQ worker that drives it
 * (`SyncProcessor`, physically filed under `src/queues/` alongside the
 * rest of the queue plumbing -- see that class's doc comment for why it
 * is registered as a provider HERE rather than in `QueuesModule`).
 */
@Module({
  imports: [
    AuditModule,
    DataSourcesModule,
    NormalizationModule,
    IdentityModule,
    QueuesModule,
  ],
  controllers: [SyncController, SyncJobsController],
  providers: [SyncService, SyncPipelineService, SyncProcessor],
  exports: [SyncPipelineService],
})
export class SyncModule {}
