import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { TokenService } from "../../modules/auth/token.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The subject a route guarded by `JwtPrincipalGuard` learns about the
 * caller. `actorId` is always `PrincipalAccount.id`, never
 * `DataPrincipal.id` -- the two are deliberately separate models (spec
 * 266-275) -- and `dataPrincipalId` is the one, guard-resolved value every
 * `/api/me/*` route (task 22) is allowed to scope its own data access by.
 * No route under `/api/me` accepts an id parameter; this is the whole
 * reason why not (spec line 840).
 */
export interface PrincipalActor {
  actorType: "PRINCIPAL";
  actorId: string;
  organizationId: string;
  actorLabel: string;
  dataPrincipalId: string;
}

/**
 * The principal-portal counterpart to `JwtEmployeeGuard`. NOT registered
 * globally -- `JwtEmployeeGuard` already is (see `AppModule`'s
 * `APP_GUARD` provider), so every principal route is additionally marked
 * `@Public()` (to skip the global employee guard) and applies this guard
 * itself with `@UseGuards(JwtPrincipalGuard)`.
 *
 * Deliberately does NOT consult `@Public()`/`IS_PUBLIC_KEY` itself (unlike
 * `JwtEmployeeGuard`, which is registered globally and needs that escape
 * hatch for login/refresh/logout). This guard is never registered
 * globally -- it is opted into per-route via `@UseGuards`, on routes that
 * are ALSO `@Public()` so the global employee guard leaves them alone.
 * If this guard honored `@Public()` too, `GET /api/auth/principal/me`
 * (which must carry `@Public()` for that reason) would short-circuit this
 * guard as well and accept ANY request with no token at all -- exactly
 * the bug an earlier version of this file had, caught by this task's own
 * e2e tests.
 *
 * This is also how the audience check runs in BOTH directions without
 * either guard knowing the other exists:
 *   - An EMPLOYEE token on a fiduciary route (not `@Public()`) is
 *     rejected by the global `JwtEmployeeGuard`, which pins
 *     `aud: "employee"` -- a `principal` token fails that check exactly
 *     like a bad signature.
 *   - A PRINCIPAL token on a principal route is verified by THIS guard
 *     against `aud: "principal"` -- an `employee` token fails here the
 *     same way.
 *   - An EMPLOYEE token on a principal route: the route is `@Public()`
 *     (so the global guard waves it through) but THIS guard still runs
 *     and rejects it, because its `aud` is `"employee"`, not
 *     `"principal"`.
 *   - A PRINCIPAL token on a fiduciary route: the route is NOT
 *     `@Public()`, so the global `JwtEmployeeGuard` runs and rejects it
 *     before this guard is ever reached.
 *
 * `dataPrincipalId` is not carried in the JWT (see `TokenService` --
 * `AccessTokenPayload` only ever has `sub`/`organizationId`/`actorLabel`),
 * so unlike `JwtEmployeeGuard` this guard DOES hit the database: it
 * resolves the `PrincipalAccount` row named by the token's `sub` to learn
 * the one `DataPrincipal.id` it is allowed to represent. The lookup is
 * scoped by `(id, organizationId)`, both taken from the verified,
 * server-signed token -- never from anything caller-suppliable -- via the
 * RAW `PrismaService`, because no tenant context is bound yet at guard
 * execution time.
 */
@Injectable()
export class JwtPrincipalGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { principalActor?: PrincipalActor }>();
    const header = request.headers["authorization"];
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing access token");
    }
    const token = header.slice("Bearer ".length);
    const payload = this.tokenService.verifyAccessToken(token, "principal");

    const account = await this.prisma.principalAccount.findFirst({
      where: { id: payload.sub, organizationId: payload.organizationId },
    });
    if (!account) {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    request.principalActor = {
      actorType: "PRINCIPAL",
      actorId: account.id,
      organizationId: account.organizationId,
      actorLabel: account.email,
      dataPrincipalId: account.dataPrincipalId,
    };
    return true;
  }
}
