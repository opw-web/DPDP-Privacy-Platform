import type {
  BreachStatus,
  DataCategory,
  ObligationStatus,
  RuleBasis,
} from "@prisma/client";

export interface PublicBreachObligation {
  id: string;
  code: string;
  ruleCodeSnapshot: string;
  ruleVersionSnapshot: number;
  legalSourceSnapshot: string;
  basisSnapshot: RuleBasis;
  dueAt: Date;
  warningAt: Date;
  status: ObligationStatus;
  completedAt: Date | null;
  completedByEmployeeId: string | null;
  evidenceReference: string | null;
  waiverReason: string | null;
}
export interface PublicBreachAffectedPrincipal {
  id: string;
  dataPrincipalId: string;
  notifiedAt: Date | null;
  notificationChannel: string | null;
  campaignRecipientId: string | null;
  addedAt: Date;
}
export interface PublicBreach {
  id: string;
  reference: string;
  title: string;
  description: string;
  occurredAt: Date | null;
  becameAwareAt: Date;
  discoveredByEmployeeId: string;
  affectedSourceIds: string[];
  dataCategories: DataCategory[];
  involvesChildren: boolean;
  natureExtentTiming: string | null;
  consequences: string | null;
  mitigationMeasures: string | null;
  safetyMeasuresForPrincipals: string | null;
  responderContact: string | null;
  boardBroadFacts: string | null;
  boardMitigation: string | null;
  boardPerpetratorFindings: string | null;
  boardRemedialMeasures: string | null;
  boardExtensionRequestedAt: Date | null;
  boardExtensionGrantedUntil: Date | null;
  boardExtensionReference: string | null;
  status: BreachStatus;
  closedAt: Date | null;
  closureNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  obligations: PublicBreachObligation[];
  affected: PublicBreachAffectedPrincipal[];
}

export interface AffectedPreview {
  count: number;
  principalIds: string[];
  includesChildren: boolean;
}
