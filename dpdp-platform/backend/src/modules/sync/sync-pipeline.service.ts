import { Injectable, NotFoundException } from "@nestjs/common";
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
import { MatchingService } from "../identity/matching.service";
import { LinkingService } from "../identity/linking.service";
import { AssemblyService } from "../identity/assembly.service";
import { AgeService } from "../identity/age.service";
import { hashPayload } from "./payload-hash";
import { describeSyncError, MissingRecordKeyError } from "./sync-error";

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
 * PARTIAL vs FAILED: a per-record failure (bad/missing key, a matching or
 * linking error for that one record) is caught, logged to `errorLog`, and
 * the loop continues -- the run ends `PARTIAL` if any such failure
 * occurred, `SUCCESS` otherwise. `FAILED` is reserved for the run being
 * unable to proceed AT ALL: `FETCH` itself (building the connector, or
 * any page's `fetchRecords` call) throwing. Once FETCH fails the loop
 * stops entirely -- there is no "skip this page and try the next" for a
 * connector-level failure, since a failed page also breaks pagination
 * (the next page's cursor is unknown). Whatever records were already
 * durably persisted from earlier, successfully fetched pages keep their
 * counts; the run is still reported FAILED because it did not complete
 * its intended scope.
 */
@Injectable()
export class SyncPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataSourcesService: DataSourcesService,
    private readonly normalizationService: NormalizationService,
    private readonly matchingService: MatchingService,
    private readonly linkingService: LinkingService,
    private readonly assemblyService: AssemblyService,
    private readonly ageService: AgeService,
    private readonly auditService: AuditService,
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
      await this.finalize(syncJobId, dataSourceId, counts, errorLog, "FAILED");
      return { syncJobId, status: "FAILED", ...counts };
    }

    const status: SyncStatus = counts.recordsFailed > 0 ? "PARTIAL" : "SUCCESS";
    await this.finalize(syncJobId, dataSourceId, counts, errorLog, status);
    return { syncJobId, status, ...counts };
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

    // MATCH (reads current committed state via prisma.scoped, per
    // MatchingService's existing, already-tested contract -- it does not
    // take a transaction handle; only LinkingService's WRITES need to
    // share this record's transaction).
    const matchResult = await this.matchingService.match(
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
      if (matchResult.kind === "NEW") {
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
