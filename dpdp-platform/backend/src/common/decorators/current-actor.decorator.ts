import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AccessTokenPayload } from "../../modules/auth/token.service";
import type { Request } from "express";

/**
 * Reads the current actor off the request -- put there by `JwtEmployeeGuard`
 * (and, in a later task, its principal equivalent) after independently
 * verifying the access token's signature, expiry AND audience. Controllers
 * never touch `Authorization` headers or decode tokens themselves; this is
 * the one place a handler learns who is calling.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { actor?: AccessTokenPayload }>();
    if (!request.actor) {
      throw new Error(
        "@CurrentActor() used on a route with no actor attached -- is " +
          "JwtEmployeeGuard applied to this route?",
      );
    }
    return request.actor;
  },
);
