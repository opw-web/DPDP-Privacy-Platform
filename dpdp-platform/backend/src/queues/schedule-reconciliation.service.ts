import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { SyncQueueService } from "./sync.queue";

/**
 * Bounds how long application boot will wait for reconciliation before
 * giving up and letting the rest of the app start anyway (task 18 review
 * round 2, Important 2). Not a statutory number -- an operational
 * safety valve -- but named per this codebase's "no bare literals"
 * convention regardless.
 */
export const RECONCILE_BOOT_TIMEOUT_MS = 5_000;

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
   * Never blocks application boot beyond `RECONCILE_BOOT_TIMEOUT_MS`, and
   * never throws out of boot at all (task 18 review round 2, Important
   * 2): `reconcile()` calls `SyncQueueService.upsertSchedule`, which
   * (via BullMQ's `Queue`) issues commands over a connection built with
   * `maxRetriesPerRequest: null` -- REQUIRED for BullMQ's own
   * Queue/Worker connections, but it also means that if Redis is
   * unreachable while Postgres is perfectly healthy, that command never
   * fails and never times out on its own; it sits in ioredis's offline
   * command queue forever (confirmed against ioredis's own connection
   * handling: the queue is only ever flushed once `maxRetriesPerRequest`
   * is a NUMBER, never for `null`). Without a bound here, `onModuleInit`
   * -- which Nest's bootstrap sequence AWAITS for every module before the
   * app can start listening -- would simply never resolve, so `/health`
   * could never even report the outage. `withTimeout` below races
   * `reconcile()` against a plain timer: on timeout, boot proceeds
   * immediately and this warns; `reconcile()`'s promise itself is left
   * running in the background (harmless -- `upsertSchedule` is
   * idempotent, so a very-late completion once Redis recovers is a
   * correct, if delayed, reconciliation, never a duplicate or a stale
   * overwrite).
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.withTimeout(this.reconcile(), RECONCILE_BOOT_TIMEOUT_MS);
    } catch (err) {
      this.logger.warn(
        "Sync schedule reconciliation did not complete at startup " +
          `(timed out after ${RECONCILE_BOOT_TIMEOUT_MS}ms, or failed) -- ` +
          "continuing to boot regardless; schedules may be stale until " +
          `the next successful reconciliation or data source save: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
      );
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Reconciliation exceeded its ${timeoutMs}ms startup budget`,
          ),
        );
      }, timeoutMs);
      // Never keep the process alive solely to fire this timeout -- boot
      // either finishes first (clearing it below) or the timeout itself
      // decides the race; either way this timer must not block process
      // exit.
      timer.unref?.();
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
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
