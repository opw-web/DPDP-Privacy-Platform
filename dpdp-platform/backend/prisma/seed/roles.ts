import { PERMISSIONS } from "./permissions";

const ALL_PERMISSION_CODES: readonly string[] = PERMISSIONS.map((p) => p.code);

/**
 * The default role -> permission map, transcribed verbatim from
 * DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md line 712:
 *
 *   ADMIN everything; DPO everything except CAN_MANAGE_EMPLOYEES;
 *   COMPLIANCE_MANAGER view principals + personal data, run sync, resolve
 *   identities, manage purposes/registers/requests/consents, send
 *   messages, export evidence, view audit; EMPLOYEE view principals +
 *   personal data, manage requests; AUDITOR view principals (masked),
 *   view audit log, export evidence -- no write permission of any kind.
 */
export interface RoleSeed {
  code: "ADMIN" | "DPO" | "COMPLIANCE_MANAGER" | "EMPLOYEE" | "AUDITOR";
  name: string;
  isSystem: true;
  permissionCodes: readonly string[];
}

export const ROLES: readonly RoleSeed[] = [
  {
    code: "ADMIN",
    name: "Administrator",
    isSystem: true,
    permissionCodes: ALL_PERMISSION_CODES,
  },
  {
    code: "DPO",
    name: "Data Protection Officer",
    isSystem: true,
    permissionCodes: ALL_PERMISSION_CODES.filter(
      (code) => code !== "CAN_MANAGE_EMPLOYEES",
    ),
  },
  {
    code: "COMPLIANCE_MANAGER",
    name: "Compliance Manager",
    isSystem: true,
    permissionCodes: [
      "CAN_VIEW_PRINCIPALS",
      "CAN_VIEW_ALL_PERSONAL_DATA",
      "CAN_RUN_SYNC",
      "CAN_RESOLVE_IDENTITIES",
      "CAN_MANAGE_PURPOSES",
      "CAN_MANAGE_REGISTERS",
      "CAN_MANAGE_REQUESTS",
      "CAN_MANAGE_CONSENTS",
      "CAN_SEND_MESSAGES",
      "CAN_EXPORT_EVIDENCE",
      "CAN_VIEW_AUDIT_LOG",
    ],
  },
  {
    code: "EMPLOYEE",
    name: "Employee",
    isSystem: true,
    permissionCodes: [
      "CAN_VIEW_PRINCIPALS",
      "CAN_VIEW_ALL_PERSONAL_DATA",
      "CAN_MANAGE_REQUESTS",
    ],
  },
  {
    code: "AUDITOR",
    name: "Auditor",
    isSystem: true,
    // Deliberately read-only: view principals (masked -- no
    // CAN_VIEW_ALL_PERSONAL_DATA), view audit log, export evidence. No
    // CAN_MANAGE_*/CAN_RUN_*/CAN_CHANGE_*/CAN_RESOLVE_*/CAN_APPROVE_*/
    // CAN_SEND_* code appears here.
    permissionCodes: [
      "CAN_VIEW_PRINCIPALS",
      "CAN_VIEW_AUDIT_LOG",
      "CAN_EXPORT_EVIDENCE",
    ],
  },
];
