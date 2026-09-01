export type RetentionState =
  | "EVALUATED"
  | "NOTICE_SENT"
  | "DEFERRED_RETENTION_FLOOR"
  | "ON_LEGAL_HOLD"
  | "READY_FOR_ERASURE"
  | "ERASED"
  | "CANCELLED";

export interface SystemChecklistEntry {
  dataSourceId: string;
  done: boolean;
  byEmployeeId: string | null;
  at: string | null;
  excluded?: boolean;
  excludedFields?: string[];
}

export interface ProcessorChecklistEntry {
  recipientId: string;
  confirmed: boolean;
  ref: string | null;
  at: string | null;
}

export interface ErasureTask {
  id: string;
  dataPrincipalId: string;
  retentionPolicyId: string | null;
  trigger: string;
  state: RetentionState;
  evaluatedAt: string;
  preErasureNoticeDueAt: string | null;
  preErasureNoticeSentAt: string | null;
  erasureDueAt: string | null;
  retentionFloorUntil: string | null;
  legalHoldId: string | null;
  systemChecklist: SystemChecklistEntry[];
  processorChecklist: ProcessorChecklistEntry[];
  completedAt: string | null;
  completedByEmployeeId: string | null;
  cancelledReason: string | null;
  ruleCodeSnapshot: string | null;
  ruleVersionSnapshot: number | null;
}

export interface LegalHold {
  id: string;
  name: string;
  reason: string;
  legalCitation: string;
  scope: { principalIds?: string[]; purposeIds?: string[]; categories?: string[] };
  startedAt: string;
  endsAt: string | null;
  createdByEmployeeId: string;
}

export const RETENTION_STATES: readonly RetentionState[] = [
  "EVALUATED",
  "NOTICE_SENT",
  "DEFERRED_RETENTION_FLOOR",
  "ON_LEGAL_HOLD",
  "READY_FOR_ERASURE",
  "ERASED",
  "CANCELLED",
];

export function retentionStateLabel(value: RetentionState): string {
  return value === "DEFERRED_RETENTION_FLOOR"
    ? "Deferred by retention floor"
    : value.toLowerCase().replaceAll("_", " ").replace(/(^| )\w/g, (letter) => letter.toUpperCase());
}
