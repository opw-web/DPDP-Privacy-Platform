import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as argon2 from "argon2";
import type { Employee } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext, TenantStore } from "../../common/tenant/tenant-context";
import { AuditService } from "../../common/audit/audit.service";
import { TokenService, REFRESH_TOKEN_TTL_MS } from "./token.service";
import { getDummyHash } from "./dummy-hash.util";
import { rotateRefreshToken } from "./refresh-rotation.util";
import type { LoginRequestMeta } from "./login-request-meta";

export interface EmployeeLoginResult {
  accessToken: string;
  refreshToken: string;
  employee: Pick<
    Employee,
    "id" | "email" | "fullName" | "organizationId" | "roleId"
  >;
}

export interface EmployeeRefreshResult {
  accessToken: string;
  refreshToken: string;
}

export type { LoginRequestMeta };

const GENERIC_LOGIN_FAILURE_MESSAGE = "Invalid email or password";

@Injectable()
export class EmployeeAuthService {
  private readonly logger = new Logger(EmployeeAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  private storeFor(employee: {
    organizationId: string;
    id: string;
    fullName: string;
  }): TenantStore {
    return {
      organizationId: employee.organizationId,
      actorType: "EMPLOYEE",
      actorId: employee.id,
      actorLabel: employee.fullName,
    };
  }

  private async issueTokenPair(employee: {
    id: string;
    organizationId: string;
    fullName: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    tokenHash: string;
    expiresAt: Date;
  }> {
    const claims = {
      sub: employee.id,
      organizationId: employee.organizationId,
      actorLabel: employee.fullName,
    };
    const accessToken = this.tokenService.signAccessToken(claims, "employee");
    const jti = randomUUID();
    const refreshToken = this.tokenService.signRefreshToken(
      claims,
      "employee-refresh",
      jti,
    );
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    return { accessToken, refreshToken, tokenHash, expiresAt };
  }

  /**
   * Note on email lookup: `Employee`'s uniqueness constraint is
   * `[organizationId, email]`, not a global unique on `email` alone -- two
   * different organizations could in principle mint the same employee
   * email. Login has no organization selector (the spec's demo accounts
   * assume one employee per email across the whole platform), so this
   * looks up by email alone via the RAW (unscoped) `PrismaService` --
   * there is no tenant context yet, which is exactly the case that client
   * exists for.
   *
   * Task 5 review ruling (Important 1): do NOT silently pick "whichever
   * row Postgres returns first" if more than one organization happens to
   * have an employee with this email -- that ordering is not guaranteed
   * stable, so the same credentials could authenticate today and fail
   * tomorrow, and the losing organization's employee could never log in.
   * Neither adding an org selector to the login DTO (changes the spec'd
   * API surface) nor a global unique on `email` (changes the schema,
   * transcribed from the spec) is in scope here. Instead: fail LOUDLY --
   * `findMany`, and if more than one row matches, log the collision (both
   * organization ids, so an operator can actually diagnose it) and throw,
   * surfacing as a 500 rather than silently authenticating against an
   * arbitrarily chosen row.
   */
  async login(
    email: string,
    password: string,
    meta: LoginRequestMeta = {},
  ): Promise<EmployeeLoginResult> {
    const candidates = await this.prisma.employee.findMany({
      where: { email },
    });

    if (candidates.length > 1) {
      this.logger.error(
        `Ambiguous employee login: email "${email}" matches ` +
          `${candidates.length} Employee rows across organizations ` +
          `[${candidates.map((c) => c.organizationId).join(", ")}]. ` +
          "Refusing to authenticate against an arbitrarily chosen row -- " +
          "this requires operator intervention (duplicate email across " +
          "tenants).",
      );
      throw new Error(
        `Ambiguous employee login for email "${email}": matches more ` +
          `than one organization.`,
      );
    }

    const employee = candidates[0];

    if (!employee) {
      await argon2.verify(await getDummyHash(), password).catch(() => false);
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE_MESSAGE);
    }

    const passwordOk = await argon2
      .verify(employee.passwordHash, password)
      .catch(() => false);
    const accountActive = employee.status === "ACTIVE";

    if (!passwordOk || !accountActive) {
      const store = this.storeFor(employee);
      await TenantContext.run(store, () =>
        this.prisma.scoped.$transaction(async (tx) => {
          await this.auditService.record(tx, {
            action: "EMPLOYEE_LOGIN_FAILED",
            resourceType: "Employee",
            resourceId: employee.id,
            metadata: {
              email,
              reason: !passwordOk ? "invalid_password" : "account_disabled",
            },
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
          });
        }),
      );
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE_MESSAGE);
    }

    const store = this.storeFor(employee);
    const { accessToken, refreshToken, tokenHash, expiresAt } =
      await this.issueTokenPair(employee);

    await TenantContext.run(store, () =>
      this.prisma.scoped.$transaction(async (tx) => {
        await tx.refreshToken.create({
          data: {
            actorType: "EMPLOYEE",
            actorId: employee.id,
            tokenHash,
            expiresAt,
            // organizationId deliberately omitted -- the tenant-scoping
            // extension supplies it at runtime; the generated Prisma type
            // still requires it at the type level (see
            // tenant-isolation.e2e-spec.ts for the same convention).
          } as never,
        });
        await tx.employee.update({
          where: { id: employee.id },
          data: { lastLoginAt: new Date() },
        });
        await this.auditService.record(tx, {
          action: "EMPLOYEE_LOGIN_SUCCEEDED",
          resourceType: "Employee",
          resourceId: employee.id,
          metadata: { email },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }),
    );

    return {
      accessToken,
      refreshToken,
      employee: {
        id: employee.id,
        email: employee.email,
        fullName: employee.fullName,
        organizationId: employee.organizationId,
        roleId: employee.roleId,
      },
    };
  }

  /**
   * Rotates a refresh token, or -- if the presented token has already been
   * revoked (a replay) -- revokes every still-active `RefreshToken` row for
   * that actor ("the family") and records `TOKEN_REUSE_DETECTED`.
   *
   * The revoke-family branch and the audit write for it MUST commit even
   * though the overall request still fails with 401: the transaction below
   * never throws internally on a "reject" outcome, it returns a tagged
   * result and the caller decides whether to throw only AFTER the
   * transaction has already committed. Throwing from inside the
   * transaction would roll back the very revocation this method exists to
   * make durable.
   */
  async refresh(
    refreshTokenRaw: string,
    meta: LoginRequestMeta = {},
  ): Promise<EmployeeRefreshResult> {
    const payload = this.tokenService.verifyRefreshToken(
      refreshTokenRaw,
      "employee-refresh",
    );
    const tokenHash = this.tokenService.hashRefreshToken(refreshTokenRaw);
    const store: TenantStore = {
      organizationId: payload.organizationId,
      actorType: "EMPLOYEE",
      actorId: payload.sub,
      actorLabel: payload.actorLabel,
    };

    // `status: "ACTIVE"` (mirrors `PrincipalAuthService.refresh`'s fix for
    // the same shape of gap) -- a DISABLED employee's existing refresh
    // token must stop working, not just be unable to start a NEW session.
    // Checked before the transaction opens (rather than inside
    // `issueNewTokenPair`, where `findFirstOrThrow` would throw and roll
    // back the transaction, including the "invalid"/"reuse" bookkeeping
    // `rotateRefreshToken` may have already done) so a disabled employee
    // falls through to the SAME "invalid" outcome -- and therefore the
    // same "Invalid refresh token" 401 below -- as an unrecognized token,
    // with no new, distinguishable error path.
    const outcome = await TenantContext.run(store, async () => {
      const employee = await this.prisma.scoped.employee.findFirst({
        where: { id: payload.sub, status: "ACTIVE" },
      });
      if (!employee) {
        return { kind: "invalid" } as const;
      }
      return this.prisma.scoped.$transaction((tx) =>
        rotateRefreshToken(tx, this.auditService, {
          actorType: "EMPLOYEE",
          actorId: payload.sub,
          tokenHash,
          meta,
          issueNewTokenPair: async () => {
            const {
              accessToken,
              refreshToken: newRefreshToken,
              tokenHash: newHash,
              expiresAt,
            } = await this.issueTokenPair(employee);
            return {
              accessToken,
              refreshToken: newRefreshToken,
              tokenHash: newHash,
              expiresAt,
            };
          },
        }),
      );
    });

    if (outcome.kind !== "ok") {
      throw new UnauthorizedException("Invalid refresh token");
    }
    return {
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
    };
  }

  /** Idempotent: revokes the presented refresh token if it is still valid, otherwise does nothing. */
  async logout(refreshTokenRaw: string | undefined): Promise<void> {
    if (!refreshTokenRaw) {
      return;
    }
    let payload;
    try {
      payload = this.tokenService.verifyRefreshToken(
        refreshTokenRaw,
        "employee-refresh",
      );
    } catch {
      return;
    }
    const tokenHash = this.tokenService.hashRefreshToken(refreshTokenRaw);
    const store: TenantStore = {
      organizationId: payload.organizationId,
      actorType: "EMPLOYEE",
      actorId: payload.sub,
      actorLabel: payload.actorLabel,
    };
    await TenantContext.run(store, () =>
      this.prisma.scoped.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }
}
