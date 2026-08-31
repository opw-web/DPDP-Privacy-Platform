import { RequestStatus, RequestType } from "@prisma/client";

/**
 * The only legal moves of the rights-request state machine, transcribed
 * verbatim from `DPDP_MVP2_COMPLIANCE_OPERATIONS.md` lines 677-684 (§4.5).
 * Anything not listed here is a `409` (`RequestsService.assertLegalTransition`).
 * `isOverdue` is a flag on the row, never a status -- it never appears as
 * a key or value here.
 */
export const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  SUBMITTED: ["VERIFICATION_REQUIRED", "OPEN", "CANCELLED"],
  VERIFICATION_REQUIRED: ["OPEN", "REJECTED", "CANCELLED"],
  OPEN: ["ASSIGNED", "IN_PROGRESS", "ESCALATED", "REJECTED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "ESCALATED", "OPEN", "CANCELLED"],
  IN_PROGRESS: [
    "WAITING_FOR_PRINCIPAL",
    "ESCALATED",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
  ],
  WAITING_FOR_PRINCIPAL: ["IN_PROGRESS", "ESCALATED", "CANCELLED"],
  ESCALATED: ["IN_PROGRESS", "COMPLETED", "REJECTED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** The three terminal statuses -- no outgoing edge exists from any of
 * these in `TRANSITIONS` above, which is itself what enforces "only
 * before COMPLETED" for cancellation (spec §4.5) without a separate
 * check: `TRANSITIONS.COMPLETED` is `[]`, so no target, `CANCELLED`
 * included, is ever legal from it. */
export const TERMINAL_REQUEST_STATUSES: readonly RequestStatus[] = [
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

/**
 * `ComplianceService.resolveRule()` lookup keys per request type (task 6
 * brief / spec §2.4 seed table). `COMPLETION` and `UPDATE` are real
 * `RequestType` enum members with no `appliesTo` row of their own
 * anywhere in the spec's seed table or the task brief's explicit list of
 * seven keys -- both fall back to `REQUEST:OTHER` here rather than
 * resolving no rule at all. Flagged in task-6-report.md as a genuine
 * ambiguity for the spec owner to confirm; `REQUEST:OTHER`'s 30-day/warn-7
 * ORG_POLICY default is a reasonable placeholder that never invents a
 * bare number (the value still comes from whatever `ComplianceRule` row
 * `REQUEST:OTHER` resolves to, same as every other type).
 */
export const APPLIES_TO_BY_REQUEST_TYPE: Record<RequestType, string> = {
  ACCESS: "REQUEST:ACCESS",
  CORRECTION: "REQUEST:CORRECTION",
  COMPLETION: "REQUEST:OTHER",
  UPDATE: "REQUEST:OTHER",
  ERASURE: "REQUEST:ERASURE",
  CONSENT_WITHDRAWAL: "REQUEST:CONSENT_WITHDRAWAL",
  GRIEVANCE: "REQUEST:GRIEVANCE",
  NOMINATION: "REQUEST:NOMINATION",
  OTHER: "REQUEST:OTHER",
};

/** RT-09 / s.12(3): `REJECTED` requires at least this many characters of reason. */
export const REJECTION_REASON_MIN_LENGTH = 20;

/**
 * RT-09 / s.12(3): the two statutory grounds an erasure rejection may
 * rely on. Not a Prisma enum (no schema column exists for it -- see
 * task-6-report.md's "Concerns" on why `rejectionReason` carries this
 * text rather than a new column) so this is the application-level source
 * of truth for the allowed values.
 */
export const ERASURE_STATUTORY_GROUNDS = [
  "PURPOSE_NECESSITY",
  "LEGAL_COMPLIANCE",
] as const;
export type ErasureStatutoryGround = (typeof ERASURE_STATUTORY_GROUNDS)[number];

export const ERASURE_STATUTORY_GROUND_TEXT: Record<ErasureStatutoryGround, string> = {
  PURPOSE_NECESSITY: "retention is necessary for the specified purpose",
  LEGAL_COMPLIANCE: "retention is necessary for compliance with law",
};

/**
 * Idempotency marker for `deadline-scan`'s warning pass: written as a
 * `RequestEvent.note` value the instant the single warning notification
 * for a request is sent, and checked for existence before sending
 * another one (spec: "idempotent via a flag on a `RequestEvent`" --
 * `RequestEvent` carries no boolean column of its own, so a
 * well-known, unmistakable `note` value on a `SYSTEM`-actor event is the
 * flag: its existence, not a field on it, is what "idempotent" checks).
 */
export const DEADLINE_WARNING_EVENT_NOTE = "DEADLINE_WARNING_SENT";

/** `TenantContext`/`RequestEvent`/`AuditEvent` actor label for every
 * write `deadline-scan` makes -- consistent, greppable provenance for
 * anything a scan cycle touched, matching `SYNC_ACTOR_LABEL`'s role in
 * `sync-pipeline.service.ts`. */
export const DEADLINE_SCAN_ACTOR_LABEL = "System: deadline-scan";
