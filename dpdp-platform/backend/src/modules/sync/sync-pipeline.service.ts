import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma, SyncStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { AuditService } from "../../common/audit/audit.service";
import {
  TenantContext,
  type TenantStore,
} from "../../common/tenant/tenant-context";
import { DataSourcesService } from "../data-sources/data-sources.service";
import { NormalizationService } from "../normalization/normalization.service";
import type { NormalizationMapping } from "../normalization/normalization.service";
import {
  buildCandidateSignals,
  MatchingService,
} from "../identity/matching.service";
import { LinkingService } from "../identity/linking.service";
import { AssemblyService } from "../identity/assembly.service";
import { AgeService } from "../identity/age.service";
import {
  lockIdentifiersForOwnership,
  lockNameKeyForOwnership,
} from "../identity/identifier-ownership-lock";
import { hashPayload } from "./payload-hash";
import {
  describeSyncError,
  MissingRecordKeyError,
  SyncLockUnavailableError,
} from "./sync-error";
import { SyncLockService } from "../../queues/sync-lock.service";

/** `TenantContext.actorLabel` for every write this pipeline makes -- never a specific employee, since the run itself is unattended (spec: "runs in a SYSTEM tenant context"). */
const SYNC_ACTOR_LABEL = "sync-pipeline";

interface SyncCounts {
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  principalsCreated: number;
  principalsLinked: number;
  candidatesRaised: number;
}

function zeroCounts(): SyncCounts {
  return {
    recordsRead: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    recordsFailed: 0,
    principalsCreated: 0,
    principalsLinked: 0,
    candidatesRaised: 0,
  };
}

/**
 * One entry per FETCH-stage failure (the whole run could not proceed) or
 * per-record failure (this one record was skipped, the run continues).
 * NEVER carries a record's payload or field values -- see
 * `sync-error.ts`'s doc comment for why `message` is only ever populated
 * for a vetted-safe error class.
 */
type SyncErrorLogEntry =
  | {
      scope: "FETCH";
      errorClass: string;
      message?: string;
      at: string;
    }
  | {
      scope: "RECORD";
      recordKey: string | null;
      errorClass: string;
      message?: string;
      at: string;
    };

export interface SyncRunSummary extends SyncCounts {
  syncJobId: string;
  status: SyncStatus;
}

/**
 * A single record fetched off the wire has no guaranteed shape until it is
 * confirmed to be a JSON object -- this pipeline's ONLY assumption about a
 * raw connector record before extracting its key.
 */
function extractRecordKey(
  raw: unknown,
  externalIdField: string,
): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const value = (raw as Record<string, unknown>)[externalIdField];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // An object/array external id is not a usable key -- never silently
  // JSON.stringify it in, since a caller-controlled key that can grow
  // without bound is exactly the wrong shape for a unique-index column.
  return null;
}

interface RecordContext {
  dataSourceId: string;
  externalIdField: string;
  organizationCountry: string | null;
  mappings: readonly NormalizationMapping[];
}

