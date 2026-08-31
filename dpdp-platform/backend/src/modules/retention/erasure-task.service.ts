import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ErasureState } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { AuditService } from "../../common/audit/audit.service";
import type { AccessTokenPayload } from "../auth/token.service";
import { ComplianceService, addByDeadlineUnit } from "../compliance/compliance.service";
import { addByRetentionUnit } from "./retention-dates.util";
import { legalHoldCovers, type LegalHoldScope } from "./legal-hold-scope.util";
import type {
  ProcessorChecklistEntry,
  SystemChecklistEntry,
} from "./checklist.types";
import { CompleteErasureTaskDto } from "./dto/complete-erasure-task.dto";
import { CancelErasureTaskDto } from "./dto/cancel-erasure-task.dto";

/** `ComplianceService.resolveRule`'s lookup keys for this module, spec §2.4 (lines 569-571), transcribed verbatim. */
const RETENTION_INACTIVITY_APPLIES_TO = "RETENTION:INACTIVITY";
const PRE_ERASURE_NOTICE_APPLIES_TO = "RETENTION:PRE_ERASURE_NOTICE";
const LOG_RETENTION_MINIMUM_APPLIES_TO = "RETENTION:LOG_FLOOR";

/**
 * Canonical fields treated as "data needed to access her user account or
 * a virtual token usable for money, goods or services" for RE-04's Third
 * Schedule carve-out. The schema has no field-level flag for this (no
 * `CanonicalField` value is named for account access specifically), so
 * this is this task's own interpretation: `EMAIL` is the portal login
 * identifier (`PrincipalAccount.email`, mirrored into
 * `PrincipalDataField` when a source contributes it), and `CUSTOMER_ID`
 * is the closest canonical stand-in for an account/loyalty/virtual-token
 * identifier a source system might hold. Reported as an assumption in
 * task-9-report.md -- a DPO reviewing a real deployment may want this
 * list configurable rather than hard-coded.
 */
const ACCOUNT_ACCESS_CANONICAL_FIELDS: readonly string[] = ["EMAIL", "CUSTOMER_ID"];

/** The ONLY shape an `ErasureTask` row is ever returned in from this service. `organizationId` deliberately absent, same discipline as every other register in this codebase. */
export const ERASURE_TASK_PUBLIC_SELECT = {
  id: true,
  dataPrincipalId: true,
  retentionPolicyId: true,
  trigger: true,
  state: true,
  evaluatedAt: true,
  preErasureNoticeDueAt: true,
  preErasureNoticeSentAt: true,
  erasureDueAt: true,
  retentionFloorUntil: true,
  legalHoldId: true,
  systemChecklist: true,
  processorChecklist: true,
  completedAt: true,
  completedByEmployeeId: true,
  cancelledReason: true,
  ruleCodeSnapshot: true,
  ruleVersionSnapshot: true,
} satisfies Prisma.ErasureTaskSelect;

export type PublicErasureTask = Prisma.ErasureTaskGetPayload<{
  select: typeof ERASURE_TASK_PUBLIC_SELECT;
}>;

/** `ErasureTask.trigger` -- a plain `String` column in the schema (not a Prisma enum), spec line 308, transcribed verbatim. */
export type ErasureTrigger =
  | "CONSENT_WITHDRAWN"
  | "PURPOSE_SERVED"
  | "INACTIVITY"
  | "REQUEST";

/**
 * The published, exact input shape of `createFromTrigger` (see that
 * method's own doc comment) -- Wave 3's consent-withdrawal task reads
 * this type, not this file's implementation.
 */
export interface CreateFromTriggerInput {
  trigger: ErasureTrigger;
  dataPrincipalId: string;
  retentionPolicyId?: string;
}

const TERMINAL_STATES: readonly ErasureState[] = ["ERASED", "CANCELLED"];

