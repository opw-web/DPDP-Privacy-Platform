import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { PermissionsRequest } from "../guards/permissions.guard";

/**
 * Reads the current employee actor's resolved permission-code set off the
 * request -- put there by `PermissionsGuard` while checking
 * `@RequirePermission`. Tasks 20-21 use this to decide masking
 * (`MaskingService.maskIfNeeded(actorPermissions, field, value)`) without
 * a second database round trip for the same request's already-resolved
 * permissions.
 *
 * Returns an empty set (never throws, never `undefined`) if
 * `PermissionsGuard` has not run on this route -- e.g. a route with no
 * `@RequirePermission` metadata. A handler that needs a masking decision
 * MUST put `@RequirePermission('CAN_VIEW_PRINCIPALS')` (or stronger) on
 * its route, both because that is the actual authorization boundary and
 * because it is what makes this decorator's return value meaningful
 * rather than silently empty.
 */
export const CurrentActorPermissions = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ReadonlySet<string> => {
    const request = ctx.switchToHttp().getRequest<PermissionsRequest>();
    return request.actorPermissions ?? new Set<string>();
  },
);
