import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../tenant/tenant-context";
import { allocateCounterValue } from "./counter";

const PRINCIPAL_REFERENCE_COUNTER = "PRINCIPAL";
const PRINCIPAL_REFERENCE_DIGITS = 6;

/**
 * Allocates gap-free, per-organization sequence numbers backed by the
 * `Counter` table (spec line 967) -- the same lock-then-increment
 * mechanism `AuditService` uses for the `AUDIT` counter, exposed here for
 * any other named sequence (e.g. human-facing principal references).
 */
@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allocates the next value of `Counter(currentOrgId, name)`. Opens its
   * own transaction (unlike `AuditService.record`, which must run inside
   * the caller's transaction) since callers of `next()` generally just
   * want a number, not a write they need to coordinate with.
   */
  async next(name: string): Promise<bigint> {
    const { organizationId } = TenantContext.get();
    return this.prisma.scoped.$transaction((tx) =>
      allocateCounterValue(tx, organizationId, name),
    );
  }

  /** Allocates and formats the next principal reference as `DP-000123`. */
  async nextPrincipalReference(): Promise<string> {
    const value = await this.next(PRINCIPAL_REFERENCE_COUNTER);
    return `DP-${value.toString().padStart(PRINCIPAL_REFERENCE_DIGITS, "0")}`;
  }
}