/**
 * Executes spec §2.8's sync pipeline end to end for one data source:
 * FETCH -> PERSIST -> NORMALIZE -> MATCH -> LINK -> ASSEMBLE -> AGE ->
 * AUDIT. The only entry point is `run()` -- called by `SyncProcessor`
 * (src/queues/sync.processor.ts) for both ad-hoc and repeatable jobs, and
 * directly by tests that want deterministic pipeline behaviour without
 * going through BullMQ.
 *
 * PER-SOURCE LOCK (task 18 review, Critical 1; reordered in round 2,
 * Important 1): the very first thing `runInTenantContext` does -- BEFORE
 * any `SyncJob` row or `SYNC_STARTED` audit exists, manual or scheduled
 * run, no distinction, since this is the one code path both kinds of job
 * pass through -- is acquire `SyncLockService`'s Redis mutex for this
 * `dataSourceId`. If that fails (another run genuinely holds it right
 * now), this method THROWS `SyncLockUnavailableError` immediately,
 * before touching Postgres at all: no `SyncJob` row is created, so there
 * is nothing to strand as a permanently `RUNNING` row, and no
 * `FAILED`/`SYNC_FAILED` entry is written for what is often just a
 * healthy overlap (an `EVERY_15_MIN` source whose runs legitimately take
 * longer than 15 minutes would otherwise paint `GET /api/sync-jobs` red
 * on every single tick, forever, for a source that is working fine).
 * Once acquired, the lock is released in a `finally` covering the entire
 * rest of the run, so it is freed whether the run succeeds, partially
 * fails, or fails outright -- this is what makes "one sync per source at
 * a time" true even for two overlapping schedule ticks or a manual
 * trigger racing a scheduled run, neither of which a BullMQ-job-id-keyed
 * check alone can see (see `SyncQueueService.trigger`'s doc comment).
 *
 * PARTIAL vs FAILED: a per-record failure (bad/missing key, a matching or
 * linking error for that one record) is caught, logged to `errorLog`, and
 * the loop continues -- the run ends `PARTIAL` if any such failure
 * occurred, `SUCCESS` otherwise. `FAILED` is reserved for a run that DID
 * create a `SyncJob` row but could not proceed AT ALL from there, which
 * this code treats as exactly "zero records were ever read": building
 * the connector, or any page's `fetchRecords` call, throwing before a
 * single record was read. If the SAME kind of failure happens after some
 * records were already read and persisted from earlier pages, the run is
 * `PARTIAL` instead (task 18 review, Important 6) -- a run that fetched
 * several pages and persisted thousands of records before breaking on a
 * later page plainly did proceed, and reporting it `FAILED` would tell an
 * operator reading `GET /api/sync-jobs` that nothing happened when most
 * of it did. Either way, once FETCH fails the loop stops entirely --
 * there is no "skip this page and try the next" for a connector-level
 * failure, since a failed page also breaks pagination (the next page's
 * cursor is unknown).
 */
@Injectable()
export class SyncPipelineService {
  private readonly logger = new Logger(SyncPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataSourcesService: DataSourcesService,
    private readonly normalizationService: NormalizationService,
    private readonly matchingService: MatchingService,
    private readonly linkingService: LinkingService,
    private readonly assemblyService: AssemblyService,
    private readonly ageService: AgeService,
    private readonly auditService: AuditService,
    private readonly syncLockService: SyncLockService,
  ) {}

  /**
   * `dataSourceId` arrives here from a BullMQ job payload read out of
   * Redis -- data OUTSIDE any request context, and therefore, per this
   * plan's tenant-isolation rule, not trusted as belonging to any
   * organization until verified. The RAW (unscoped) `PrismaService` read
   * below is the ONLY unscoped read in this whole pipeline, and it reads
   * ONLY `organizationId` for the sole purpose of establishing the
   * correct `TenantContext` -- every other read and write in this run
   * goes through `prisma.scoped`/a scoped transaction, resolved against
   * THIS `organizationId`, so a caller-supplied id for a data source that
   * does not exist resolves to "not found", never to another
   * organization's data.
   */
  async run(
    dataSourceId: string,
    triggeredBy: string,
  ): Promise<SyncRunSummary> {
    const dataSourceRow = await this.prisma.dataSource.findUnique({
      where: { id: dataSourceId },
      select: { organizationId: true },
    });
    if (!dataSourceRow) {
      throw new NotFoundException(`Data source "${dataSourceId}" not found.`);
    }
    const store: TenantStore = {
      organizationId: dataSourceRow.organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: SYNC_ACTOR_LABEL,
    };
    return TenantContext.run(store, () =>
      this.runInTenantContext(dataSourceId, triggeredBy),
    );
  }

