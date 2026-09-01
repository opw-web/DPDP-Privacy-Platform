import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { SyncQueueService } from "./sync.queue";
import { BootRegistrationRegistry } from "./boot-registration.registry";
import { Mvp2ScheduleReconciliationService } from "./mvp2-schedules";

// `RECONCILE_BOOT_TIMEOUT_MS` / `withBootTimeout` moved to
// `boot-timeout.util.ts` (still the ONE named boot-safety budget in this
// codebase) so `BootRegistrationRegistry` can import them without a
// circular dependency on this file. Re-exported here for backward
// compatibility with any existing import of either name from this
// module.
export { RECONCILE_BOOT_TIMEOUT_MS, withBootTimeout } from "./boot-timeout.util";

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
 * BIDIRECTIONAL (task 18 review round 2, Important 3): reconciliation
 * both (a) ensures every current `DataSource` row has the schedule its
 * `syncFrequency` implies, AND (b) removes any registered scheduler whose
 * `DataSource` no longer exists at all. (a) alone left a real gap: a data
 * source deleted during a Redis blip (`DataSourcesService`'s
 * `removeScheduleBestEffort` swallows that failure, per Important 4+5)
 * would leave an orphaned scheduler firing forever -- every tick throwing
 * `NotFoundException` for a row that no longer exists -- with no boot
 * ever able to notice, since a reconciliation that only ever walks
 * CURRENT `DataSource` rows never looks at what Redis is doing for a row
 * that is already gone.
 *
 * Runs once at application boot, across EVERY organization's data
 * sources -- this is why it reads via the RAW (unscoped) `PrismaService`
 * rather than `prisma.scoped`: there is no single tenant to bind a
 * `TenantContext` to for a startup task that must see every tenant's
 * rows. `DataSource`/`Organization` have no Prisma relation between them
 * (deliberately -- see `tenant.extension.ts`'s doc comment on why a
 * nested relation read would bypass tenant scoping), so the join to each
 * data source's organization timezone happens in application code via a
 * plain id-keyed map instead of a Prisma `include`.
 *
 * Registers itself with `BootRegistrationRegistry` from its OWN
 * constructor rather than awaiting `reconcile()` in its own
 * `onModuleInit` (an earlier version of this class did exactly that,
 * individually bounded by `withBootTimeout` -- correct in isolation, but
 * once four more queue modules each did the same thing, Nest's
 * sequential per-module `onModuleInit` await turned five independently-
 * bounded budgets into one worst-case boot time that summed all of them).
 * See `BootRegistrationRegistry`'s doc comment for the shared,
 * once-only, concurrent budget this class now participates in instead.
 */
@Injectable()
export class ScheduleReconciliationService {
  private readonly logger = new Logger(ScheduleReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncQueueService: SyncQueueService,
    private readonly mvp2ScheduleReconciliationService: Mvp2ScheduleReconciliationService,
    bootRegistrations: BootRegistrationRegistry,
  ) {
    bootRegistrations.register("Sync schedule reconciliation", () =>
      this.reconcileAtBoot(),
    );
  }

  /**
   * Never throws out of boot (task 18 review round 2, Important 2):
   * `reconcile()` calls `SyncQueueService.upsertSchedule`, which (via
   * BullMQ's `Queue`) issues commands over a connection built with
   * `maxRetriesPerRequest: null` -- REQUIRED for BullMQ's own
   * Queue/Worker connections, but it also means that if Redis is
   * unreachable while Postgres is perfectly healthy, that command never
   * fails and never times out on its own; it sits in ioredis's offline
   * command queue forever (confirmed against ioredis's own connection
   * handling: the queue is only ever flushed once `maxRetriesPerRequest`
   * is a NUMBER, never for `null`). This is exactly why this thunk is
   * registered with `BootRegistrationRegistry` rather than awaited
   * directly: that registry races the WHOLE batch of every queue
   * module's thunk against one shared `RECONCILE_BOOT_TIMEOUT_MS` budget,
   * so `/health` can always report the outage even if `reconcile()`
   * itself never settles in time. On failure this warns and lets boot
   * continue regardless; `reconcile()`'s promise itself is left running
   * in the background if still pending (harmless -- `upsertSchedule` is
   * idempotent, so a very-late completion once Redis recovers is a
   * correct, if delayed, reconciliation, never a duplicate or a stale
   * overwrite).
   */
  private async reconcileAtBoot(): Promise<void> {
    try {
      await Promise.all([
        this.reconcile(),
        this.mvp2ScheduleReconciliationService.reconcile(),
      ]);
    } catch (err) {
      this.logger.warn(
        "Sync schedule reconciliation did not complete at startup -- " +
          "continuing to boot regardless; schedules may be stale until " +
          `the next successful reconciliation or data source save: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
      );
    }
  }

  async reconcile(): Promise<void> {
    // I-4 / T-1 (final whole-branch review, and already flagged
    // MUST-FIX-BEFORE-MERGE in the triage): the Redis snapshot MUST be
    // read BEFORE the Postgres snapshot, not concurrently. A data
    // source's row is always committed to Postgres BEFORE its schedule
    // is written to Redis (`DataSourcesService.scheduleSync`'s doc
    // comment: "Called AFTER the owning create/update transaction has
    // already committed"). Reading Redis first therefore guarantees that
    // any scheduler this call can see already has its owning row
    // committed by the time the Postgres read below runs -- so a data
    // source created concurrently with this reconciliation either (a)
    // has not registered its scheduler yet, and so is simply absent from
    // BOTH snapshots this run (a missed orphan-check for it, corrected
    // next run), or (b) has registered its scheduler AND already
    // committed its row, so it appears in both. The reverse order (the
    // old code) could observe the row commit and the Redis write in
    // between its two reads, wrongly seeing the schedule but not yet the
    // row, and the backward pass below would then PERMANENTLY prune a
    // live customer's just-created schedule -- strictly worse than the
    // stale-Redis-key case this ordering costs (`progress.md:475`).
    const scheduledDataSourceIds =
      await this.syncQueueService.listScheduledDataSourceIds();
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
    const currentDataSourceIds = new Set(
      dataSources.map((dataSource) => dataSource.id),
    );

    // Forward: every CURRENT data source's schedule matches its syncFrequency.
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

    // Backward (Important 3): remove any scheduler whose DataSource is GONE.
    for (const scheduledDataSourceId of scheduledDataSourceIds) {
      if (currentDataSourceIds.has(scheduledDataSourceId)) {
        continue;
      }
      try {
        await this.syncQueueService.removeSchedule(scheduledDataSourceId);
      } catch (err) {
        this.logger.warn(
          "Failed to prune an orphaned sync schedule for deleted data " +
            `source "${scheduledDataSourceId}": ${
              err instanceof Error ? err.message : "unknown error"
            }`,
        );
      }
    }
  }
}
