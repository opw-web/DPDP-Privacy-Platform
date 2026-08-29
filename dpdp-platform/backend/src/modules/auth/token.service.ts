import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import type { AppConfig } from "../../config/configuration";

/** Audiences this codebase's actor-access tokens can carry. Task 6 adds "principal". */
export const ACCESS_TOKEN_AUDIENCES = ["employee", "principal"] as const;
export type AccessTokenAudience = (typeof ACCESS_TOKEN_AUDIENCES)[number];

export const REFRESH_TOKEN_AUDIENCES = [
  "employee-refresh",
  "principal-refresh",
] as const;
export type RefreshTokenAudience = (typeof REFRESH_TOKEN_AUDIENCES)[number];

/**
 * Claims carried by every access token this codebase issues, regardless of
 * `aud`. `sub` is the actor's row id (Employee.id today, PrincipalAccount.id
 * once Task 6 lands) -- never a role name or permission list, so nothing
 * downstream can be tempted into `payload.role === 'DPO'`-style checks.
 */
export interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  actorLabel: string;
  aud: AccessTokenAudience;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  organizationId: string;
  actorLabel: string;
  aud: RefreshTokenAudience;
  jti: string;
  iat: number;
  exp: number;
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Issues and verifies the platform's access/refresh JWTs.
 *
 * Deliberately takes `aud` as a parameter on every signing/verifying method
 * rather than hardcoding `"employee"` -- Task 6 (principal auth) reuses
 * this service unmodified with `aud: "principal"` / `"principal-refresh"`,
 * per the task 5 brief's explicit instruction not to make Task 6 fork it.
 *
 * Both audiences share one signing secret per token type
 * (`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`) -- there is only one of each
 * in configuration -- so the `aud` claim, not the secret, is what
 * distinguishes an employee token from a principal token. Verifying a
 * token against an unexpected audience must therefore be treated exactly
 * like a bad signature: reject, don't warn-and-continue. This is the
 * mechanism behind the spec's "an employee token must fail on
 * `/api/me/*` and vice versa" requirement.
 */
@Injectable()
export class TokenService {
  constructor(private readonly configService: ConfigService) {}

  private get accessSecret(): string {
    return this.configService.get<AppConfig>("app")!.jwtAccessSecret;
  }

  private get refreshSecret(): string {
    return this.configService.get<AppConfig>("app")!.jwtRefreshSecret;
  }

  signAccessToken(
    claims: { sub: string; organizationId: string; actorLabel: string },
    aud: AccessTokenAudience,
  ): string {
    return jwt.sign({ ...claims, aud }, this.accessSecret, {
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  signRefreshToken(
    claims: { sub: string; organizationId: string; actorLabel: string },
    aud: RefreshTokenAudience,
    jti: string,
  ): string {
    return jwt.sign({ ...claims, aud, jti }, this.refreshSecret, {
      expiresIn: REFRESH_TOKEN_TTL,
    });
  }

  /**
   * Strict verification for a guard: the caller names the exact audience
   * it will accept, and a mismatch is rejected exactly like a bad
   * signature (jsonwebtoken's `audience` option does this natively).
   */
  verifyAccessToken(
    token: string,
    expectedAud: AccessTokenAudience,
  ): AccessTokenPayload {
    try {
      return jwt.verify(token, this.accessSecret, {
        audience: expectedAud,
      }) as unknown as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }

  verifyRefreshToken(
    token: string,
    expectedAud: RefreshTokenAudience,
  ): RefreshTokenPayload {
    try {
      return jwt.verify(token, this.refreshSecret, {
        audience: expectedAud,
      }) as unknown as RefreshTokenPayload;
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  /**
   * Loose verification used only by `TenantMiddleware`: checks signature
   * and expiry and that `aud` is SOME recognized actor-access audience, but
   * does not commit to which one -- that decision belongs to whichever
   * guard runs next (`JwtEmployeeGuard` today), which is what actually
   * enforces "an employee token must fail on a principal route and vice
   * versa". This method exists only to populate `TenantContext` early
   * enough for tenant-scoped work (e.g. an access-logging write) that might
   * need to happen before a guard runs. Returns `null` rather than
   * throwing on any failure -- an absent or bad token here is not this
   * middleware's failure to report, a downstream guard's is.
   */
  decodeActorAccessToken(token: string): AccessTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.accessSecret) as unknown as {
        aud?: string;
      };
      if (
        !decoded.aud ||
        !(ACCESS_TOKEN_AUDIENCES as readonly string[]).includes(decoded.aud)
      ) {
        return null;
      }
      return decoded as AccessTokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Deterministic digest used to look up a stored refresh token by value.
   * Not a password hash (no argon2id here on purpose): the token itself is
   * a high-entropy signed JWT, so a fast, deterministic digest is what
   * lets `RefreshToken.tokenHash` be looked up with an equality query
   * instead of comparing against every stored row.
   */
  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