  private async runInTenantContext(
    dataSourceId: string,
    triggeredBy: string,
  ): Promise<SyncRunSummary> {
    // Task 18 review round 2, Important 1: the lock is acquired BEFORE
    // anything is written to Postgres, not merely inside the run's own
    // try/finally. If another run genuinely holds this source's lock
    // right now (manual or scheduled), this run creates NO `SyncJob` row
    // and NO `SYNC_STARTED` audit at all -- there is nothing to strand
    // as a permanently `RUNNING` row, and nothing to paint `GET
    // /api/sync-jobs` red with a `FAILED`/`SYNC_FAILED` entry for a
    // source that is simply mid-run on an overlapping tick (an
    // `EVERY_15_MIN` source whose runs legitimately take longer than 15
    // minutes would otherwise accumulate one of these on every single
    // overlap, forever, for a source that is working fine). The only
    // trace of a rejected run is whatever BullMQ itself records for the
    // job this exception fails (see `SyncProcessor.process`).
    const lock = await this.syncLockService.acquire(dataSourceId);
    if (!lock) {
      throw new SyncLockUnavailableError(dataSourceId);
    }

    try {
      const syncJobId = await this.startJob(dataSourceId, triggeredBy);
      const counts = zeroCounts();
      const errorLog: SyncErrorLogEntry[] = [];

      try {
        const [dataSourceMeta, organization, mappings, connector] =
          await Promise.all([
            this.prisma.scoped.dataSource.findFirstOrThrow({
              where: { id: dataSourceId },
              select: { externalIdField: true },
            }),
            this.prisma.scoped.organization.findFirstOrThrow({
              select: { country: true },
            }),
            this.prisma.scoped.sourceFieldMapping.findMany({
              where: { dataSourceId },
            }),
            this.dataSourcesService.buildConnector(dataSourceId),
          ]);

        const context: RecordContext = {
          dataSourceId,
          externalIdField: dataSourceMeta.externalIdField,
          organizationCountry: organization.country,
          mappings,
        };

        let cursor: string | undefined;
        do {
          const page = await connector.fetchRecords(cursor);
          for (const raw of page.records) {
            await this.processRecord(context, raw, counts, errorLog);
          }
          cursor = page.nextCursor;
        } while (cursor);
      } catch (err) {
        errorLog.push({
          scope: "FETCH",
          ...describeSyncError(err),
          at: new Date().toISOString(),
        });
        // Task 18 review, Important 6: FAILED means the run could not
        // proceed AT ALL. A failure reached after some records were
        // already read (and durably persisted) is PARTIAL instead --
        // the run plainly did proceed, just not to completion.
        const status: SyncStatus =
          counts.recordsRead === 0 ? "FAILED" : "PARTIAL";
        await this.finalize(syncJobId, dataSourceId, counts, errorLog, status);
        return { syncJobId, status, ...counts };
      }

      const status: SyncStatus =
        counts.recordsFailed > 0 ? "PARTIAL" : "SUCCESS";
      await this.finalize(syncJobId, dataSourceId, counts, errorLog, status);
      return { syncJobId, status, ...counts };
    } finally {
      // T-2 (final whole-branch review, promoted from Minor after the
      // N-1 lock reorder made this the SOLE exit path out of a run that
      // may have already `finalize()`d its `SyncJob` row as SUCCESS or
      // PARTIAL): `release()` awaits a Redis EVAL, which CAN throw (a
      // Redis blip at exactly this instant). A `finally` block that
      // throws replaces whatever the `try` block was about to return --
      // so an unguarded `await lock.release()` here would turn a
      // genuinely successful run into a THROWN error out of `run()`,
      // which `SyncProcessor` (BullMQ) then records as a FAILED job,
      // while Postgres's `SyncJob` row already durably reads SUCCESS.
      // Two systems of record disagreeing about whether a compliance
      // sync ran is exactly what an evidence-producing platform cannot
      // have. A release failure is not actionable here -- the lock's own
      // TTL still expires on its own either way (same self-heal the
      // heartbeat's renewal-failure path already relies on) -- so this
      // logs and lets the run's own already-decided outcome (the
      // `return` above, or the rethrow from an actual pipeline failure)
      // stand, instead of overwriting it with a lock-plumbing failure.
      try {
        await lock.release();
      } catch (err) {
        this.logger.warn(
          `Failed to release sync lock for data source "${dataSourceId}" ` +
            "-- the run's own result is unaffected; the lock will self-heal " +
            `once its TTL expires: ${
              err instanceof Error ? err.message : "unknown error"
            }`,
        );
      }
    }
  }

  /**
   * PERSIST -> NORMALIZE -> MATCH -> LINK (-> ASSEMBLE -> AGE, see below)
   * for one fetched record, inside its own interactive transaction so one
   * record's failure rolls back only that record's writes and never
   * aborts the records around it. Caught by the caller's loop, which
   * increments `recordsFailed` and appends a sanitized `errorLog` entry
   * on any throw from here (including `MissingRecordKeyError`, thrown
   * deliberately before the transaction opens when the record has no
   * usable key).
   */
  private async processRecord(
    context: RecordContext,
    raw: unknown,
    counts: SyncCounts,
    errorLog: SyncErrorLogEntry[],
  ): Promise<void> {
    counts.recordsRead += 1;
    const recordKey = extractRecordKey(raw, context.externalIdField);
    try {
      if (recordKey === null) {
        throw new MissingRecordKeyError();
      }
      await this.prisma.scoped.$transaction((tx) =>
        this.persistAndLink(tx, context, recordKey, raw, counts),
      );
    } catch (err) {
      counts.recordsFailed += 1;
      errorLog.push({
        scope: "RECORD",
        recordKey,
        ...describeSyncError(err),
        at: new Date().toISOString(),
      });
    }
  }

