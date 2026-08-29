import { SetMetadata } from "@nestjs/common";

/**
 * Metadata key `PermissionsGuard` (Task 7) will read to enforce a
 * permission code against the current actor's role.
 *
 * Task 5 applies `@RequirePermission('CAN_X')` to every route the spec's
 * endpoint table (lines 794-799) names a permission for -- but does NOT
 * build the guard that enforces it. That split is a deliberate controller
 * ruling from the task brief, not an oversight: the metadata needs to
 * exist on the routes now so Task 7 has something to enforce against
 * without touching every controller again.
 */
export const PERMISSION_KEY = "requiredPermission";

export const RequirePermission = (
  permissionCode: string,
): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSION_KEY, permissionCode);
