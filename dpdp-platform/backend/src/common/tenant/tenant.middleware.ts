import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { TokenService } from "../../modules/auth/token.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext, TenantStore } from "./tenant-context";

/**
 * Populates the tenant context from the incoming request's access token.
 *
 * Verification here is deliberately LOOSE: `TokenService.decodeActorAccessToken`
 * checks signature and expiry and that `aud` is some recognized
 * actor-access audience, but does not pin to exactly one. That is on
 * purpose -- this middleware's only job is to get `{ organizationId,
 * actorType, actorId, actorLabel }` into `AsyncLocalStorage` early enough
 * for any tenant-scoped work downstream (audit writes, access logging) to
 * find it. It is NOT the authorization boundary: `JwtEmployeeGuard` (and
 * `JwtPrincipalGuard`) independently re-verify the token against the
 * EXACT audience its route requires and reject on mismatch -- that is
 * what actually makes "an employee token must fail on a principal route
 * and vice versa" true. A request with no token, or a token that fails
 * even this loose check, proceeds with no context bound: a handler that
 * then reaches a tenant-scoped Prisma query fails loudly
 * (`TenantContext.get()` throws) rather than silently running unscoped,
 * and a route requiring auth is rejected by the guard, never by this
 * middleware.
 *
 * `TenantStore` is a discriminated union (task 6 fix-round-1, Important
 * 1): a `PRINCIPAL` store requires `dataPrincipalId`, which is not
 * carried in the JWT (see `TokenService`). To keep `TenantStore` genuinely
 * impossible to construct without it -- rather than merely documenting
 * the convention -- this middleware resolves the `PrincipalAccount` row
 * for a principal-audience token the SAME way `JwtPrincipalGuard` does,
 * via the RAW `PrismaService` filtered by `(id, organizationId)` both
 * taken from the verified token, never from anything caller-suppliable.
 * This is a second lookup on routes `JwtPrincipalGuard` also protects
 * (accepted cost of making the type structurally sound everywhere,
 * instead of loose here and strict only in one guard) and the ONLY lookup
 * on routes with no guard at all reached before this middleware. If the
 * account cannot be resolved (e.g. deleted between token issuance and
 * this request), this middleware proceeds with NO context bound -- same
 * fail-open-to-no-context behaviour as an unrecognized/expired token,
 * never a fabricated or empty `dataPrincipalId`.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.headers["authorization"];
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      next();
      return;
    }

    const token = header.slice("Bearer ".length);
    const payload = this.tokenService.decodeActorAccessToken(token);
    if (!payload) {
      next();
      return;
    }

    let store: TenantStore;
    if (payload.aud === "principal") {
      const account = await this.prisma.principalAccount
        .findFirst({
          where: { id: payload.sub, organizationId: payload.organizationId },
        })
        .catch(() => null);
      if (!account) {
        next();
        return;
      }
      store = {
        organizationId: payload.organizationId,
        actorType: "PRINCIPAL",
        actorId: payload.sub,
        actorLabel: payload.actorLabel,
        dataPrincipalId: account.dataPrincipalId,
      };
    } else {
      store = {
        organizationId: payload.organizationId,
        actorType: "EMPLOYEE",
        actorId: payload.sub,
        actorLabel: payload.actorLabel,
      };
    }

    TenantContext.run(store, () => next());
  }
}
