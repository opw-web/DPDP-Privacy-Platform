import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import type { AuditService } from "../../common/audit/audit.service";
import type { LoginRequestMeta } from "./login-request-meta";

/**
 * Outcome of one refresh-token rotation attempt. `TNewTokens` is whatever
 * the caller's `issueNewTokenPair` returns on the "ok" branch (e.g. the
 * new access/refresh token strings) -- this helper only cares about the
 * `RefreshToken` row bookkeeping, not what shape of token pair a
 * particular actor type issues.
 */
export type RefreshRotationOutcome<TNewTokens> =
  | { kind: "invalid" }
  | { kind: "reuse" }
  | { kind: "expired" }
  | ({ kind: "ok" } & TNewTokens);

/**
 * The refresh-rotation and reuse-detection core shared by
 * `EmployeeAuthService.refresh` and `PrincipalAuthService.refresh`
 * (task 6 brief: "where the logic is genuinely identical, factor out the
 * shared part rather than copy-pasting it"). Everything actor-specific
 * (looking up the actor row, signing new claims) stays in the caller via
 * `issueNewTokenPair`; this function only touches `RefreshToken` rows and
 * the `TOKEN_REUSE_DETECTED` audit write, which are byte-for-byte the same
 * for both actor types.
 *
 * MUST be called with the caller's own interactive transaction client
 * (`tx`) so the rotation (or the reuse revocation) is atomic with
 * everything else the caller does in the same transaction.
 *
 * Non-obvious ordering this preserves: on a reuse (replay of an
 * already-revoked token), the family revocation and the
 * `TOKEN_REUSE_DETECTED` audit row are written and returned as part of
 * this SAME transaction -- the caller must let that transaction commit
 * and only THEN throw the 401. Throwing here, or having the caller throw
 * before the transaction commits, would roll back the very revocation
 * this mechanism exists to make durable.
 */
export async function rotateRefreshToken<
  TNewTokens extends { tokenHash: string; expiresAt: Date },
>(
  tx: ScopedTransactionClient,
  auditService: AuditService,
  params: {
    actorType: "EMPLOYEE" | "PRINCIPAL";
    actorId: string;
    tokenHash: string;
    meta: LoginRequestMeta;
    issueNewTokenPair: () => Promise<TNewTokens>;
  },
): Promise<RefreshRotationOutcome<TNewTokens>> {
  const existing = await tx.refreshToken.findFirst({
    where: { tokenHash: params.tokenHash },
  });
  if (!existing) {
    return { kind: "invalid" };
  }

  if (existing.revokedAt) {
    await tx.refreshToken.updateMany({
      where: {
        actorType: params.actorType,
        actorId: params.actorId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    await auditService.record(tx, {
      action: "TOKEN_REUSE_DETECTED",
      resourceType: "RefreshToken",
      resourceId: existing.id,
      metadata: { actorId: params.actorId },
      ipAddress: params.meta.ipAddress,
      userAgent: params.meta.userAgent,
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

  const newTokens = await params.issueNewTokenPair();
  await tx.refreshToken.create({
    data: {
      actorType: params.actorType,
      actorId: params.actorId,
      tokenHash: newTokens.tokenHash,
      expiresAt: newTokens.expiresAt,
    } as never,
  });

  return { kind: "ok", ...newTokens };
}
