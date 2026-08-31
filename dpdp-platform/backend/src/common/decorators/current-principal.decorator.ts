import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { PrincipalActor } from "../guards/jwt-principal.guard";

/**
 * Reads the current principal off the request -- put there by
 * `JwtPrincipalGuard` after independently verifying the access token's
 * signature, expiry, `aud: "principal"`, and resolving the
 * `PrincipalAccount` row to learn `dataPrincipalId`. A route handler
 * NEVER reads an id from the request path/query/body to decide whose data
 * to return -- this decorator's return value is the only source of
 * "which principal is this" allowed on `/api/me/*` (task 22).
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PrincipalActor => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { principalActor?: PrincipalActor }>();
    if (!request.principalActor) {
      throw new Error(
        "@CurrentPrincipal() used on a route with no principal actor " +
          "attached -- is JwtPrincipalGuard applied to this route?",
      );
    }
    return request.principalActor;
  },
);
