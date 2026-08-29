import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/**
 * Populates the tenant context from the incoming request.
 *
 * Task 5 fills this in: verify the request's JWT, read
 * `{ organizationId, actorType, actorId, actorLabel }` off its claims, and
 * wrap `next()` in `TenantContext.run(store, next)`.
 *
 * Until then there is no auth scheme to invent here, so this is a
 * deliberate no-op -- it neither authenticates nor rejects the request.
 * With no context bound, any handler that reaches a tenant-scoped Prisma
 * query fails loudly (`TenantContext.get()` throws) instead of silently
 * running unscoped. That is the correct failure mode for "auth isn't
 * wired up yet": a 500, never an accidental cross-tenant query.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    next();
  }
}
