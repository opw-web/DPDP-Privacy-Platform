import { useEmployeeAuth } from "./auth";

/**
 * The full `CAN_*` catalogue, transcribed from
 * `dpdp-platform/backend/prisma/seed/permissions.ts` (itself transcribed
 * from the spec). Kept as a closed union so a typo in a `<PermissionGate
 * permission="...">` call fails to typecheck instead of silently always
 * hiding.
 */
export type PermissionCode =
  | "CAN_VIEW_PRINCIPALS"
  | "CAN_VIEW_ALL_PERSONAL_DATA"
  | "CAN_MANAGE_DATA_SOURCES"
  | "CAN_RUN_SYNC"
  | "CAN_RESOLVE_IDENTITIES"
  | "CAN_MANAGE_EMPLOYEES"
  | "CAN_VIEW_AUDIT_LOG"
  | "CAN_CHANGE_ORG_SETTINGS"
  | "CAN_MANAGE_PURPOSES"
  | "CAN_MANAGE_REGISTERS"
  | "CAN_EXPORT_EVIDENCE"
  | "CAN_MANAGE_NOTICES"
  | "CAN_MANAGE_CONSENTS"
  | "CAN_MANAGE_REQUESTS"
  | "CAN_SEND_MESSAGES"
  | "CAN_SEND_BREACH_NOTICES"
  | "CAN_MANAGE_BREACHES"
  | "CAN_MANAGE_RETENTION"
  | "CAN_APPROVE_ERASURE"
  | "CAN_MANAGE_CHILD_DATA"
  | "CAN_CHANGE_COMPLIANCE_CONFIG"
  | "CAN_MANAGE_SDF";

/**
 * Never a role-name comparison -- a plain `Set`/array membership check
 * against the actor's own resolved `CAN_*` codes. This is COSMETIC ONLY:
 * hiding a control here saves a wasted round trip, it does not grant
 * anything. Every one of these endpoints is independently guarded server
 * side by `PermissionsGuard` + `@RequirePermission()`, which is the actual
 * enforcement point -- forging a hidden action must still 403.
 */
export function hasPermission(
  permissions: readonly string[],
  code: PermissionCode,
): boolean {
  return permissions.includes(code);
}

/** Reads the current employee's resolved permission set (see `EmployeeSession` in `auth.ts` for why it may legitimately be empty today). */
export function usePermission(code: PermissionCode): boolean {
  const { employee } = useEmployeeAuth();
  return hasPermission(employee?.permissions ?? [], code);
}
