import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { TokenService } from "../../auth/token.service";
import { PrismaService } from "../../../common/prisma/prisma.service";

/** What every `/api/notifications` handler learns about the caller,
 * regardless of which audience their token carried. Exactly one of
 * `employeeId` / `dataPrincipalId` is non-null, matching `audience`. */
export interface NotificationCallerActor {
  audience: "EMPLOYEE" | "PRINCIPAL";
  organizationId: string;
  employeeId: string | null;
  dataPrincipalId: string | null;
}

/**
 * `/api/notifications` (spec line 886) is the one surface in this
 * codebase a single route must serve for BOTH audiences: "available to
 * any authenticated actor, employee or principal, each seeing only their
 * own rows." Neither existing guard does that alone --
 * `JwtEmployeeGuard` is registered globally and pins `aud: "employee"`;
 * `JwtPrincipalGuard` pins `aud: "principal"` -- so this module (which
 * does not own `src/common/guards/**`) brings its own, following
 * `jwt-principal.guard.ts`'s own pattern: `@Public()` on the route (to
 * dodge the globally-registered `JwtEmployeeGuard`) plus
 * `@UseGuards(JwtAnyActorGuard)` applying this guard's own independent
 * verification.
 *
 * Verification tries `aud: "employee"` first, then falls back to
 * `aud: "principal"` -- `TokenService.verifyAccessToken` enforces an
 * EXACT audience match (jsonwebtoken's `audience` option), so a
 * principal token tried against `"employee"` fails closed and falls
 * through; an employee token tried against `"employee"` succeeds
 * immediately and never reaches the principal branch. A token that
 * matches neither audience (garbage, expired, wrong secret) throws
 * `UnauthorizedException` out of the second `verifyAccessToken` call,
 * same as both existing guards.
 *
 * The principal branch resolves `PrincipalAccount` via the RAW
 * `PrismaService`, filtered by `(id, organizationId)` both taken from
 * the verified token -- the exact same lookup `JwtPrincipalGuard` does,
 * for the same reason (`dataPrincipalId` is not carried in the JWT).
 */
@Injectable()
export class JwtAnyActorGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { notificationActor?: NotificationCallerActor }>();
    const header = request.headers["authorization"];
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing access token");
    }
    const token = header.slice("Bearer ".length);

    try {
      const employeePayload = this.tokenService.verifyAccessToken(
        token,
        "employee",
      );
      request.notificationActor = {
        audience: "EMPLOYEE",
        organizationId: employeePayload.organizationId,
        employeeId: employeePayload.sub,
        dataPrincipalId: null,
      };
      return true;
    } catch {
      // Not an employee-audience token -- fall through and try principal.
      // A genuinely invalid token still gets rejected below, by the
      // principal-audience verification throwing the same
      // UnauthorizedException `JwtPrincipalGuard` would.
    }

    const principalPayload = this.tokenService.verifyAccessToken(
      token,
      "principal",
    );
    const account = await this.prisma.principalAccount.findFirst({
      where: {
        id: principalPayload.sub,
        organizationId: principalPayload.organizationId,
      },
    });
    if (!account) {
      throw new UnauthorizedException("Invalid or expired access token");
    }
    request.notificationActor = {
      audience: "PRINCIPAL",
      organizationId: account.organizationId,
      employeeId: null,
      dataPrincipalId: account.dataPrincipalId,
    };
    return true;
  }
}