  private async persistAndLink(
    tx: ScopedTransactionClient,
    context: RecordContext,
    recordKey: string,
    raw: unknown,
    counts: SyncCounts,
  ): Promise<void> {
    const hash = hashPayload(raw);
    const now = new Date();
    const existing = await tx.sourceRecord.findFirst({
      where: { dataSourceId: context.dataSourceId, sourceRecordKey: recordKey },
    });

    // Unchanged hash: touch ONLY lastSeenAt (the brief's "SourceRecord is
    // never mutated in place beyond lastSeenAt" for the common no-op
    // resync case) and skip the rest of the pipeline for this record
    // entirely -- no re-normalize, no re-match, and critically no
    // ASSEMBLE/AGE rebuild, since nothing about this record changed.
    if (existing && existing.payloadHash === hash) {
      await tx.sourceRecord.update({
        where: { id: existing.id },
        data: { lastSeenAt: now },
      });
      counts.recordsSkipped += 1;
      return;
    }

    // A genuinely new observation for this key -- either a brand-new
    // SourceRecord, or an existing one whose payload legitimately changed
    // since the last sync (Task 17's carried-forward defect scenario:
    // e.g. city Pune -> Mumbai). `firstSeenAt` is preserved on update
    // (omitted from the update data, left at its original value);
    // `rawPayload`/`payloadHash` are the fields this evidentiary,
    // append-only-by-key row exists to keep current.
    const isNew = !existing;
    const sourceRecordRow = existing
      ? await tx.sourceRecord.update({
          where: { id: existing.id },
          data: {
            rawPayload: raw as Prisma.InputJsonValue,
            payloadHash: hash,
            lastSeenAt: now,
          },
        })
      : await tx.sourceRecord.create({
          data: {
            dataSourceId: context.dataSourceId,
            sourceRecordKey: recordKey,
            rawPayload: raw as Prisma.InputJsonValue,
            payloadHash: hash,
            firstSeenAt: now,
            lastSeenAt: now,
          } as never,
        });
    if (isNew) {
      counts.recordsCreated += 1;
    } else {
      counts.recordsUpdated += 1;
    }

    // NORMALIZE
    const normalized = this.normalizationService.normalize(
      {
        id: sourceRecordRow.id,
        rawPayload: raw as Prisma.JsonValue,
        organizationCountry: context.organizationCountry,
      },
      context.mappings,
    );
    const { sourceRecordId, ...normalizedFields } = normalized;
    const normalizedRow = await tx.normalizedRecord.upsert({
      where: { sourceRecordId },
      create: normalized as never,
      update: normalizedFields as never,
    });

    // Cross-source identifier-ownership race (MVP1 evaluation Checks 4/6
    // finding -- see `.superpowers/sdd/2026-08-29-dpdp-mvp1/
    // concurrent-sync-race-report.md`): `SyncLockService`'s mutex only
    // ever serializes ONE data source against itself, so two DIFFERENT
    // sources' concurrent record-transactions could each read "no
    // principal owns this identifier yet" and both try to claim it --
    // whichever committed second used to hit the unique constraint and
    // abort its ENTIRE transaction, silently discarding the
    // `SourceRecord` just written above. Acquire this record's
    // identifier-ownership locks -- in `buildCandidateSignals`' fixed
    // order, so two transactions needing overlapping identifiers never
    // deadlock waiting on each other in reverse -- BEFORE the MATCH read
    // below, so a concurrent transaction wanting the same value blocks
    // here until this one commits or rolls back, then correctly sees the
    // committed identifier on its own (fresh) read instead of racing to
    // create a second one. See `identifier-ownership-lock.ts`.
    await lockIdentifiersForOwnership(
      tx,
      buildCandidateSignals(normalizedRow, context.mappings),
    );

    // D10 fix: the identifier lock above only ever serializes two
    // transactions that want the EXACT SAME identifier value -- it says
    // nothing about `MatchingService.supportingCandidates` (rule 4), which
    // reads every `NormalizedRecord` sharing this record's `nameKey` and
    // the `IdentityLink`s already active for them, entirely unlocked.
    // Two different sources syncing the SAME nameKey+pincode pair at the
    // same time could each run that read before the other's transaction
    // committed, both see "no active link for my nameKey twin yet", and
    // both create their own principal -- silently dropping the pending
    // `MatchCandidate` that should connect them. Acquired AFTER the
    // identifier locks, in that fixed relative order for every
    // transaction, so two transactions that need both kinds of lock never
    // deadlock waiting on each other in reverse. See
    // `identifier-ownership-lock.ts` and
    // `.superpowers/sdd/2026-08-31-dpdp-mvp2/d10-identity-nondeterminism-report.md`.
    await lockNameKeyForOwnership(tx, normalizedRow.nameKey);

    // MATCH (task 18 review, Important 3: reads through the SAME `tx` as
    // the write below now, not a second connection off `prisma.scoped`.
    // Two reasons, not one: (1) at worker concurrency 5, a second,
    // independent connection checkout while this record's transaction
    // already holds one risks exhausting Prisma's connection pool --
    // "2 * cpus + 1" is 5 on a 2-vCPU container, so five concurrent
    // record-transactions each holding one connection while blocking on a
    // second is a deadlock, not a slowdown. (2) reading and writing
    // through the same transaction means this match sees the exact
    // snapshot the LINK write below acts on, closing the read-write gap
    // that would otherwise let two concurrent runs on one data source
    // both read "no principal with this email" and both create one --
    // a second, independent line of defence on top of the sync-lock fix
    // for Critical 1, not a replacement for it).
    const matchResult = await this.matchingService.match(
      tx,
      normalizedRow,
      context.mappings,
    );

    // LINK
    const applied = await this.linkingService.applyMatch(
      tx,
      normalizedRow,
      matchResult,
      context.mappings,
    );
    counts.candidatesRaised += applied.candidatesCreated;

    if (applied.linkCreated) {
      // ASSEMBLE + AGE already ran inside `applyMatch` for a newly
      // created link (LinkingService's own, Task 17-reviewed contract).
      // Use `applied.principalCreated`, not `matchResult.kind === "NEW"`:
      // a CANDIDATE result (rule 4's POSSIBLE supporting-signal match)
      // also creates a brand-new principal now (spec 4.4 rule 5 applies
      // regardless of rule 4 raising a candidate) -- counting that as
      // "linked" would undercount `principalsCreated` by exactly the
      // number of pending review candidates.
      if (applied.principalCreated) {
        counts.principalsCreated += 1;
      } else {
        counts.principalsLinked += 1;
      }
      return;
    }

    if (applied.dataPrincipalId) {
      // Task 18's carried-forward Task 17 defect: this record was ALREADY
      // linked (no new link -> LinkingService never re-runs assembly for
      // it), but its payload hash DID change on this run (we would not be
      // here otherwise -- the unchanged-hash branch above returns before
      // reaching this code at all). Rebuilding here is what makes a
      // resynced value change (e.g. city Pune -> Mumbai) actually reach
      // `PrincipalDataField` instead of leaving it stale indefinitely.
      await this.assemblyService.rebuild(tx, applied.dataPrincipalId);
      await this.ageService.derive(tx, applied.dataPrincipalId);
    }
  }

  private async startJob(
    dataSourceId: string,
    triggeredBy: string,
  ): Promise<string> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const job = await tx.syncJob.create({
        data: { dataSourceId, triggeredBy, status: "RUNNING" } as never,
        select: { id: true },
      });
      await this.auditService.record(tx, {
        action: "SYNC_STARTED",
        resourceType: "SyncJob",
        resourceId: job.id,
        metadata: { dataSourceId, triggeredBy },
      });
      return job.id;
    });
  }

  private async finalize(
    syncJobId: string,
    dataSourceId: string,
    counts: SyncCounts,
    errorLog: SyncErrorLogEntry[],
    status: SyncStatus,
  ): Promise<void> {
    await this.prisma.scoped.$transaction(async (tx) => {
      await tx.syncJob.update({
        where: { id: syncJobId },
        data: {
          ...counts,
          errorLog: errorLog as unknown as Prisma.InputJsonValue,
          status,
          finishedAt: new Date(),
        },
      });
      await this.auditService.record(tx, {
        action: status === "FAILED" ? "SYNC_FAILED" : "SYNC_COMPLETED",
        resourceType: "SyncJob",
        resourceId: syncJobId,
        metadata: { dataSourceId, status, ...counts },
      });
    });
  }
}
