import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import type { AuditEvent } from "@prisma/client";
import type { ScopedTransactionClient } from "../prisma/scoped-transaction-client";
import { TenantContext } from "../tenant/tenant-context";
import { allocateCounterValue } from "../reference/counter";
import { canonicalJson } from "./canonical-json";
import type { AuditAction } from "./audit-actions";

const AUDIT_COUNTER_NAME = "AUDIT";

export interface AuditRecordInput {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  subjectPrincipalId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Metadata keys that must never carry a plaintext credential, password
 * hash, or token into the audit log (task brief: "metadata must never
 * contain a plaintext credential, password hash, or token"). Checked
 * recursively, case-insensitively, and by substring so a caller cannot
 * dodge it with `Password` or `apiToken` or a key one level deep in a
 * nested object.
 *
 * This is a best-effort guardrail, not a content-inspection secret
 * scanner -- it cannot catch a raw secret value stashed under an
 * unrelated key name. It exists to make the OBVIOUS, common mistake
 * (spreading a whole DTO or entity into `metadata`, credential fields and
 * all) fail loudly at the call site instead of landing quietly in an
 * append-only, hash-chained table nothing can ever redact from.
 */
const FORBIDDEN_METADATA_KEY_FRAGMENTS = [
  "password",
  "passwordhash",
  "credential",
  "secret",
  "token",
  "apikey",
  "privatekey",
] as const;

function assertNoForbiddenMetadata(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenMetadata(item, [...path, String(index)]),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
      const hit = FORBIDDEN_METADATA_KEY_FRAGMENTS.find((fragment) =>
        normalizedKey.includes(fragment),
      );
      if (hit) {
        throw new Error(
          `AuditService.record: metadata key "${[...path, key].join(".")}" ` +
            `looks like a credential/secret/token (matched "${hit}") and ` +
            "must not be written to the audit log. Redact or omit it.",
        );
      }
      assertNoForbiddenMetadata(child, [...path, key]);
    }
  }
}

/**
 * The only code path in this codebase permitted to insert into
 * `AuditEvent`. Every state change writes through here, inside the
 * caller's own transaction, so the write is atomic with whatever it is
 * auditing -- there is no "audit write succeeded but the real change
 * didn't" or vice versa.
 *
 * The database itself backs this up independently: `AuditEvent` has
 * triggers (migration `20260829183100_constraints_and_triggers`) that
 * reject UPDATE and DELETE outright, so even a bug here (or a future
 * caller that tries to bypass this service) cannot make the log mutable.
 */
@Injectable()
export class AuditService {
  /**
   * Appends one hash-chained `AuditEvent` row for the current tenant.
   *
   * `tx` must be the interactive-transaction client from the CALLER's own
   * `prisma.scoped.$transaction(async (tx) => { ... })` -- never a
   * transaction opened by this method -- so the audit write commits or
   * rolls back atomically with whatever it is recording.
   *
   * Sequence allocation: `Counter(organizationId, "AUDIT")` is
   * incremented under `SELECT ... FOR UPDATE` (see
   * `../reference/counter.ts`) inside this same transaction. Two
   * concurrent callers auditing the same organization serialize on that
   * row lock -- one blocks until the other commits -- so sequences come
   * out gap-free and duplicate-free (spec Check 17) even under real
   * concurrency, not just in a single-writer test.
   *
   * Hash chain: `hash = sha256(previousHash + sequence + action +
   * resourceId + canonicalJson(metadata) + createdAt)`, exactly per spec
   * line 876. `previousHash` is this org's immediately preceding event's
   * `hash` (or `null` for sequence 1) -- read via `findFirst` ordered by
   * `sequence desc`, which is automatically tenant-filtered by the Prisma
   * extension `tx` came from, so two organizations' chains never cross.
   * That read is safe to do without its own row lock: only one
   * transaction can hold this org's `Counter` row lock at a time, and the
   * previous event was necessarily committed by whichever transaction
   * released that lock before this one acquired it.
   *
   * `createdAt`: computed ONCE, as a single `Date`, then used for BOTH the
   * hash input (via `.toISOString()`) and the row inserted below. If
   * these ever diverged -- e.g. one `new Date()` for hashing and a second
   * for the insert, or relying on the database's `now()` default instead
   * of supplying the same value to both -- the stored `createdAt` would
   * silently stop matching what was hashed, breaking every downstream
   * chain-verification check without any error at write time.
   */
  async record(
    tx: ScopedTransactionClient,
    input: AuditRecordInput,
  ): Promise<AuditEvent> {
    const { organizationId, actorType, actorId, actorLabel } =
      TenantContext.get();
    const metadata = input.metadata ?? {};
    assertNoForbiddenMetadata(metadata);

    const sequence = await allocateCounterValue(
      tx,
      organizationId,
      AUDIT_COUNTER_NAME,
    );

    const previous = await tx.auditEvent.findFirst({
      orderBy: { sequence: "desc" },
    });
    const previousHash = previous?.hash ?? null;

    const createdAt = new Date();
    const createdAtIso = createdAt.toISOString();

    const hashInput =
      (previousHash ?? "") +
      sequence.toString() +
      input.action +
      (input.resourceId ?? "") +
      canonicalJson(metadata) +
      createdAtIso;
    const hash = createHash("sha256").update(hashInput).digest("hex");

    // AuditService.record() is the ONLY place in this codebase that may
    // call `auditEvent.create` -- see the class doc comment above and the
    // database triggers that make this additionally true at the storage
    // layer regardless of what application code does.
    return tx.auditEvent.create({
      data: {
        // Forced to the current tenant by the Prisma extension's `create`
        // handling regardless of what is passed here (see
        // tenant.extension.ts `runScopedOperation`'s "create" case) --
        // included only because Prisma's generated type requires the
        // field, not because this service is the one deciding the value.
        organizationId,
        sequence,
        actorType,
        actorId,
        actorLabel,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        subjectPrincipalId: input.subjectPrincipalId ?? null,
        metadata: metadata as never,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        previousHash,
        hash,
        createdAt,
      },
    });
  }
}
