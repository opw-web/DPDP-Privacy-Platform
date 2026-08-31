import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { SyncService } from "./sync.service";
import { ListSyncJobsQueryDto } from "./dto/list-sync-jobs.dto";

/**
 * `POST /api/data-sources/:id/sync` (spec line 811). A second, unrelated
 * controller class rather than adding this route to
 * `DataSourcesController` (Task 12) -- NestJS merges routes from multiple
 * controllers sharing the same `@Controller("data-sources")` prefix, and
 * keeping the sync trigger's queue/lock concerns entirely inside the sync
 * module (rather than adding a `SyncQueueService` dependency to Task 12's
 * already-large `DataSourcesController`/`DataSourcesService`) is the
 * narrower change.
 */
@ApiTags("sync")
@Controller("data-sources")
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post(":id/sync")
  @RequirePermission("CAN_RUN_SYNC")
  @HttpCode(202)
  trigger(@Param("id") id: string) {
    return this.syncService.triggerSync(id);
  }
}

/** `GET /api/sync-jobs[?dataSourceId=&limit=]` and `GET /api/sync-jobs/:id` (spec lines 819-820). */
@ApiTags("sync")
@Controller("sync-jobs")
export class SyncJobsController {
  constructor(private readonly syncService: SyncService) {}

  @Get()
  @RequirePermission("CAN_RUN_SYNC")
  list(@Query() query: ListSyncJobsQueryDto) {
    return this.syncService.listJobs(query.dataSourceId, query.limit);
  }

  @Get(":id")
  @RequirePermission("CAN_RUN_SYNC")
  get(@Param("id") id: string) {
    return this.syncService.getJob(id);
  }
}
