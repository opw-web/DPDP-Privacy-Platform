import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import {
  AccessTokenPayload,
  TokenService,
} from "../../modules/auth/token.service";

/**
 * Registered globally (see `AuthModule`'s `APP_GUARD` provider) so every
 * route requires a verified `aud: "employee"` access token unless marked
 * `@Public()`. There is no self-signup endpoint and no other way into the
 * API.
 *
 * Verifies independently of `TenantMiddleware` -- the middleware's decode
 * is loose (any recognized actor audience, used only to populate
 * `TenantContext` early) and is NOT a substitute for this guard's strict,
 * audience-pinned check. This is what makes "an employee token must fail
 * on a principal route and vice versa" (spec line 697) actually true: the
 * guard rejects on `aud` mismatch exactly as it would on a bad signature.
 */
@Injectable()
export class JwtEmployeeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { actor?: AccessTokenPayload }>();
    const header = request.headers["authorization"];
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing access token");
    }
    const token = header.slice("Bearer ".length);
    const payload = this.tokenService.verifyAccessToken(token, "employee");
    request.actor = payload;
    return true;
  }
}
