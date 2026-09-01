export type RequestStatus =
  | "SUBMITTED" | "VERIFICATION_REQUIRED" | "OPEN" | "ASSIGNED" | "IN_PROGRESS"
  | "WAITING_FOR_PRINCIPAL" | "ESCALATED" | "COMPLETED" | "REJECTED" | "CANCELLED";
export type RequestType = "ACCESS" | "CORRECTION" | "COMPLETION" | "UPDATE" | "ERASURE" | "CONSENT_WITHDRAWAL" | "GRIEVANCE" | "NOMINATION" | "OTHER";
export interface RequestRecord {
  id: string; reference: string; dataPrincipalId: string; type: RequestType; status: RequestStatus; subject: string; body: string;
  requestedChanges: Record<string, { from?: string; to?: string } | unknown>; assignedEmployeeId: string | null; escalatedAt: string | null;
  ruleCodeSnapshot: string | null; ruleVersionSnapshot: number | null; ruleBasisSnapshot: "STATUTORY" | "SECTORAL" | "ORG_POLICY" | "INTERNAL_TARGET" | null; legalSourceSnapshot: string | null;
  submittedAt: string | null; createdAt: string; dueAt: string | null; warningAt: string | null; completedAt: string | null; isOverdue: boolean;
  outcomeCode: string | null; outcome: string | null; rejectionReason: string | null;
}
export interface PrincipalSource { id: string; name: string; }
export interface PrincipalField { id: string; canonicalField: string; value: string; sources: PrincipalSource[]; }
export interface RequestPrincipal { id: string; reference: string; displayName: string | null; fields: PrincipalField[]; }
export interface ProcessorActivity { id: string; recipient: { id: string; name: string; type: string }; description: string; }
export const REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  SUBMITTED: ["VERIFICATION_REQUIRED", "OPEN"],
  VERIFICATION_REQUIRED: ["OPEN", "REJECTED"],
  OPEN: ["ASSIGNED", "IN_PROGRESS", "ESCALATED", "REJECTED"],
  ASSIGNED: ["IN_PROGRESS", "ESCALATED", "OPEN"],
  IN_PROGRESS: ["WAITING_FOR_PRINCIPAL", "ESCALATED", "COMPLETED", "REJECTED"],
  WAITING_FOR_PRINCIPAL: ["IN_PROGRESS", "ESCALATED"],
  ESCALATED: ["IN_PROGRESS", "COMPLETED", "REJECTED"],
  COMPLETED: [], REJECTED: [], CANCELLED: [],
};
