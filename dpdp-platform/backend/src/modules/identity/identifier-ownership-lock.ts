import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { TenantContext } from "../../common/tenant/tenant-context";

/**
 * Closes the cross-source identifier-ownership race the MVP1 evaluation
 * found (Checks 4/6 finding, fixed under
 * `.superpowers/sdd/2026-08-29-dpdp-mvp1/concurrent-sync-race-report.md`):
 * two DIFFERENT data sources' syncs run genuinely concurrently
 * (`SyncLockService`'s mutex is keyed per-`dataSourceId`, so it only ever
 * serializes a source against itself -- by construction it cannot see a
 * second source). Two per-record transactions could each, under
 * Postgres's default READ COMMITTED isolation, read "no principal owns
 * this email/phone/customerId yet" before either had committed, then both
 * try to attach the same identifier value. Whichever committed second hit
 * `PrincipalIdentifier`'s `(organizationId, type, value)` unique
 * constraint -- either as an explicit
 * `IdentifierOwnershipConflictError` (its own read re-ran under READ
 * COMMITTED and saw the other's now-committed row) or a raw Postgres
 * unique violation -- and that error aborted its ENTIRE per-record
 * transaction, discarding the `SourceRecord`/`NormalizedRecord` that had
 * already been written earlier in that same transaction, with no
 * `MatchCandidate` raised to surface any of it.
 *
 * Fix: serialize -- per organization, per exact identifier value -- the
 * window from MATCH's read (`MatchingService.resolveSignal`) through
 * LINK's write (`LinkingService.attachIdentifier`), using a
 * transaction-scoped Postgres advisory lock
 * (`pg_advisory_xact_lock`). `SyncPipelineService.persistAndLink` acquires
 * one lock per candidate identifier signal from
 * `MatchingService.buildCandidateSignals` -- in the SAME fixed order that
 * function always builds them (CUSTOMER_ID, then EMAIL, then PHONE) --
 * immediately before calling `match()`. A concurrent transaction wanting
 * the SAME identifier value blocks at that acquisition until this
 * transaction commits or rolls back (Postgres releases
 * `pg_advisory_xact_lock` automatically at transaction end, so there is
 * nothing here to explicitly release, and nothing that can leak across a
 * crashed connection). Once unblocked, its own MATCH read is a FRESH
 * statement under READ COMMITTED, so it sees the now-committed identifier
 * and correctly resolves LINK/CANDIDATE against the real owner instead of
 * racing to create a second one.
 *
 * This targets the exact resource under contention (one identifier
 * value) rather than serializing whole syncs against each other: two
 * concurrent syncs touching DISJOINT identifier values never wait on one
 * another, so ordinary (non-colliding) records keep processing fully
 * concurrently. Acquiring locks in one fixed relative order for every
 * transaction -- never data-dependent, never reordered per record -- is
 * what rules out an ABBA lock-ordering deadlock between two transactions
 * that both need overlapping identifiers.
 *
 * Raw SQL, not a table row: there is no `PrincipalIdentifier` row to lock
 * with `SELECT ... FOR UPDATE` for a value nobody has claimed yet (unlike
 * `Counter`, whose row is unconditionally created first via
 * `INSERT ... ON CONFLICT DO NOTHING` -- see
 * `src/common/reference/counter.ts`). An advisory lock is the standard
 * Postgres idiom for locking a not-yet-existent resource by name. Reading
 * `organizationId` from `TenantContext` and passing it into raw SQL
 * mirrors `counter.ts`'s own justification: this call sits entirely
 * outside the tenant extension's boundary (`$queryRaw`/`$executeRaw` are
 * client-level operations the extension's `$allModels.$allOperations`
 * component never sees), so nothing else can inject the tenant filter
 * here. This is the second such sanctioned exception in this codebase to
 * "no service passes organizationId manually" -- `counter.ts`'s
 * doc comment has been updated to say so.
 */
const IDENTIFIER_LOCK_NAMESPACE = "PrincipalIdentifier";

export interface IdentifierLockSignal {
  readonly identifierType: string;
  readonly value: string;
}

/**
 * Acquires one transaction-scoped advisory lock per signal, in the exact
 * order given -- callers MUST pass signals in a fixed, non-data-dependent
 * order (see class doc comment on deadlock avoidance). Never explicitly
 * released: it is held until `tx`'s transaction commits or rolls back,
 * which is exactly the window this lock needs to cover.
 */
export async function lockIdentifiersForOwnership(
  tx: ScopedTransactionClient,
  signals: readonly IdentifierLockSignal[],
): Promise<void> {
  if (signals.length === 0) {
    return;
  }
  const { organizationId } = TenantContext.get();
  for (const signal of signals) {
    const lockKey = `${IDENTIFIER_LOCK_NAMESPACE}:${organizationId}:${signal.identifierType}:${signal.value}`;
    // hashtextextended(text, seed) -> bigint: a single 64-bit advisory-lock
    // key derived from the full (org, type, value) tuple, letting Postgres
    // do the hashing instead of replicating it in application code. A hash
    // collision between two DIFFERENT identifier values only ever costs
    // unrelated transactions an unnecessary wait, never an incorrect
    // result -- the actual ownership decision is still made by MATCH's own
    // read and LINK's own unique constraint, both unaffected by this lock.
    //
    // `$executeRaw`, not `$queryRaw`: `pg_advisory_xact_lock` returns
    // `void`, which `$queryRaw` cannot deserialize into a Prisma value
    // ("Failed to deserialize column of type 'void'", confirmed by
    // running this exact query) -- `$executeRaw` only reports the
    // affected-row count and never attempts to decode a result column,
    // which is all this call needs.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }
}