@Injectable()
export class ErasureTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly complianceService: ComplianceService,
  ) {}

  /**
   * THE single writer of `ErasureTask` rows in this codebase (Global
   * Constraint / task brief: "the single writer of `ErasureTask` rows").
   * `tx` is the CALLER's own transaction (`ScopedTransactionClient`, from
   * `prisma.scoped.$transaction(async (tx) => ...)`) -- this method never
   * opens a transaction of its own, so a caller such as Wave 3's
   * consent-withdrawal task can call
   * `erasureTaskService.createFromTrigger(tx, {...})` from INSIDE its own
   * `$transaction` callback and get atomicity between "consent withdrawn"
   * and "erasure scheduled" for free (spec line 646).
   *
   * ## What this computes, in order
   *
   * 1. **Candidate `erasureDueAt`** (before the floor/hold are applied):
   *    - `trigger === "INACTIVITY"`: driven by the `RETENTION:INACTIVITY`
   *      `ComplianceRule` itself (not by `retentionPolicyId`, which may be
   *      omitted for this trigger) -- `dueAt` of
   *      `computeDeadline(rule, lastInboundContactAt)`, where
   *      `lastInboundContactAt` is the latest `PrincipalContactEvent` with
   *      `direction: "INBOUND"` for this principal (GO-09: outbound
   *      contact, e.g. a marketing campaign, is never consulted here),
   *      falling back to `DataPrincipal.createdAt` if she has none yet.
   *      Throws if the rule is not currently resolvable (it is
   *      null/disabled unless `Organization.thirdScheduleClass !== NONE`,
   *      per `ComplianceService.resolveRule`'s own documented behaviour)
   *      -- a caller must not reach this trigger for an organization the
   *      rule does not apply to; `RetentionScanService` never does.
   *    - Any other trigger with `retentionPolicyId` supplied: `now +
   *      RetentionPolicy.retentionValue/retentionUnit` (calendar-aware,
   *      via `addByRetentionUnit`).
   *    - Any other trigger with no `retentionPolicyId`: `now` (immediate,
   *      subject to the floor/hold below) -- e.g. a `REQUEST`-triggered
   *      task with no purpose-specific policy governing the erasure
   *      period beyond the statutory floor.
   * 2. **The floor (RE-06/RE-07 -- "the single most dangerous bug in
   *    this module").** `retentionFloorUntil = lastProcessingAt +
   *    LOG_RETENTION_MINIMUM`, `LOG_RETENTION_MINIMUM` resolved from
   *    `ComplianceService` (never a literal). `lastProcessingAt` has no
   *    dedicated column anywhere in the schema this task inherited --
   *    see this method's private `resolveLastProcessingAt` for the exact,
   *    documented derivation and task-9-report.md's "Concerns" for why.
   *    If the candidate `erasureDueAt` would fall before the floor, it is
   *    BUMPED UP to `retentionFloorUntil` itself (never left at the
   *    violating value -- the Wave 0 CHECK constraint `erasure_respects_floor`
   *    would reject the insert outright if it were) and the task's state
   *    becomes `DEFERRED_RETENTION_FLOOR`, so `erasureDueAt` IS the
   *    release date the UI shows.
   * 3. **Legal holds** (spec line 721: "override everything"): if an
   *    active `LegalHold` covers this principal (see
   *    `legal-hold-scope.util.ts`), the state becomes `ON_LEGAL_HOLD`
   *    regardless of what step 2 computed.
   * 4. **Pre-erasure notice (RE-05).** Only computed when the task lands
   *    in the normal `EVALUATED` state (not deferred/held, since there is
   *    nothing to notice about yet) --
   *    `preErasureNoticeDueAt = erasureDueAt - PRE_ERASURE_NOTICE`
   *    (`PRE_ERASURE_NOTICE` resolved from `ComplianceService`, never the
   *    literal 48). `RetentionScanService.promoteFromFloor` /
   *    `LegalHoldService`'s hold-release path recompute this once a
   *    deferred/held task resumes.
   * 5. **Third Schedule carve-out (RE-04).** When the governing policy
   *    has `accountAccessCarveOut` set, account-access fields are
   *    excluded from `systemChecklist` and shown as excluded (see
   *    `buildChecklists` below).
   *
   * Does NOT de-duplicate against an existing open task for the same
   * principal -- that is the caller's responsibility (idempotency of
   * "when do I call this" belongs to whoever detected the trigger, e.g.
   * `RetentionScanService`'s own duplicate check before it calls this for
   * `INACTIVITY`, or the consent-withdrawal handler calling this at most
   * once per withdrawal event).
   */
  async createFromTrigger(
    tx: ScopedTransactionClient,
    input: CreateFromTriggerInput,
  ): Promise<PublicErasureTask> {
    const { trigger, dataPrincipalId, retentionPolicyId } = input;
    const now = new Date();

    const principal = await tx.dataPrincipal.findFirst({
      where: { id: dataPrincipalId },
      select: { id: true },
    });
    if (!principal) {
      throw new NotFoundException(`Data principal "${dataPrincipalId}" not found.`);
    }

    let policy: {
      purposeId: string;
      retentionValue: number;
      retentionUnit: string;
      accountAccessCarveOut: boolean;
    } | null = null;
    if (retentionPolicyId) {
      policy = await tx.retentionPolicy.findFirst({
        where: { id: retentionPolicyId },
        select: {
          purposeId: true,
          retentionValue: true,
          retentionUnit: true,
          accountAccessCarveOut: true,
        },
      });
      if (!policy) {
        throw new BadRequestException(
          `Unknown retention policy id: ${retentionPolicyId}`,
        );
      }
    }

    let candidateErasureDueAt: Date;
    if (trigger === "INACTIVITY") {
      const inactivityRule = await this.complianceService.resolveRule(
        RETENTION_INACTIVITY_APPLIES_TO,
        now,
      );
      if (!inactivityRule) {
        throw new BadRequestException(
          "RETENTION_INACTIVITY has no active, enabled rule for this " +
            "organization (it resolves null unless Organization.thirdScheduleClass " +
            "is set to a Third Schedule class) -- cannot create an INACTIVITY erasure task.",
        );
      }
      const lastInboundContactAt = await this.resolveLastInboundContactAt(
        tx,
        dataPrincipalId,
      );
      candidateErasureDueAt = this.complianceService.computeDeadline(
        inactivityRule,
        lastInboundContactAt,
      ).dueAt;
    } else if (policy) {
      candidateErasureDueAt = addByRetentionUnit(
        now,
        policy.retentionValue,
        policy.retentionUnit,
      );
    } else {
      candidateErasureDueAt = now;
    }

    // ── RE-06/RE-07: the floor, never a literal ──
    const lastProcessingAt = await this.resolveLastProcessingAt(tx, dataPrincipalId);
    const floorRule = await this.complianceService.resolveRule(
      LOG_RETENTION_MINIMUM_APPLIES_TO,
      now,
    );
    const retentionFloorUntil = floorRule
      ? this.complianceService.computeDeadline(floorRule, lastProcessingAt).dueAt
      : null;

    let erasureDueAt = candidateErasureDueAt;
    let state: ErasureState = "EVALUATED";
    if (retentionFloorUntil && erasureDueAt < retentionFloorUntil) {
      // Bumped UP to the release date itself -- never left at a value the
      // `erasure_respects_floor` CHECK constraint would refuse.
      erasureDueAt = retentionFloorUntil;
      state = "DEFERRED_RETENTION_FLOOR";
    }

    // ── Legal holds override everything ──
    const applicableHold = await this.findApplicableLegalHold(
      tx,
      dataPrincipalId,
      policy?.purposeId ?? null,
      now,
    );
    let legalHoldId: string | null = null;
    if (applicableHold) {
      state = "ON_LEGAL_HOLD";
      legalHoldId = applicableHold.id;
    }

    // ── RE-05: pre-erasure notice, only meaningful once the task is actually progressing ──
    let preErasureNoticeDueAt: Date | null = null;
    if (state === "EVALUATED") {
      const noticeRule = await this.complianceService.resolveRule(
        PRE_ERASURE_NOTICE_APPLIES_TO,
        now,
      );
      if (noticeRule) {
        preErasureNoticeDueAt = addByDeadlineUnit(
          erasureDueAt,
          -noticeRule.deadlineValue,
          noticeRule.deadlineUnit,
        );
      }
    }

    const { systemChecklist, processorChecklist } = await this.buildChecklists(
      tx,
      dataPrincipalId,
      policy?.accountAccessCarveOut ?? false,
    );

    const created = await tx.erasureTask.create({
      data: {
        dataPrincipalId,
        retentionPolicyId: retentionPolicyId ?? null,
        trigger,
        state,
        evaluatedAt: now,
        preErasureNoticeDueAt,
        erasureDueAt,
        retentionFloorUntil,
        legalHoldId,
        systemChecklist: systemChecklist as unknown as Prisma.InputJsonValue,
        processorChecklist: processorChecklist as unknown as Prisma.InputJsonValue,
        ruleCodeSnapshot: floorRule?.ruleCode ?? null,
        ruleVersionSnapshot: floorRule?.version ?? null,
        // organizationId deliberately omitted -- the tenant-scoping
        // extension supplies it at runtime (same convention as
        // EmployeesService.create / DataSourcesService.create).
      } as never,
      select: ERASURE_TASK_PUBLIC_SELECT,
    });

    await this.auditService.record(tx, {
      action: "ERASURE_TASK_CREATED",
      resourceType: "ErasureTask",
      resourceId: created.id,
      subjectPrincipalId: dataPrincipalId,
      metadata: {
        trigger,
        state: created.state,
        erasureDueAt: created.erasureDueAt,
        retentionFloorUntil: created.retentionFloorUntil,
        legalHoldId: created.legalHoldId,
      },
    });

    return created;
  }

  async list(state?: ErasureState): Promise<PublicErasureTask[]> {
    return this.prisma.scoped.erasureTask.findMany({
      where: state ? { state } : undefined,
      orderBy: { evaluatedAt: "desc" },
      select: ERASURE_TASK_PUBLIC_SELECT,
    });
  }

  /**
   * `CAN_APPROVE_ERASURE` (a different, higher permission than
   * `CAN_MANAGE_RETENTION`, enforced by the controller) marks a task
   * `ERASED`. Human checklist, not automated deletion (spec §4.6.6): the
   * caller submits the FULL tick state for every system/processor entry,
   * and this method requires every non-excluded entry be ticked before
   * it accepts completion -- there is no route to tick items one at a
   * time (the endpoint table has exactly `GET tasks`, `POST complete`,
   * `POST cancel`, `GET|POST legal-holds`), so the frontend collects the
   * full checklist client-side and submits it once.
   *
   * Refuses completion while `DEFERRED_RETENTION_FLOOR` or
   * `ON_LEGAL_HOLD` -- completing either would mean actually erasing
   * data still inside the statutory floor or under hold, which is
   * exactly the contravention RE-07 exists to prevent; the CHECK
   * constraint only protects the STORED `erasureDueAt`/`retentionFloorUntil`
   * pair, not this state transition, so this guard is this service's own
   * responsibility. Also refuses completion before `erasureDueAt` itself
   * has arrived (not required by the spec's prose in so many words, but
   * consistent with "must never fight or work around" the floor -- an
   * employee cannot jump the gun on a date the system itself computed).
   */
  async complete(
    id: string,
    dto: CompleteErasureTaskDto,
    actor: AccessTokenPayload,
  ): Promise<PublicErasureTask> {
    const existing = await this.prisma.scoped.erasureTask.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Erasure task "${id}" not found.`);
    }
    if (TERMINAL_STATES.includes(existing.state)) {
      throw new ConflictException(
        `Erasure task "${id}" is already ${existing.state} and cannot be completed again.`,
      );
    }
    if (existing.state === "DEFERRED_RETENTION_FLOOR") {
      throw new ConflictException(
        `Erasure task "${id}" is deferred until the retention floor releases it ` +
          `on ${existing.retentionFloorUntil?.toISOString() ?? "an unknown date"} ` +
          "(Rule 8(3)) and cannot be completed before then.",
      );
    }
    if (existing.state === "ON_LEGAL_HOLD") {
      throw new ConflictException(
        `Erasure task "${id}" is on legal hold and cannot be completed.`,
      );
    }
    const now = new Date();
    if (existing.erasureDueAt && existing.erasureDueAt > now) {
      throw new ConflictException(
        `Erasure task "${id}" is not yet due (erasureDueAt: ${existing.erasureDueAt.toISOString()}).`,
      );
    }

    const existingSystemChecklist =
      existing.systemChecklist as unknown as SystemChecklistEntry[];
    const existingProcessorChecklist =
      existing.processorChecklist as unknown as ProcessorChecklistEntry[];

    const nowIso = now.toISOString();
    const mergedSystemChecklist = existingSystemChecklist.map((entry) => {
      if (entry.excluded) {
        return entry;
      }
      const tick = dto.systemChecklist.find(
        (item) => item.dataSourceId === entry.dataSourceId,
      );
      if (!tick || !tick.done) {
        throw new BadRequestException(
          `System checklist item for data source "${entry.dataSourceId}" ` +
            "is not ticked complete.",
        );
      }
      return { ...entry, done: true, byEmployeeId: actor.sub, at: nowIso };
    });
    const mergedProcessorChecklist = existingProcessorChecklist.map((entry) => {
      const tick = dto.processorChecklist.find(
        (item) => item.recipientId === entry.recipientId,
      );
      if (!tick || !tick.confirmed) {
        throw new BadRequestException(
          `Processor checklist item for recipient "${entry.recipientId}" ` +
            "is not confirmed.",
        );
      }
      return {
        ...entry,
        confirmed: true,
        ref: tick.ref ?? entry.ref,
        at: nowIso,
      };
    });

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.erasureTask.update({
        where: { id },
        data: {
          state: "ERASED",
          completedAt: now,
          completedByEmployeeId: actor.sub,
          systemChecklist: mergedSystemChecklist as unknown as Prisma.InputJsonValue,
          processorChecklist:
            mergedProcessorChecklist as unknown as Prisma.InputJsonValue,
        },
        select: ERASURE_TASK_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "ERASURE_TASK_COMPLETED",
        resourceType: "ErasureTask",
        resourceId: id,
        subjectPrincipalId: updated.dataPrincipalId,
        metadata: { change: "COMPLETED", completedByEmployeeId: actor.sub },
      });

      return updated;
    });
  }

  /**
   * `CAN_MANAGE_RETENTION` cancels a task with a recorded reason.
   *
   * No dedicated `ERASURE_TASK_CANCELLED` audit action exists in
   * `audit-actions.ts` (only `ERASURE_TASK_CREATED`/`ERASURE_TASK_COMPLETED`/
   * `LEGAL_HOLD_CREATED` are defined for this module, and the task brief
   * for this file forbids adding a new one). This reuses
   * `ERASURE_TASK_COMPLETED` with `metadata.change: "CANCELLED"` -- the
   * SAME reuse-with-a-`change`-tag convention `RetentionService.update()`
   * (MVP 1, `registers/retention.service.ts`) already established by
   * reusing `RETENTION_POLICY_CREATED` for updates. Reported as a gap in
   * task-9-report.md.
   */
  async cancel(
    id: string,
    dto: CancelErasureTaskDto,
    actor: AccessTokenPayload,
  ): Promise<PublicErasureTask> {
    const existing = await this.prisma.scoped.erasureTask.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Erasure task "${id}" not found.`);
    }
    if (TERMINAL_STATES.includes(existing.state)) {
      throw new ConflictException(
        `Erasure task "${id}" is already ${existing.state} and cannot be cancelled.`,
      );
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.erasureTask.update({
        where: { id },
        data: { state: "CANCELLED", cancelledReason: dto.reason },
        select: ERASURE_TASK_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "ERASURE_TASK_COMPLETED",
        resourceType: "ErasureTask",
        resourceId: id,
        subjectPrincipalId: updated.dataPrincipalId,
        metadata: {
          change: "CANCELLED",
          reason: dto.reason,
          cancelledByEmployeeId: actor.sub,
        },
      });

      return updated;
    });
  }

  /**
   * "Last processing" has no dedicated column anywhere in the schema
   * this task inherited (`DataPrincipal` carries `lastPrincipalContactAt`
   * for CONTACT, not processing, and there is no `lastProcessingAt`/
   * `processedAt` field on any model -- confirmed by an exhaustive grep
   * of `schema.prisma` before writing this). This derives it as the
   * latest `PrincipalDataField.updatedAt` across every field this
   * principal has on record -- those rows ARE the personal data actually
   * being processed/held about her (synced from source systems), so the
   * most recent write to any of them is the most defensible available
   * proxy for "when her data was last processed". Falls back to
   * `DataPrincipal.createdAt` (never `.updatedAt`) when she has no fields
   * yet.
   *
   * Deliberately does NOT consult `DataPrincipal.updatedAt`: that column
   * is bumped by unrelated writes this method must not treat as
   * "processing" -- most importantly a portal login, which updates
   * `lastPrincipalContactAt` on the SAME row via `principal-auth.service.ts`.
   * Counting that would let every login silently push the retention floor
   * forward forever, the exact GO-09 failure mode ("a company ... doing X
   * would let [it] defeat s.8(8)") this module's inactivity logic is
   * built to avoid, applied here to the floor instead of the inactivity
   * clock.
   */
  private async resolveLastProcessingAt(
    tx: ScopedTransactionClient,
    dataPrincipalId: string,
  ): Promise<Date> {
    const [fieldAgg, principal] = await Promise.all([
      tx.principalDataField.aggregate({
        where: { dataPrincipalId },
        _max: { updatedAt: true },
      }),
      tx.dataPrincipal.findFirstOrThrow({
        where: { id: dataPrincipalId },
        select: { createdAt: true },
      }),
    ]);
    return fieldAgg._max.updatedAt ?? principal.createdAt;
  }

  /** GO-09: INBOUND contact only. Falls back to `DataPrincipal.createdAt` if she has never contacted the company. */
  private async resolveLastInboundContactAt(
    tx: ScopedTransactionClient,
    dataPrincipalId: string,
  ): Promise<Date> {
    const [eventAgg, principal] = await Promise.all([
      tx.principalContactEvent.aggregate({
        where: { dataPrincipalId, direction: "INBOUND" },
        _max: { occurredAt: true },
      }),
      tx.dataPrincipal.findFirstOrThrow({
        where: { id: dataPrincipalId },
        select: { createdAt: true },
      }),
    ]);
    return eventAgg._max.occurredAt ?? principal.createdAt;
  }

  private async findApplicableLegalHold(
    tx: ScopedTransactionClient,
    dataPrincipalId: string,
    purposeId: string | null,
    now: Date,
  ): Promise<{ id: string } | null> {
    const holds = await tx.legalHold.findMany({
      where: {
        startedAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true, scope: true },
    });
    const match = holds.find((hold) =>
      legalHoldCovers(hold.scope as LegalHoldScope, dataPrincipalId, purposeId),
    );
    return match ? { id: match.id } : null;
  }

  /**
   * RE-04's Third Schedule carve-out plus the per-system/per-processor
   * checklist (spec §4.6.6). Every `DataSource` contributing at least one
   * NON-carved-out field is an actionable `systemChecklist` entry; a
   * source whose ONLY contribution is carved-out fields still appears,
   * but marked `excluded: true` and never actionable (see
   * `checklist.types.ts`). `processorChecklist` lists every active
   * `DataRecipient` of `type: "DATA_PROCESSOR"` -- "registered processor"
   * per RE-02/s.8(2), not `OTHER_DATA_FIDUCIARY` recipients.
   */
  private async buildChecklists(
    tx: ScopedTransactionClient,
    dataPrincipalId: string,
    accountAccessCarveOut: boolean,
  ): Promise<{
    systemChecklist: SystemChecklistEntry[];
    processorChecklist: ProcessorChecklistEntry[];
  }> {
    const fields = await tx.principalDataField.findMany({
      where: { dataPrincipalId },
      select: { canonicalField: true, sourceIds: true },
    });

    const includedSourceIds = new Set<string>();
    const excludedFieldsBySource = new Map<string, Set<string>>();
    for (const field of fields) {
      const isCarvedOut =
        accountAccessCarveOut &&
        ACCOUNT_ACCESS_CANONICAL_FIELDS.includes(field.canonicalField);
      for (const sourceId of field.sourceIds) {
        if (isCarvedOut) {
          const set = excludedFieldsBySource.get(sourceId) ?? new Set<string>();
          set.add(field.canonicalField);
          excludedFieldsBySource.set(sourceId, set);
        } else {
          includedSourceIds.add(sourceId);
        }
      }
    }

    const systemChecklist: SystemChecklistEntry[] = [...includedSourceIds].map(
      (dataSourceId) => ({
        dataSourceId,
        done: false,
        byEmployeeId: null,
        at: null,
        ...(excludedFieldsBySource.has(dataSourceId)
          ? { excludedFields: [...excludedFieldsBySource.get(dataSourceId)!] }
          : {}),
      }),
    );
    for (const [sourceId, excludedFields] of excludedFieldsBySource) {
      if (!includedSourceIds.has(sourceId)) {
        systemChecklist.push({
          dataSourceId: sourceId,
          done: false,
          byEmployeeId: null,
          at: null,
          excluded: true,
          excludedFields: [...excludedFields],
        });
      }
    }

    const processors = await tx.dataRecipient.findMany({
      where: { active: true, type: "DATA_PROCESSOR" },
      select: { id: true },
    });
    const processorChecklist: ProcessorChecklistEntry[] = processors.map((p) => ({
      recipientId: p.id,
      confirmed: false,
      ref: null,
      at: null,
    }));

    return { systemChecklist, processorChecklist };
  }
}
