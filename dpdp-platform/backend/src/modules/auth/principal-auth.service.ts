import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext, TenantStore } from "../../common/tenant/tenant-context";
import { AuditService } from "../../common/audit/audit.service";
import { TokenService, REFRESH_TOKEN_TTL_MS } from "./token.service";
import { getDummyHash } from "./dummy-hash.util";
import { rotateRefreshToken } from "./refresh-rotation.util";
import type { LoginRequestMeta } from "./login-request-meta";
import type { PrincipalActor } from "../../common/guards/jwt-principal.guard";

/**
 * The ONLY shape of `PrincipalAccount` this service (or the controller
 * behind it) ever returns. `passwordHash` is credential material and must
 * never cross the trust boundary -- the same discipline
 * `EMPLOYEE_PUBLIC_SELECT` (task 5) enforces for `Employee`. A single
 * shared constant so every call site (login response, `me()`) stays in
 * sync and a dropped `select` fails to typecheck rather than silently
 * re-opening the leak.
 */
export const PRINCIPAL_ACCOUNT_PUBLIC_SELECT = {
  id: true,
  organizationId: true,
  dataPrincipalId: true,
  email: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.PrincipalAccountSelect;

export type PublicPrincipalAccount = Prisma.PrincipalAccountGetPayload<{
  select: typeof PRINCIPAL_ACCOUNT_PUBLIC_SELECT;
}>;

export interface PrincipalLoginResult {
  accessToken: string;
  refreshToken: string;
  account: PublicPrincipalAccount;
}

export interface PrincipalRefreshResult {
  accessToken: string;
  refreshToken: string;
}

const GENERIC_LOGIN_FAILURE_MESSAGE = "Invalid email or password";

/**
 * Portal login for `PrincipalAccount` -- a model deliberately SEPARATE
 * from `DataPrincipal` (spec 266-275): `PrincipalAccount` is the login
 * credential, `DataPrincipal` is the record about a person the fiduciary
 * holds. One `PrincipalAccount` names exactly one `DataPrincipal` via
 * `dataPrincipalId`; nothing here ever lets a caller supply that id.
 *
 * Mirrors `EmployeeAuthService` (task 5) mechanically -- argon2id, the
 * same `TokenService` with `aud: "principal"` / `"principal-refresh"`,
 * the same fail-loud handling of an ambiguous (cross-tenant) email match,
 * and the same commit-then-throw refresh-rotation discipline, now shared
 * via `rotateRefreshToken` (see that file's docstring). Deliberately
 * DIFFERENT from employee auth: `PrincipalAccount.status` additionally
 * gates login (`UNCLAIMED`/`LOCKED` cannot log in, `EmployeeStatus` has no
 * equivalent third state), a successful login also writes an INBOUND
 * `PrincipalContactEvent` and updates
 * `DataPrincipal.lastPrincipalContactAt`/`lastPrincipalContactSource`
 * (GO-08/GO-09/RE-09 -- portal login IS principal-initiated contact), and
 * `passwordHash` is nullable (an `UNCLAIMED` account may have none yet).
 */
@Injectable()
export class PrincipalAuthService {
  private readonly logger = new Logger(PrincipalAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  private storeFor(account: {
    organizationId: string;
    id: string;
    email: string;
    dataPrincipalId: string;
  }): TenantStore {
    return {
      organizationId: account.organizationId,
      actorType: "PRINCIPAL",
      actorId: account.id,
      actorLabel: account.email,
      dataPrincipalId: account.dataPrincipalId,
    };
  }

  private async issueTokenPair(account: {
    id: string;
    organizationId: string;
    email: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    tokenHash: string;
    expiresAt: Date;
  }> {
    const claims = {
      sub: account.id,
      organizationId: account.organizationId,
      actorLabel: account.email,
    };
    const accessToken = this.tokenService.signAccessToken(claims, "principal");
    const jti = randomUUID();
    const refreshToken = this.tokenService.signRefreshToken(
      claims,
      "principal-refresh",
      jti,
    );
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    return { accessToken, refreshToken, tokenHash, expiresAt };
  }

  /**
   * Email lookup mirrors `EmployeeAuthService.login`'s Important-1 fix:
   * `PrincipalAccount`'s uniqueness constraint is `[organizationId,
   * email]`, not global, so this fails LOUDLY (rather than picking an
   * arbitrary row) if the same email happens to exist in more than one
   * organization.
   */
  async login(
    email: string,
    password: string,
    meta: LoginRequestMeta = {},
  ): Promise<PrincipalLoginResult> {
    const candidates = await this.prisma.principalAccount.findMany({
      where: { email },
    });

    if (candidates.length > 1) {
      this.logger.error(
        `Ambiguous principal login: email "${email}" matches ` +
          `${candidates.length} PrincipalAccount rows across organizations ` +
          `[${candidates.map((c) => c.organizationId).join(", ")}]. ` +
          "Refusing to authenticate against an arbitrarily chosen row.",
      );
      throw new Error(
        `Ambiguous principal login for email "${email}": matches more ` +
          `than one organization.`,
      );
    }

    const account = candidates[0];

    if (!account) {
      await argon2.verify(await getDummyHash(), password).catch(() => false);
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE_MESSAGE);
    }

    // UNCLAIMED (no password ever set) and LOCKED accounts cannot log in.
    // Only ACTIVE may. A null passwordHash (UNCLAIMED, or a defensive
    // data state) still runs the dummy-hash comparison so the timing and
    // response are identical to a wrong-password ACTIVE account.
    const canAttemptPassword =
      account.status === "ACTIVE" && account.passwordHash !== null;
    const passwordOk = canAttemptPassword
      ? await argon2
          .verify(account.passwordHash as string, password)
          .catch(() => false)
      : await argon2.verify(await getDummyHash(), password).catch(() => false);

    if (!canAttemptPassword || !passwordOk) {
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE_MESSAGE);
    }

    const store = this.storeFor(account);
    const { accessToken, refreshToken, tokenHash, expiresAt } =
      await this.issueTokenPair(account);

    const publicAccount = await TenantContext.run(store, () =>
      this.prisma.scoped.$transaction(async (tx) => {
        await tx.refreshToken.create({
          data: {
            actorType: "PRINCIPAL",
            actorId: account.id,
            tokenHash,
            expiresAt,
            // organizationId deliberately omitted -- see the identical
            // comment in EmployeeAuthService.login.
          } as never,
        });
        const updated = await tx.principalAccount.update({
          where: { id: account.id },
          data: { lastLoginAt: new Date() },
          select: PRINCIPAL_ACCOUNT_PUBLIC_SELECT,
        });
        await tx.principalContactEvent.create({
          data: {
            dataPrincipalId: account.dataPrincipalId,
            direction: "INBOUND",
            channel: "PORTAL_LOGIN",
          } as never,
        });
        await tx.dataPrincipal.update({
          where: { id: account.dataPrincipalId },
          data: {
            lastPrincipalContactAt: new Date(),
            lastPrincipalContactSource: "PORTAL_LOGIN",
          },
        });
        await this.auditService.record(tx, {
          action: "PRINCIPAL_LOGIN_SUCCEEDED",
          resourceType: "PrincipalAccount",
          resourceId: account.id,
          subjectPrincipalId: account.dataPrincipalId,
          metadata: { email },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        return updated;
      }),
    );

    return { accessToken, refreshToken, account: publicAccount };
  }

  /**
   * See `rotateRefreshToken`'s docstring for the shared commit-then-throw
   * rotation/reuse-detection core. Only the actor-specific parts
   * (`PrincipalAccount` lookup, principal claims) live here.
   */
  async refresh(
    refreshTokenRaw: string,
    meta: LoginRequestMeta = {},
  ): Promise<PrincipalRefreshResult> {
    const payload = this.tokenService.verifyRefreshToken(
      refreshTokenRaw,
      "principal-refresh",
    );
    const tokenHash = this.tokenService.hashRefreshToken(refreshTokenRaw);

    // Two things this lookup buys, combined into one query:
    //   1. `dataPrincipalId` -- required to build a well-typed `PRINCIPAL`
    //      `TenantStore` (see tenant-context.ts's discriminated union) but
    //      never carried in the refresh JWT itself. Resolved the same way
    //      `JwtPrincipalGuard` resolves it: scoped by `(id, organizationId)`
    //      both taken from the verified, server-signed token.
    //   2. `status: "ACTIVE"` (task 6 fix-round-1, Important 2) -- a
    //      `LOCKED` account's existing refresh token must stop working,
    //      not just be unable to start a NEW session. Filtering it into
    //      this same lookup means a locked account falls through to the
    //      existing "Invalid refresh token" 401 below with no new error
    //      path, exactly like an unrecognized token.
    const account = await this.prisma.principalAccount.findFirst({
      where: {
        id: payload.sub,
        organizationId: payload.organizationId,
        status: "ACTIVE",
      },
    });
    if (!account) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const store: TenantStore = {
      organizationId: payload.organizationId,
      actorType: "PRINCIPAL",
      actorId: payload.sub,
      actorLabel: payload.actorLabel,
      dataPrincipalId: account.dataPrincipalId,
    };

    const outcome = await TenantContext.run(store, () =>
      this.prisma.scoped.$transaction((tx) =>
        rotateRefreshToken(tx, this.auditService, {
          actorType: "PRINCIPAL",
          actorId: payload.sub,
          tokenHash,
          meta,
          issueNewTokenPair: async () => {
            const {
              accessToken,
              refreshToken: newRefreshToken,
              tokenHash: newHash,
              expiresAt,
            } = await this.issueTokenPair(account);
            return {
              accessToken,
              refreshToken: newRefreshToken,
              tokenHash: newHash,
              expiresAt,
            };
          },
        }),
      ),
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
        "principal-refresh",
      );
    } catch {
      return;
    }
    const tokenHash = this.tokenService.hashRefreshToken(refreshTokenRaw);

    // `dataPrincipalId` is required to build a well-typed `PRINCIPAL`
    // `TenantStore` (see tenant-context.ts) even though this method never
    // filters a query by it -- resolved the same way as `refresh()`
    // above. Logout stays idempotent: if the account cannot be resolved
    // (already gone, or the token names an id that never matches), this
    // silently does nothing, same as an already-revoked/unknown token.
    const account = await this.prisma.principalAccount.findFirst({
      where: { id: payload.sub, organizationId: payload.organizationId },
    });
    if (!account) {
      return;
    }

    const store: TenantStore = {
      organizationId: payload.organizationId,
      actorType: "PRINCIPAL",
      actorId: payload.sub,
      actorLabel: payload.actorLabel,
      dataPrincipalId: account.dataPrincipalId,
    };
    await TenantContext.run(store, () =>
      this.prisma.scoped.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  /**
   * `GET /api/auth/principal/me`'s data access, moved out of the
   * controller (task 6 fix-round-1, Minor) -- every other read in this
   * codebase goes through a service, and this is the one place the
   * `dataPrincipalId`-in-`TenantStore` convention Task 22 must copy is
   * demonstrated, so the demonstration needs to live in the layer Task 22
   * will actually be writing in.
   *
   * `principal` comes from `@CurrentPrincipal()`, itself populated only by
   * `JwtPrincipalGuard` after independently verifying `aud: "principal"`
   * and resolving the `PrincipalAccount` row -- never from a caller-
   * supplied id.
   */
  async me(principal: PrincipalActor): Promise<PublicPrincipalAccount> {
    const store: TenantStore = {
      organizationId: principal.organizationId,
      actorType: "PRINCIPAL",
      actorId: principal.actorId,
      actorLabel: principal.actorLabel,
      dataPrincipalId: principal.dataPrincipalId,
    };
    return TenantContext.run(store, () =>
      this.prisma.scoped.principalAccount.findFirstOrThrow({
        where: { id: principal.actorId },
        select: PRINCIPAL_ACCOUNT_PUBLIC_SELECT,
      }),
    );
  }
}
