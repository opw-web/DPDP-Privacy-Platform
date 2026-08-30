import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { SyncQueueService } from "./sync.queue";

/**
 * Task 18 review, Important 4+5: `DataSource.syncFrequency` (Postgres) is
 * authoritative; the BullMQ job-scheduler set (Redis) is a CACHE derived
 * from it. `DataSourcesService.create`/`update`/`remove` write that cache
 * best-effort (logged, never propagated -- see that service) precisely
 * BECAUSE this reconciliation exists to correct any drift between the two
 * on the next boot: a `scheduleSync` call that failed because Redis was
 * briefly unreachable, a `FLUSHDB`, or a restart of a Redis instance
 * without AOF/RDB persistence all leave Postgres correct and Redis wrong
 * (or empty) -- invisible to `/health` (which only checks connectivity,
 * not schedule correctness) and, left unreconciled, permanent.
 *
 * Runs once at application boot (`OnModuleInit`), across EVERY
 * organization's data sources -- this is why it reads via the RAW
 * (unscoped) `PrismaService` rather than `prisma.scoped`: there is no
 * single tenant to bind a `TenantContext` to for a startup task that must
 * see every tenant's rows. `DataSource`/`Organization` have no Prisma
 * relation between them (deliberately -- see `tenant.extension.ts`'s doc
 * comment on why a nested relation read would bypass tenant scoping), so
 * the join to each data source's organization timezone happens in
 * application code via a plain id-keyed map instead of a Prisma `include`.
 */
@Injectable()
export class ScheduleReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ScheduleReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncQueueService: SyncQueueService,
  ) {}

  /**
   * Never throws: a reconciliation failure at boot (Postgres or Redis
   * unreachable) must not prevent the rest of the application from
   * starting -- the same "self-heals, never a hard failure" property the
   * lock and the demoted `scheduleSync` call sites all share. The next
   * successful boot (or a subsequent `create`/`update` PATCH) reconciles
   * it again.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.reconcile();
    } catch (err) {
      this.logger.warn(
        `Sync schedule reconciliation failed at startup -- schedules may ` +
          `be stale until the next successful boot or data source save: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
      );
    }
  }

  async reconcile(): Promise<void> {
    const [dataSources, organizations] = await Promise.all([
      this.prisma.dataSource.findMany({
        select: { id: true, organizationId: true, syncFrequency: true },
      }),
      this.prisma.organization.findMany({
        select: { id: true, timezone: true },
      }),
    ]);
    const timezoneByOrganizationId = new Map(
      organizations.map((organization) => [
        organization.id,
        organization.timezone,
      ]),
    );

    for (const dataSource of dataSources) {
      const timezone = timezoneByOrganizationId.get(dataSource.organizationId);
      if (timezone === undefined) {
        this.logger.warn(
          `Data source "${dataSource.id}" references organization ` +
            `"${dataSource.organizationId}", which no longer exists -- ` +
            "skipping schedule reconciliation for it.",
        );
        continue;
      }
      try {
        await this.syncQueueService.upsertSchedule(
          dataSource.id,
          dataSource.syncFrequency,
          timezone,
        );
      } catch (err) {
        // One data source's reconciliation failing must not stop the
        // rest from being reconciled.
        this.logger.warn(
          `Failed to reconcile sync schedule for data source ` +
            `"${dataSource.id}": ${
              err instanceof Error ? err.message : "unknown error"
            }`,
        );
      }
    }
  }
}
