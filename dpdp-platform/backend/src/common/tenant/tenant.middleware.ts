import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { TokenService } from "../../modules/auth/token.service";
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
 * find it. It is NOT the authorization boundary: `JwtEmployeeGuard` (and,
 * later, its principal equivalent) independently re-verifies the token
 * against the EXACT audience its route requires and rejects on mismatch --
 * that is what actually makes "an employee token must fail on a principal
 * route and vice versa" true. A request with no token, or a token that
 * fails even this loose check, proceeds with no context bound: a handler
 * that then reaches a tenant-scoped Prisma query fails loudly
 * (`TenantContext.get()` throws) rather than silently running unscoped,
 * and a route requiring auth is rejected by the guard, never by this
 * middleware.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tokenService: TokenService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
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

    const store: TenantStore = {
      organizationId: payload.organizationId,
      actorType: payload.aud === "principal" ? "PRINCIPAL" : "EMPLOYEE",
      actorId: payload.sub,
      actorLabel: payload.actorLabel,
    };

    TenantContext.run(store, () => next());
  }
}
