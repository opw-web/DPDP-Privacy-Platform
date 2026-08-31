import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext, type TenantStore } from "../../common/tenant/tenant-context";

/** `TenantContext.actorLabel` for every row this sweep writes -- unattended, never a specific employee (same convention as `RETENTION_SCAN_ACTOR_LABEL`). */
const CONSENT_BACKFILL_ACTOR_LABEL = "consent-backfill";

export interface ConsentBackfillSummary {
  organizationsScanned: number;
  recordsCreated: number;
}

/**
 * `consent-backfill`'s domain logic (spec §4.3, transcribed at task-10
 * brief: "`consent-backfill` creates `UNKNOWN` rows for every principal
 * when a consent purpose is created, and for every new principal").
 *
 * Neither "a consent purpose was created" nor "a principal was created"
 * is an event this task can observe directly -- `ProcessingPurpose` and
 * `DataPrincipal` are written by other modules this task does not own
 * (`purposes`, `data-sources`/`sync`, `principals`) and this task's
 * owned paths give it no hook into either of their write paths. Built
 * instead as a full reconciliation SWEEP, exactly the shape
 * `RetentionScanService`/`ScheduleReconciliationService` already
 * established for the identical problem ("some other module's write
 * needs a downstream side effect, and this task cannot safely hook that
 * module's code"): for every organization, for every ACTIVE
 * `CONSENT`-basis `ProcessingPurpose` x every `DataPrincipal`, ensure a
 * `ConsentRecord` row exists -- creating one at its schema default
 * (`status: UNKNOWN`, Global Constraint 9: never DENIED for missing
 * evidence) wherever it is missing. Idempotent: a pair that already has
 * a row is left untouched (never overwrites a real decision back to
 * UNKNOWN). Run at boot and on a repeatable schedule
 * (`ConsentBackfillQueueService`), AND callable directly by
 * `ConsentsService.getOrCreateRecord` lazily for the gap between "a row
 * was created/purpose added" and the next sweep.
 *
 * Kept a plain injectable service, separate from
 * `src/queues/consent-backfill.processor.ts`'s `WorkerHost`, so
 * `test/consents.e2e-spec.ts` can call `runForAllOrganizations()`
 * directly (Check 8: "immediately after backfill, before anyone
 * interacts") instead of waiting on BullMQ's cron scheduler.
 */
@Injectable()
export class ConsentBackfillService {
  private readonly logger = new Logger(ConsentBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runForAllOrganizations(): Promise<ConsentBackfillSummary> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    let recordsCreated = 0;
    for (const org of orgs) {
      const store: TenantStore = {
        organizationId: org.id,
        actorType: "SYSTEM",
        actorId: null,
        actorLabel: CONSENT_BACKFILL_ACTOR_LABEL,
      };
      try {
        recordsCreated += await TenantContext.run(store, () =>
          this.runForCurrentOrganization(),
        );
      } catch (err) {
        // One organization's sweep failing must not stop the rest --
        // same resilience `RetentionScanService`/`ScheduleReconciliationService`
        // apply per-organization/per-item.
        this.logger.warn(
          `consent-backfill sweep failed for organization "${org.id}": ` +
            `${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }
    return { organizationsScanned: orgs.length, recordsCreated };
  }

  /** Sweeps the CURRENT tenant context's organization only. Public so an e2e test (or a future ad-hoc trigger) can target one organization without iterating every tenant in the database. */
  async runForCurrentOrganization(): Promise<number> {
    const [purposes, principals, existing] = await Promise.all([
      this.prisma.scoped.processingPurpose.findMany({
        where: { lawfulBasis: "CONSENT", active: true },
        select: { id: true },
      }),
      this.prisma.scoped.dataPrincipal.findMany({ select: { id: true } }),
      this.prisma.scoped.consentRecord.findMany({
        select: { dataPrincipalId: true, purposeId: true },
      }),
    ]);
    if (purposes.length === 0 || principals.length === 0) {
      return 0;
    }

    const existingKeys = new Set(
      existing.map((r) => `${r.dataPrincipalId}::${r.purposeId}`),
    );

    const missing: { dataPrincipalId: string; purposeId: string }[] = [];
    for (const purpose of purposes) {
      for (const principal of principals) {
        const key = `${principal.id}::${purpose.id}`;
        if (!existingKeys.has(key)) {
          missing.push({ dataPrincipalId: principal.id, purposeId: purpose.id });
        }
      }
    }
    if (missing.length === 0) {
      return 0;
    }

    // `createMany` (not per-row `create`): a bulk gap-fill, and
    // `skipDuplicates` absorbs a concurrent writer (another sweep,
    // `ConsentsService.getOrCreateRecord`) racing to create the same
    // row -- never an error, never a second row (the schema's
    // `@@unique([dataPrincipalId, purposeId])` is the actual guarantee;
    // this just avoids this sweep itself throwing on the race).
    const result = await this.prisma.scoped.consentRecord.createMany({
      data: missing.map((m) => ({ ...m }) as never),
      skipDuplicates: true,
    });
    return result.count;
  }
}
