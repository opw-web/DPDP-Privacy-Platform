import { SetMetadata } from "@nestjs/common";

/**
 * Metadata key `PermissionsGuard` (Task 7) reads to enforce one or more
 * permission codes against the current actor's role.
 *
 * Task 5 applies `@RequirePermission('CAN_X')` to every route the spec's
 * endpoint table (lines 794-799) names a permission for -- but does NOT
 * build the guard that enforces it. That split is a deliberate controller
 * ruling from the task brief, not an oversight: the metadata needs to
 * exist on the routes now so Task 7 has something to enforce against
 * without touching every controller again.
 */
export const PERMISSION_KEY = "requiredPermission";

/**
 * `@RequirePermission('CAN_X', 'CAN_Y', ...)` -- variadic, per the Task 7
 * brief's own signature (Task 7 review Minor: the first cut shipped only
 * a single-argument form; every route registered so far happens to need
 * exactly one code, so nothing broke, but a later task passing more than
 * one would have been silently truncated to metadata's last-write-wins
 * behavior instead of getting a real multi-code check).
 *
 * Multiple codes are OR'd: `PermissionsGuard` allows the request through
 * if the actor's role holds ANY ONE of the listed codes, not all of them.
 * This is a deliberate choice, not a default that fell out of the
 * implementation -- there is no route in this codebase yet that needs
 * "holds capability A AND capability B simultaneously" (that would need
 * its own AND-shaped decorator or an explicit second check in the
 * handler), but "reachable by whichever of these roles/capabilities
 * applies" is the common shape for a shared route (e.g. a settings page
 * some orgs gate behind CAN_CHANGE_ORG_SETTINGS and others might one day
 * gate behind a narrower delegated permission). Document any future
 * AND-shaped requirement explicitly at its call site rather than
 * overloading this decorator's semantics.
 */
export const RequirePermission = (
  ...permissionCodes: string[]
): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSION_KEY, permissionCodes);
