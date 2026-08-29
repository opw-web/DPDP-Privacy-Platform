import { Injectable, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as argon2 from "argon2";
import type { Employee } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext, TenantStore } from "../../common/tenant/tenant-context";
import { AuditService } from "../../common/audit/audit.service";
import { TokenService, REFRESH_TOKEN_TTL_MS } from "./token.service";

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

export interface LoginRequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * A hash of a fixed, never-used password, computed once on first use and
 * cached. When a login attempt names an email that matches no employee
 * anywhere, this service still runs `argon2.verify` against this dummy
 * hash before responding -- so an unknown email and a known email with a
 * wrong password take roughly the same amount of work, and the HTTP
 * response (401, identical body) is identical either way. This is the
 * "must not reveal whether the email exists" requirement: the leak vector
 * is the response and its timing, not the (per-tenant, unreadable to an
 * attacker) audit log.
 */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash("not-a-real-password-used-only-for-timing", {
    type: argon2.argon2id,
  });
  return dummyHash;
}

const GENERIC_LOGIN_FAILURE_MESSAGE = "Invalid email or password";

@Injectable()
export class EmployeeAuthService {
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
   * exists for -- and takes the first match. Flagged here rather than
   * silently assumed: if the platform ever needs multiple organizations
   * sharing an email, login needs an explicit org selector.
   */
  async login(
    email: string,
    password: string,
    meta: LoginRequestMeta = {},
  ): Promise<EmployeeLoginResult> {
    const employee = await this.prisma.employee.findFirst({
      where: { email },
    });

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

    type Outcome =
      | { kind: "invalid" }
      | { kind: "reuse" }
      | { kind: "expired" }
      | { kind: "ok"; accessToken: string; refreshToken: string };

    const outcome = await TenantContext.run(store, () =>
      this.prisma.scoped.$transaction(async (tx): Promise<Outcome> => {
        const existing = await tx.refreshToken.findFirst({
          where: { tokenHash },
        });
        if (!existing) {
          return { kind: "invalid" };
        }

        if (existing.revokedAt) {
          await tx.refreshToken.updateMany({
            where: {
              actorType: "EMPLOYEE",
              actorId: payload.sub,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
          await this.auditService.record(tx, {
            action: "TOKEN_REUSE_DETECTED",
            resourceType: "RefreshToken",
            resourceId: existing.id,
            metadata: { actorId: payload.sub },
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
          });
          return { kind: "reuse" };
        }

        if (existing.expiresAt.getTime() < Date.now()) {
          return { kind: "expired" };
        }

        await tx.refreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() },
        });

        const employee = await tx.employee.findFirstOrThrow({
          where: { id: payload.sub },
        });
        const {
          accessToken,
          refreshToken: newRefreshToken,
          tokenHash: newHash,
          expiresAt,
        } = await this.issueTokenPair(employee);
        await tx.refreshToken.create({
          data: {
            actorType: "EMPLOYEE",
            actorId: employee.id,
            tokenHash: newHash,
            expiresAt,
          } as never,
        });
        return { kind: "ok", accessToken, refreshToken: newRefreshToken };
      }),
    );

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
