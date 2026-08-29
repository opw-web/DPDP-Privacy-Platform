import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../../modules/auth/token.service";

/**
 * The shape `PermissionsGuard` (and, later, `@CurrentActorPermissions()`)
 * expects on the request. `actor` is set by `JwtEmployeeGuard`, which
 * this guard's request lifecycle position guarantees runs first (see the
 * class doc below). `actorPermissions` is this guard's own per-request
 * cache.
 */
export type PermissionsRequest = Request & {
  actor?: AccessTokenPayload;
  actorPermissions?: ReadonlySet<string>;
};

/**
 * Enforces `@RequirePermission('CAN_X')` (metadata Task 5 already applies
 * to every route that needs it) against the calling employee's ACTUAL,
 * current role-permission set.
 *
 * Registered globally as the SECOND `APP_GUARD` in `AppModule`, after
 * `JwtEmployeeGuard`. Nest runs multiple `APP_GUARD` providers in
 * registration order, so by the time this guard's `canActivate` runs,
 * `JwtEmployeeGuard` has already either rejected the request or attached
 * a verified `request.actor` -- this guard is never the thing deciding
 * WHETHER a caller is authenticated, only WHAT a verified caller is
 * allowed to do. A route with no `@RequirePermission` metadata (public
 * auth routes, `GET /api/auth/employee/me`, every principal-portal route)
 * passes straight through untouched.
 *
 * NEVER compares role names or codes -- only permission codes read off
 * `RolePermission` rows. A role literally named "AUDITOR" that happens to
 * hold `CAN_MANAGE_EMPLOYEES` is let through; a role literally named
 * "ADMIN" that does not hold it is rejected. `rbac.e2e-spec.ts` asserts
 * this directly, by name.
 *
 * Cache scope -- why it cannot go stale: this guard reads
 * `RolePermission` rows FROM THE DATABASE fresh on every request that
 * reaches it (via `PrismaService`, the raw/unscoped client, filtered
 * explicitly by `(employeeId, organizationId)` taken from the verified
 * access token -- never from anything caller-suppliable, and not
 * dependent on `TenantContext` timing). The resolved `Set<string>` is
 * cached ONLY on `request.actorPermissions`, an object that is created
 * fresh by Express for every incoming request and discarded when it
 * finishes. There is no module-level, class-level, or process-level map
 * from employeeId to permissions anywhere in this file: nothing here
 * outlives a single request. Concretely, this means a permission revoked
 * via `PATCH /api/roles/:id/permissions` takes effect on that employee's
 * VERY NEXT request -- even though their 15-minute access token is
 * unchanged and still verifies fine -- because the next request builds a
 * brand new `actorPermissions` set from the row(s) as they stand at that
 * moment. `rbac.e2e-spec.ts`'s "revoke-then-retry-same-token" test
 * exercises exactly this.
 *
 * The per-request cache still earns its keep even though this guard
 * itself only ever needs to resolve permissions once per request: it is
 * the SAME set `@CurrentActorPermissions()` (see that decorator) hands to
 * a controller for a masking decision later in the SAME request, so a
 * handler that needs "does this actor hold CAN_VIEW_ALL_PERSONAL_DATA"
 * for `MaskingService.maskIfNeeded()` does not re-query the database for
 * something this guard already resolved moments earlier.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<
      string | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PermissionsRequest>();
    const actor = request.actor;
    if (!actor) {
      // @RequirePermission on a route with no verified employee actor --
      // either misconfigured (@RequirePermission alongside @Public()) or
      // reached in a context this guard was never meant to run in. Either
      // way: deny. Never resolve "permissions" for an unauthenticated
      // caller.
      throw new UnauthorizedException(
        "No authenticated employee actor to check permissions against",
      );
    }

    const permissions = await this.resolvePermissions(request, actor);

    if (!permissions.has(requiredPermission)) {
      throw new ForbiddenException(
        `Missing required permission: ${requiredPermission}`,
      );
    }
    return true;
  }

  private async resolvePermissions(
    request: PermissionsRequest,
    actor: AccessTokenPayload,
  ): Promise<ReadonlySet<string>> {
    if (request.actorPermissions) {
      return request.actorPermissions;
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: actor.sub, organizationId: actor.organizationId },
      select: {
        role: {
          select: { permissions: { select: { permissionCode: true } } },
        },
      },
    });

    const permissions: ReadonlySet<string> = new Set(
      employee?.role.permissions.map((p) => p.permissionCode) ?? [],
    );
    request.actorPermissions = permissions;
    return permissions;
  }
}
