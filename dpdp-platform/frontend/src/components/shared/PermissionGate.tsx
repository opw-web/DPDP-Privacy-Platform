import type { ReactNode } from "react";
import { usePermission, type PermissionCode } from "../../lib/permissions";

interface PermissionGateProps {
  permission: PermissionCode;
  children: ReactNode;
  /** Rendered instead of `children` when the permission is absent. Defaults to nothing. */
  fallback?: ReactNode;
}

/**
 * Hides UI the current employee cannot use. This is COSMETIC ONLY -- it
 * never compares a role name, and it is not the enforcement point. Every
 * server route this gates is independently protected by
 * `@RequirePermission()` + `PermissionsGuard`; a forged request against a
 * hidden action must still 403 there. Removing or bypassing this
 * component changes nothing about what the actor can actually do.
 */
export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const allowed = usePermission(permission);
  return <>{allowed ? children : fallback}</>;
}
