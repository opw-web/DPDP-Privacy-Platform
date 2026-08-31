import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RequestStatus, RequestType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { AuditService } from "../../common/audit/audit.service";
import type { AuditAction } from "../../common/audit/audit-actions";
import { ReferenceService } from "../../common/reference/reference.service";
import { TenantContext } from "../../common/tenant/tenant-context";
import { ComplianceService } from "../compliance/compliance.service";
import type { ComplianceDeadlineSnapshot } from "../compliance/compliance.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ErasureTaskService } from "../retention/erasure-task.service";
import { ChangeStatusDto } from "./dto/change-status.dto";
import { AddNoteDto } from "./dto/add-note.dto";
import { EscalateRequestDto } from "./dto/escalate-request.dto";
import { VerifyIdentityDto } from "./dto/verify-identity.dto";
import { FlagFrivolousDto } from "./dto/flag-frivolous.dto";
import { ListRequestsDto } from "./dto/list-requests.dto";
import {
  APPLIES_TO_BY_REQUEST_TYPE,
  DEADLINE_SCAN_ACTOR_LABEL,
  DEADLINE_WARNING_EVENT_NOTE,
  ERASURE_STATUTORY_GROUND_TEXT,
  REJECTION_REASON_MIN_LENGTH,
  TERMINAL_REQUEST_STATUSES,
  TRANSITIONS,
  type ErasureStatutoryGround,
} from "./requests.constants";

/**
 * The ONLY shape a `PrincipalRequest` is ever returned in from this
 * service (or the controller behind it). `organizationId` deliberately
 * absent -- same discipline as `RECIPIENT_PUBLIC_SELECT` /
 * `COMPLIANCE_RULE_PUBLIC_SELECT`.
 */
