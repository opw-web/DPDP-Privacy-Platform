/**
 * The full permission catalogue, transcribed verbatim from
 * DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md lines 702-709 -- both the MVP 1
 * and MVP 2 blocks, seeded together now so roles need no editing later
 * (spec's own instruction).
 *
 * NOTE (fidelity check): the task 5 brief's prose says "23 permission
 * codes"; the fenced block at lines 702-709 lists exactly 22 distinct
 * codes (11 in the MVP 1 block, 11 in the MVP 2 block). This mirrors the
 * 33-vs-35 discrepancy already flagged in audit-actions.ts for a different
 * spec/brief count -- transcribed exactly what the fenced block contains
 * rather than inventing a 23rd code to match the brief's prose count.
 * Flagged for the spec owner, not resolved here.
 */
export interface PermissionSeed {
  code: string;
  description: string;
  category: string;
}

export const PERMISSIONS: readonly PermissionSeed[] = [
  // ── MVP 1 ──
  {
    code: "CAN_VIEW_PRINCIPALS",
    description: "View the data principal registry (masked unless CAN_VIEW_ALL_PERSONAL_DATA is also held).",
    category: "MVP1",
  },
  {
    code: "CAN_VIEW_ALL_PERSONAL_DATA",
    description: "View unmasked personal data values on a principal's record.",
    category: "MVP1",
  },
  {
    code: "CAN_MANAGE_DATA_SOURCES",
    description: "Create, update, and delete connected data sources.",
    category: "MVP1",
  },
  {
    code: "CAN_RUN_SYNC",
    description: "Trigger a data source sync job.",
    category: "MVP1",
  },
  {
    code: "CAN_RESOLVE_IDENTITIES",
    description: "Confirm or reject identity match candidates.",
    category: "MVP1",
  },
  {
    code: "CAN_MANAGE_EMPLOYEES",
    description: "Create, update, disable employees and manage roles/permissions.",
    category: "MVP1",
  },
  {
    code: "CAN_VIEW_AUDIT_LOG",
    description: "View the organization's audit event log.",
    category: "MVP1",
  },
  {
    code: "CAN_CHANGE_ORG_SETTINGS",
    description: "Update organization profile, DPO contact, and SDF/Third Schedule declarations.",
    category: "MVP1",
  },
  {
    code: "CAN_MANAGE_PURPOSES",
    description: "Create and update processing purposes and lawful basis records.",
    category: "MVP1",
  },
  {
    code: "CAN_MANAGE_REGISTERS",
    description: "Manage recipients, sharing activities, transfers, retention and security registers.",
    category: "MVP1",
  },
  {
    code: "CAN_EXPORT_EVIDENCE",
    description: "Export compliance evidence packages.",
    category: "MVP1",
  },
  // ── MVP 2 ──
  {
    code: "CAN_MANAGE_NOTICES",
    description: "Create and publish consent notices.",
    category: "MVP2",
  },
  {
    code: "CAN_MANAGE_CONSENTS",
    description: "Manage consent records and withdrawal handling.",
    category: "MVP2",
  },
  {
    code: "CAN_MANAGE_REQUESTS",
    description: "Manage data principal rights requests.",
    category: "MVP2",
  },
  {
    code: "CAN_SEND_MESSAGES",
    description: "Send messages/notices to data principals.",
    category: "MVP2",
  },
  {
    code: "CAN_SEND_BREACH_NOTICES",
    description: "Send statutory breach notifications.",
    category: "MVP2",
  },
  {
    code: "CAN_MANAGE_BREACHES",
    description: "Record and manage personal data breach incidents.",
    category: "MVP2",
  },
  {
    code: "CAN_MANAGE_RETENTION",
    description: "Configure and enforce retention policies.",
    category: "MVP2",
  },
  {
    code: "CAN_APPROVE_ERASURE",
    description: "Approve an erasure request's execution.",
    category: "MVP2",
  },
  {
    code: "CAN_MANAGE_CHILD_DATA",
    description: "Manage children's/guardian-represented data handling.",
    category: "MVP2",
  },
  {
    code: "CAN_CHANGE_COMPLIANCE_CONFIG",
    description: "Change compliance program configuration.",
    category: "MVP2",
  },
  {
    code: "CAN_MANAGE_SDF",
    description: "Manage Significant Data Fiduciary specific obligations.",
    category: "MVP2",
  },
];
