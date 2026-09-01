import { Injectable } from "@nestjs/common";
import type { ScopedTransactionClient } from "../prisma/scoped-transaction-client";
import { AuditService } from "./audit.service";

export interface RecordPersonalDataViewedInput {
  /** `DataPrincipal.id` of the person whose data was looked at -- never omitted. */
  subjectPrincipalId: string;
  resourceType: string;
  resourceId?: string;
  /** Free-form, JSON-plain context (e.g. `{ page: "detail" }`, `{ exportFormat: "pdf" }`). Never a DTO/entity instance -- see `AuditService.record`'s `canonicalJson` constraint. */
  context?: Record<string, unknown>;
}

/**
 * SE-03 / Rule 6(1)(c): the access log answering "who looked at this
 * person's data". A thin, single-purpose wrapper around
 * `AuditService.record` -- NOT a second writer to `AuditEvent`;
 * `AuditService.record` remains the only one, this just fixes the shape
 * and the action name so every call site produces an identical,
 * correctly-shaped `PERSONAL_DATA_VIEWED` event instead of each caller
 * re-typing the action string and remembering to set
 * `subjectPrincipalId`.
 *
 * HOW TASKS 20-21 MUST CALL THIS (exactly one event per request, never
 * one per field):
 *
 *   - Principal detail page (`GET /api/principals/:id`, Task 20): inside
 *     the SAME `prisma.scoped.$transaction(async (tx) => { ... })` the
 *     handler already opens (or a new one opened just for this, if the
 *     read path has none) call
 *     `accessLogService.recordPersonalDataViewed(tx, { subjectPrincipalId: id, resourceType: "DataPrincipal", resourceId: id, context: { view: "detail" } })`
 *     ONCE, after loading the profile, regardless of how many
 *     `PrincipalDataField` rows are serialized in the response. Do not
 *     call this once per field.
 *   - Evidence export (Task 21, `EVIDENCE_EXPORTED` is the action for the
 *     export itself -- see `AuditService` directly for that): if an
 *     evidence package embeds a specific data principal's personal data,
 *     ALSO call `recordPersonalDataViewed` once per distinct principal
 *     included, inside the same transaction as the export write.
 *   - `GET /api/principals/:id/source-records` (Task 20/21): same
 *     pattern -- one call per request naming that route's `:id`, inside
 *     a transaction, regardless of how many source records are returned.
 *
 * `tx` must be the caller's own interactive-transaction client (per
 * constraint 1 carried from earlier tasks) -- this method opens no
 * transaction of its own, exactly like `AuditService.record`.
 */
@Injectable()
export class AccessLogService {
  constructor(private readonly auditService: AuditService) {}

  async recordPersonalDataViewed(
    tx: ScopedTransactionClient,
    input: RecordPersonalDataViewedInput,
  ): Promise<void> {
    const event = await this.auditService.record(tx, {
      action: "PERSONAL_DATA_VIEWED",
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      subjectPrincipalId: input.subjectPrincipalId,
      metadata: input.context ?? {},
    });

    // Keep the immutable chain and the purgeable access-log read model in
    // the caller's transaction. A rollback therefore removes both; a
    // committed PERSONAL_DATA_VIEWED event can never exist without its
    // retention-governed projection.
    await tx.accessLogEntry.create({
      data: {
        organizationId: event.organizationId,
        auditEventId: event.id,
        sequence: event.sequence,
        actorType: event.actorType,
        actorId: event.actorId,
        actorLabel: event.actorLabel,
        subjectPrincipalId: event.subjectPrincipalId,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        metadata: event.metadata as never,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        occurredAt: event.createdAt,
      },
    });
  }
}