export const REQUEST_PUBLIC_SELECT = {
  id: true,
  reference: true,
  dataPrincipalId: true,
  submittedByGuardianId: true,
  type: true,
  status: true,
  subject: true,
  body: true,
  requestedChanges: true,
  channel: true,
  identityVerifiedBy: true,
  identityVerifiedAt: true,
  assignedEmployeeId: true,
  escalatedAt: true,
  ruleId: true,
  ruleCodeSnapshot: true,
  ruleVersionSnapshot: true,
  ruleBasisSnapshot: true,
  legalSourceSnapshot: true,
  submittedAt: true,
  dueAt: true,
  warningAt: true,
  completedAt: true,
  isOverdue: true,
  isFrivolousFlagged: true,
  frivolousReason: true,
  outcomeCode: true,
  outcome: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PrincipalRequestSelect;

export type PublicRequest = Prisma.PrincipalRequestGetPayload<{
  select: typeof REQUEST_PUBLIC_SELECT;
}>;

/** Full row shape this service operates on internally (adds `status`
 * transition context beyond what `REQUEST_PUBLIC_SELECT` needs to expose,
 * though today they happen to coincide -- kept as a distinct alias so a
 * future internal-only field doesn't have to be threaded through the
 * public shape). */
type RequestRow = PublicRequest;

export interface CreateRequestInput {
  dataPrincipalId: string;
  type: RequestType;
  subject: string;
  body: string;
  requestedChanges?: Record<string, unknown>;
  channel?: string;
  submittedByGuardianId?: string | null;
}

export interface RequestStats {
  total: number;
  byStatus: Partial<Record<RequestStatus, number>>;
  byType: Partial<Record<RequestType, number>>;
  overdueCount: number;
  noDeadlineRuleCount: number;
}

export interface DeadlineScanOrgResult {
  warningsSent: number;
  overdueMarked: number;
  escalated: number;
}

function transitionTargets(status: RequestStatus): readonly RequestStatus[] {
  return TRANSITIONS[status] ?? [];
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly referenceService: ReferenceService,
    private readonly complianceService: ComplianceService,
    private readonly notificationsService: NotificationsService,
    private readonly erasureTaskService: ErasureTaskService,
  ) {}

  // ---------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------

  async list(query: ListRequestsDto): Promise<PublicRequest[]> {
    const where: Prisma.PrincipalRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.assignee) where.assignedEmployeeId = query.assignee;
    if (query.overdue !== undefined) where.isOverdue = query.overdue;

    return this.prisma.scoped.principalRequest.findMany({
      where,
      orderBy: [{ dueAt: "asc" }, { submittedAt: "asc" }],
      select: REQUEST_PUBLIC_SELECT,
    });
  }

  async getByReference(ref: string): Promise<PublicRequest> {
    const row = await this.prisma.scoped.principalRequest.findFirst({
      where: { reference: ref },
      select: REQUEST_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Request "${ref}" not found.`);
    }
    return row;
  }

  async stats(): Promise<RequestStats> {
    const rows = await this.prisma.scoped.principalRequest.findMany({
      select: { status: true, type: true, isOverdue: true, dueAt: true, ruleId: true },
    });
    const byStatus: Partial<Record<RequestStatus, number>> = {};
    const byType: Partial<Record<RequestType, number>> = {};
    let overdueCount = 0;
    let noDeadlineRuleCount = 0;
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      byType[row.type] = (byType[row.type] ?? 0) + 1;
      if (row.isOverdue) overdueCount += 1;
      if (row.dueAt === null) noDeadlineRuleCount += 1;
    }
    return { total: rows.length, byStatus, byType, overdueCount, noDeadlineRuleCount };
  }

  // ---------------------------------------------------------------------
  // Creation (no HTTP route in this task -- spec lines 852-857 name none;
  // exported for the principal-portal task to call, wrapped in its own
  // `TenantContext.run({ actorType: "PRINCIPAL", ... })`).
  // ---------------------------------------------------------------------

  async create(input: CreateRequestInput): Promise<PublicRequest> {
    const now = new Date();
    const appliesTo = APPLIES_TO_BY_REQUEST_TYPE[input.type];
    const rule = await this.complianceService.resolveRule(appliesTo, now);

    const snapshot: Partial<ComplianceDeadlineSnapshot> = {};
    if (rule) {
      const { dueAt, warningAt } = this.complianceService.computeDeadline(rule, now);
      this.complianceService.snapshotOnto(snapshot, rule, dueAt, warningAt);
    }

    const referenceValue = await this.referenceService.next("REQUEST");
    const formattedReference = `REQ-${referenceValue.toString().padStart(6, "0")}`;

    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.principalRequest.create({
        data: {
          reference: formattedReference,
          dataPrincipalId: input.dataPrincipalId,
          submittedByGuardianId: input.submittedByGuardianId ?? null,
          type: input.type,
          status: "SUBMITTED",
          subject: input.subject,
          body: input.body,
          requestedChanges: (input.requestedChanges ?? {}) as never,
          channel: input.channel ?? "PORTAL",
          // Copied from ComplianceService's generic snapshot keys into
          // this model's actual column names -- see requests.constants.ts
          // and the task 6 brief's explicit mapping.
          ruleId: snapshot.ruleId ?? null,
          ruleCodeSnapshot: snapshot.ruleCode ?? null,
          ruleVersionSnapshot: snapshot.ruleVersion ?? null,
          ruleBasisSnapshot: snapshot.ruleBasis ?? null,
          legalSourceSnapshot: snapshot.legalSource ?? null,
          dueAt: snapshot.dueAt ?? null,
          warningAt: snapshot.warningAt ?? null,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime (same convention as
          // RecipientsService.create).
        } as never,
        select: REQUEST_PUBLIC_SELECT,
      });

      const { actorType, actorId, actorLabel } = TenantContext.get();
      await tx.requestEvent.create({
        data: {
          requestId: created.id,
          fromStatus: null,
          toStatus: "SUBMITTED",
          actorType,
          actorId,
          actorLabel,
          note: "Request submitted",
          visibleToPrincipal: false,
        } as never,
      });

      await this.auditService.record(tx, {
        action: "REQUEST_CREATED",
        resourceType: "PrincipalRequest",
        resourceId: created.id,
        subjectPrincipalId: created.dataPrincipalId,
        metadata: {
          type: created.type,
          hasDeadlineRule: rule !== null,
        },
      });

      return created;
    });
  }

  // ---------------------------------------------------------------------
  // Transition machinery
  // ---------------------------------------------------------------------

  private async loadByReferenceOrThrow(ref: string): Promise<RequestRow> {
    const row = await this.prisma.scoped.principalRequest.findFirst({
      where: { reference: ref },
      select: REQUEST_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Request "${ref}" not found.`);
    }
    return row;
  }

  /** Throws `ConflictException` (409) for any move not listed in
   * `TRANSITIONS` -- called BEFORE any write, in every method that
   * changes status, so an illegal move never produces a `RequestEvent`
   * row (Check 4). */
  private assertLegalTransition(current: RequestStatus, target: RequestStatus): void {
    if (!transitionTargets(current).includes(target)) {
      throw new ConflictException(
        `Cannot move request from "${current}" to "${target}".`,
      );
    }
  }

  /** Writes the status update (if `targetStatus` is non-null), the
   * `RequestEvent`, and the `AuditEvent`, all inside `tx` -- the one
   * place any of the three ever happens for a mutating request action. */
  private async writeTransition(
    tx: ScopedTransactionClient,
    existing: RequestRow,
    targetStatus: RequestStatus | null,
    patch: Prisma.PrincipalRequestUpdateInput,
    eventNote: string | null,
    visibleToPrincipal: boolean,
    auditAction: AuditAction,
    auditMetadata: Record<string, unknown>,
  ): Promise<PublicRequest> {
    const { actorType, actorId, actorLabel } = TenantContext.get();

    const updated = await tx.principalRequest.update({
      where: { id: existing.id },
      data: {
        ...patch,
        ...(targetStatus ? { status: targetStatus } : {}),
      },
      select: REQUEST_PUBLIC_SELECT,
    });

    await tx.requestEvent.create({
      data: {
        requestId: existing.id,
        fromStatus: existing.status,
        toStatus: targetStatus ?? existing.status,
        actorType,
        actorId,
        actorLabel,
        note: eventNote,
        visibleToPrincipal,
      } as never,
    });

    await this.auditService.record(tx, {
      action: auditAction,
      resourceType: "PrincipalRequest",
      resourceId: existing.id,
      subjectPrincipalId: existing.dataPrincipalId,
      metadata: auditMetadata,
    });

    return updated;
  }

  // ---------------------------------------------------------------------
  // Employee-facing actions (CAN_MANAGE_REQUESTS)
  // ---------------------------------------------------------------------

  async assign(ref: string, employeeId: string, note?: string): Promise<PublicRequest> {
    const existing = await this.loadByReferenceOrThrow(ref);
    if (TERMINAL_REQUEST_STATUSES.includes(existing.status)) {
      throw new ConflictException(
        `Request "${ref}" is already ${existing.status} and cannot be reassigned.`,
      );
    }
    const targetStatus: RequestStatus | null = existing.status === "OPEN" ? "ASSIGNED" : null;
    if (targetStatus) {
      this.assertLegalTransition(existing.status, targetStatus);
    }

    return this.prisma.scoped.$transaction((tx) =>
      this.writeTransition(
        tx,
        existing,
        targetStatus,
        { assignedEmployeeId: employeeId },
        note ?? `Assigned to employee ${employeeId}`,
        false,
        "REQUEST_STATUS_CHANGED",
        {
          subtype: "ASSIGNED",
          employeeId,
          from: existing.status,
          to: targetStatus ?? existing.status,
        },
      ),
    );
  }

  /**
   * The one endpoint that drives the state machine directly. Every
   * conditional requirement is checked here, BEFORE the transaction, so
   * a rejected call (409/400/403) never writes a `RequestEvent` or
   * `AuditEvent` row (Check 4).
   */
  async changeStatus(ref: string, dto: ChangeStatusDto): Promise<PublicRequest> {
    const existing = await this.loadByReferenceOrThrow(ref);

    // 1. Structural legality of the move itself -- 409, checked first,
    // regardless of who is calling or what the payload contains.
    this.assertLegalTransition(existing.status, dto.status);

    // 2. Only the Data Principal (or her verified guardian/nominee) may
    // cancel. `TenantContext`'s `actorType` is populated independently by
    // `TenantMiddleware` from the verified JWT audience -- never
    // caller-suppliable in the request body.
    if (dto.status === "CANCELLED") {
      const { actorType } = TenantContext.get();
      if (actorType !== "PRINCIPAL") {
        throw new ForbiddenException(
          "Only the Data Principal (or her verified guardian/nominee) may cancel a request.",
        );
      }
    }

    // 3. REJECTED: rejectionReason >= 20 chars, plus (for ERASURE) the
    // statutory ground relied on (RT-09, s.12(3)).
    let rejectionReason: string | undefined;
    if (dto.status === "REJECTED") {
      const trimmed = (dto.rejectionReason ?? "").trim();
      if (trimmed.length < REJECTION_REASON_MIN_LENGTH) {
        throw new BadRequestException(
          `rejectionReason must be at least ${REJECTION_REASON_MIN_LENGTH} characters.`,
        );
      }
      rejectionReason = trimmed;
      if (existing.type === "ERASURE") {
        const ground = dto.statutoryGround as ErasureStatutoryGround | undefined;
        if (!ground) {
          throw new BadRequestException(
            "Rejecting an ERASURE request requires the statutory ground relied " +
              "on -- retention necessary for the specified purpose, or for " +
              "compliance with law (RT-09, s.12(3)).",
          );
        }
        rejectionReason = `${rejectionReason}\n\nStatutory ground (s.12(3)): ${ERASURE_STATUTORY_GROUND_TEXT[ground]}.`;
      }
    }

    // 4. COMPLETED: outcomeCode and non-empty outcome.
    let outcomeCode: string | undefined;
    let outcome: string | undefined;
    if (dto.status === "COMPLETED") {
      const code = (dto.outcomeCode ?? "").trim();
      const text = (dto.outcome ?? "").trim();
      if (code.length === 0) {
        throw new BadRequestException("outcomeCode is required to complete a request.");
      }
      if (text.length === 0) {
        throw new BadRequestException("outcome is required to complete a request.");
      }
      outcomeCode = code;
      outcome = text;
    }

    const patch: Prisma.PrincipalRequestUpdateInput = {};
    if (rejectionReason !== undefined) patch.rejectionReason = rejectionReason;
    if (outcomeCode !== undefined) {
      patch.outcomeCode = outcomeCode;
      patch.outcome = outcome;
      patch.completedAt = new Date();
    }
    if (dto.status === "ESCALATED") patch.escalatedAt = new Date();

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await this.writeTransition(
        tx,
        existing,
        dto.status,
        patch,
        dto.note ?? null,
        dto.visibleToPrincipal ?? false,
        "REQUEST_STATUS_CHANGED",
        {
          from: existing.status,
          to: dto.status,
          rejectionReason: rejectionReason ?? null,
          statutoryGround: dto.statutoryGround ?? null,
          outcomeCode: outcomeCode ?? null,
        },
      );

      // Task 6/9 linkage (spec line 310: REQUEST is an erasure trigger).
      // Completing an ERASURE request is the moment this request engine
      // hands off to the retention module -- `ErasureTaskService` remains
      // THE single writer of `ErasureTask` rows; this only calls its
      // published `createFromTrigger(tx, ...)` from inside the SAME
      // transaction as the request's own COMPLETED write, so either both
      // land or neither does. `COMPLETED` is terminal (`TRANSITIONS.COMPLETED`
      // is `[]`), so a given request can reach this branch at most once --
      // no de-duplication needed on this side (`createFromTrigger` itself
      // does not de-duplicate; that is deliberately the caller's job).
      if (dto.status === "COMPLETED" && existing.type === "ERASURE") {
        await this.erasureTaskService.createFromTrigger(tx, {
          trigger: "REQUEST",
          dataPrincipalId: existing.dataPrincipalId,
        });
      }

      return updated;
    });
  }

  async escalate(ref: string, dto: EscalateRequestDto): Promise<PublicRequest> {
    const existing = await this.loadByReferenceOrThrow(ref);
    this.assertLegalTransition(existing.status, "ESCALATED");

    return this.prisma.scoped.$transaction((tx) =>
      this.writeTransition(
        tx,
        existing,
        "ESCALATED",
        { escalatedAt: new Date() },
        dto.reason ?? "Escalated",
        false,
        "REQUEST_STATUS_CHANGED",
        { subtype: "ESCALATED", from: existing.status, to: "ESCALATED", reason: dto.reason ?? null },
      ),
    );
  }

  async addNote(ref: string, dto: AddNoteDto): Promise<PublicRequest> {
    const existing = await this.loadByReferenceOrThrow(ref);
    return this.prisma.scoped.$transaction((tx) =>
      this.writeTransition(
        tx,
        existing,
        null,
        {},
        dto.note,
        dto.visibleToPrincipal ?? false,
        "REQUEST_STATUS_CHANGED",
        { subtype: "NOTE_ADDED", visibleToPrincipal: dto.visibleToPrincipal ?? false },
      ),
    );
  }

  async verifyIdentity(ref: string, dto: VerifyIdentityDto): Promise<PublicRequest> {
    const existing = await this.loadByReferenceOrThrow(ref);
    if (TERMINAL_REQUEST_STATUSES.includes(existing.status)) {
      throw new ConflictException(
        `Request "${ref}" is already ${existing.status}; identity cannot be verified.`,
      );
    }
    const targetStatus: RequestStatus | null =
      existing.status === "VERIFICATION_REQUIRED" ? "OPEN" : null;
    if (targetStatus) {
      this.assertLegalTransition(existing.status, targetStatus);
    }

    const { actorLabel } = TenantContext.get();
    const identityVerifiedBy = `${actorLabel} via ${dto.method}${
      dto.reference ? ` (ref: ${dto.reference})` : ""
    }`;

    return this.prisma.scoped.$transaction((tx) =>
      this.writeTransition(
        tx,
        existing,
        targetStatus,
        { identityVerifiedBy, identityVerifiedAt: new Date() },
        dto.note ?? "Identity verified",
        false,
        "REQUEST_IDENTITY_VERIFIED",
        {
          method: dto.method,
          reference: dto.reference ?? null,
          from: existing.status,
          to: targetStatus ?? existing.status,
        },
      ),
    );
  }

  /** RT-15: a flag with a reason, never an auto-reject -- status is
   * deliberately never touched here. */
  async flagFrivolous(ref: string, dto: FlagFrivolousDto): Promise<PublicRequest> {
    const existing = await this.loadByReferenceOrThrow(ref);
    return this.prisma.scoped.$transaction((tx) =>
      this.writeTransition(
        tx,
        existing,
        null,
        { isFrivolousFlagged: true, frivolousReason: dto.reason },
        dto.reason,
        false,
        "REQUEST_FLAGGED_FRIVOLOUS",
        { reason: dto.reason },
      ),
    );
  }

  // ---------------------------------------------------------------------
  // deadline-scan (called per-organization by DeadlineScanProcessor,
  // already inside that organization's TenantContext).
  // ---------------------------------------------------------------------

  /**
   * One organization's worth of `deadline-scan` work. Reads stored
   * `dueAt`/`warningAt` only -- never recomputes from the live
   * `ComplianceRule` (spec §4.1's "difference between an audit-defensible
   * product and a liability").
   */
  async scanOrgDeadlines(now: Date): Promise<DeadlineScanOrgResult> {
    let warningsSent = 0;
    let overdueMarked = 0;
    let escalated = 0;

    const dpoEmployees = await this.prisma.scoped.employee.findMany({
      where: { status: "ACTIVE", role: { code: "DPO" } },
      select: { id: true },
    });

    // --- Warning pass: past warningAt, not yet warned. Deliberately NOT
    // guarded by `dueAt > now`: a rule with `warningLead: 0` sets
    // `warningAt === dueAt` (see `ComplianceService.computeDeadline`),
    // and a `dueAt > now` guard here would make that combination never
    // fire a warning at all -- the overdue pass would win the race on
    // the very same scan the deadline passes. The `DEADLINE_WARNING_SENT`
    // marker is what makes this idempotent regardless of how many scans
    // find the row still eligible after dueAt has also passed.
    const warningCandidates = await this.prisma.scoped.principalRequest.findMany({
      where: {
        dueAt: { not: null },
        warningAt: { not: null, lte: now },
        status: { notIn: [...TERMINAL_REQUEST_STATUSES] },
      },
      include: {
        events: {
          where: { note: DEADLINE_WARNING_EVENT_NOTE },
          select: { id: true },
          take: 1,
        },
      },
    });

    for (const row of warningCandidates) {
      if (row.events.length > 0) continue; // idempotency flag already present

      const recipientEmployeeId = row.assignedEmployeeId ?? dpoEmployees[0]?.id ?? null;
      if (recipientEmployeeId) {
        await this.notificationsService.send({
          audience: "EMPLOYEE",
          employeeId: recipientEmployeeId,
          title: `Deadline approaching: ${row.reference}`,
          body: `Request ${row.reference} (${row.type}) is due ${row.dueAt!.toISOString()}.`,
          severity: "WARNING",
          linkPath: `/app/requests/${row.reference}`,
        });
      }

      await this.prisma.scoped.$transaction(async (tx) => {
        await tx.requestEvent.create({
          data: {
            requestId: row.id,
            fromStatus: row.status,
            toStatus: row.status,
            actorType: "SYSTEM",
            actorId: null,
            actorLabel: DEADLINE_SCAN_ACTOR_LABEL,
            note: DEADLINE_WARNING_EVENT_NOTE,
            visibleToPrincipal: false,
          } as never,
        });
        await this.auditService.record(tx, {
          action: "REQUEST_STATUS_CHANGED",
          resourceType: "PrincipalRequest",
          resourceId: row.id,
          subjectPrincipalId: row.dataPrincipalId,
          metadata: { subtype: "DEADLINE_WARNING_SENT", recipientEmployeeId },
        });
      });
      warningsSent += 1;
    }

    // --- Overdue pass: past dueAt, not yet flagged. ---
    const overdueCandidates = await this.prisma.scoped.principalRequest.findMany({
      where: {
        dueAt: { not: null, lte: now },
        isOverdue: false,
        status: { notIn: [...TERMINAL_REQUEST_STATUSES] },
      },
    });

    for (const row of overdueCandidates) {
      const rule = row.ruleId
        ? await this.prisma.scoped.complianceRule.findFirst({
            where: { id: row.ruleId },
            select: { escalateOnBreach: true },
          })
        : null;
      const canEscalate = transitionTargets(row.status).includes("ESCALATED");
      const willEscalate = Boolean(rule?.escalateOnBreach) && canEscalate;

      // Assignee + every DPO, deduplicated -- an assignee who also holds
      // the DPO role gets exactly one notification, not two.
      const recipientIds = new Set<string>(dpoEmployees.map((dpo) => dpo.id));
      if (row.assignedEmployeeId) recipientIds.add(row.assignedEmployeeId);
      for (const employeeId of recipientIds) {
        await this.notificationsService.send({
          audience: "EMPLOYEE",
          employeeId,
          title: `Overdue: ${row.reference}`,
          body: `Request ${row.reference} (${row.type}) passed its deadline (${row.dueAt!.toISOString()}).`,
          severity: "CRITICAL",
          linkPath: `/app/requests/${row.reference}`,
        });
      }

      await this.prisma.scoped.$transaction(async (tx) => {
        await tx.principalRequest.update({
          where: { id: row.id },
          data: {
            isOverdue: true,
            ...(willEscalate ? { status: "ESCALATED", escalatedAt: now } : {}),
          },
        });
        await tx.requestEvent.create({
          data: {
            requestId: row.id,
            fromStatus: row.status,
            toStatus: willEscalate ? "ESCALATED" : row.status,
            actorType: "SYSTEM",
            actorId: null,
            actorLabel: DEADLINE_SCAN_ACTOR_LABEL,
            note: willEscalate
              ? "Deadline passed; auto-escalated per the compliance rule."
              : "Deadline passed.",
            visibleToPrincipal: false,
          } as never,
        });
        await this.auditService.record(tx, {
          action: "REQUEST_STATUS_CHANGED",
          resourceType: "PrincipalRequest",
          resourceId: row.id,
          subjectPrincipalId: row.dataPrincipalId,
          metadata: {
            subtype: "OVERDUE",
            escalated: willEscalate,
            from: row.status,
            to: willEscalate ? "ESCALATED" : row.status,
          },
        });
      });
      overdueMarked += 1;
      if (willEscalate) escalated += 1;
    }

    return { warningsSent, overdueMarked, escalated };
  }
}
