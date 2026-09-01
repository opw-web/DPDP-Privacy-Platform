import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { canonicalJson } from "../../common/audit/canonical-json";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface ChainVerificationResult {
  valid: boolean;
  checkedCount: number;
  /** The `AuditEvent.sequence` (decimal string -- BigInt) of the FIRST broken link, or `null` if the chain verified clean. */
  firstBrokenSequence: string | null;
  reason: string | null;
}

/**
 * Re-walks this org's `AuditEvent` hash chain from sequence 1 and reports
 * the FIRST broken link (task 12 brief: "`GET /api/audit-events/verify-chain`
 * ... re-walks the per-org hash chain and reports the first broken
 * sequence").
 *
 * Recomputes exactly what `AuditService.record` wrote (spec line 876):
 * `hash = sha256(previousHash + sequence + action + resourceId +
 * canonicalJson(metadata) + createdAt)` -- reusing the SAME
 * `canonicalJson` the writer uses, per the task brief's own warning ("a
 * verifier that canonicalises differently from the writer reports false
 * breaks"). `metadata` here is the value Prisma deserialized straight
 * back out of the `Json` column, i.e. exactly the same JSON-plain shape
 * `AuditService.record` fed to `canonicalJson` at write time -- there is
 * no Date/BigInt/etc round-trip mismatch to worry about, because nothing
 * survives a `Json` column except JSON-plain values in the first place.
 *
 * A "break" is either:
 *   (a) a row's stored `previousHash` not matching the immediately
 *       preceding row's stored `hash` (someone deleted/reordered/spliced
 *       a row -- impossible through this app's own code, since
 *       `AuditService.record` is the only writer and the DB triggers
 *       forbid UPDATE/DELETE outright, but this walk does not trust that
 *       and checks it directly), or
 *   (b) a row's stored `hash` not matching what recomputing the formula
 *       over its own stored columns produces (someone tampered with a
 *       column value directly, e.g. via a disabled trigger).
 *
 * Ordered by `sequence asc` so "first" means the lowest sequence number
 * at which the chain diverges from what it should be -- not first in
 * whatever order Postgres happens to return rows.
 */
@Injectable()
export class AuditChainService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyChain(): Promise<ChainVerificationResult> {
    const events = await this.prisma.scoped.auditEvent.findMany({
      orderBy: { sequence: "asc" },
      select: {
        sequence: true,
        action: true,
        resourceId: true,
        metadata: true,
        createdAt: true,
        previousHash: true,
        hash: true,
      },
    });

    let expectedPreviousHash: string | null = null;
    let expectedSequence = BigInt(1);
    for (const event of events) {
      // A valid hash chain must begin at sequence 1 and advance without
      // gaps. Checking this independently of previousHash matters because
      // a database operator could remove a row and repair the following
      // row's previousHash/hash while triggers are disabled.
      if (event.sequence !== expectedSequence) {
        return {
          valid: false,
          checkedCount: events.length,
          firstBrokenSequence: event.sequence.toString(),
          reason:
            event.sequence < expectedSequence
              ? "audit sequence is out of order or duplicated"
              : "audit sequence is not contiguous from sequence 1",
        };
      }
      if (event.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          checkedCount: events.length,
          firstBrokenSequence: event.sequence.toString(),
          reason:
            "previousHash does not match the immediately preceding event's hash",
        };
      }

      const hashInput: string =
        (event.previousHash ?? "") +
        event.sequence.toString() +
        event.action +
        (event.resourceId ?? "") +
        canonicalJson(event.metadata) +
        event.createdAt.toISOString();
      const recomputedHash: string = createHash("sha256")
        .update(hashInput)
        .digest("hex");

      if (recomputedHash !== event.hash) {
        return {
          valid: false,
          checkedCount: events.length,
          firstBrokenSequence: event.sequence.toString(),
          reason: "stored hash does not match the recomputed hash",
        };
      }

      expectedPreviousHash = event.hash;
      expectedSequence += BigInt(1);
    }

    return {
      valid: true,
      checkedCount: events.length,
      firstBrokenSequence: null,
      reason: null,
    };
  }
}
