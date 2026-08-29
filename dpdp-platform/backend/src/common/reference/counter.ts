import type { ScopedTransactionClient } from "../prisma/scoped-transaction-client";

/**
 * Allocates the next value of `Counter(organizationId, name)`, locking the
 * row with `SELECT ... FOR UPDATE` inside the caller's transaction so
 * concurrent allocators for the same `(organizationId, name)` serialize
 * instead of racing (spec line 876: "takes `Counter('AUDIT')` with
 * `SELECT ... FOR UPDATE`"; Check 17: sequence has no gaps).
 *
 * Shared by `AuditService.record` (counter name `"AUDIT"`, running inside
 * the caller's own transaction) and `ReferenceService.next` (any counter
 * name, running inside a transaction it opens itself) -- both need the
 * exact same lock-then-increment semantics, so the SQL lives once, here.
 *
 * Raw SQL, not `prisma.scoped.counter.upsert(...)`: Task 3's tenant
 * extension makes `upsert` on a scoped model a `findFirst` followed by an
 * `update`/`create` -- NOT atomic. Two concurrent callers could both take
 * the create branch and collide. `Counter` is exactly the model where that
 * matters, since it is the platform's only monotonic sequence source.
 *
 * Raw SQL also sits entirely outside the tenant extension's boundary (it
 * intercepts `$allModels.$allOperations` and named model methods, not
 * `$queryRaw`/`$executeRaw`), so `organizationId` is passed explicitly and
 * parameterized here. This is the ONE sanctioned exception to "no service
 * passes organizationId manually" in this codebase -- every other write in
 * this file, and everywhere else, goes through `PrismaService.scoped` and
 * lets the extension inject it.
 */
export async function allocateCounterValue(
  tx: ScopedTransactionClient,
  organizationId: string,
  name: string,
): Promise<bigint> {
  // Ensure the row exists before locking it. `ON CONFLICT DO NOTHING` is
  // atomic against the (organizationId, name) primary key, so concurrent
  // first-callers for a brand-new counter never collide or throw here --
  // they just race harmlessly to insert the same starting row.
  await tx.$executeRaw`
    INSERT INTO "Counter" ("organizationId", "name", "value")
    VALUES (${organizationId}, ${name}, 0)
    ON CONFLICT ("organizationId", "name") DO NOTHING
  `;

  // Locks the row for the rest of this transaction. A second transaction
  // racing for the same (organizationId, name) blocks here until the first
  // commits (releasing the lock) or rolls back -- under Postgres's default
  // READ COMMITTED isolation the blocked query then re-reads the just
  // -committed value rather than a stale snapshot, so the increment below
  // is never computed from data another writer is about to overwrite.
  const rows = await tx.$queryRaw<{ value: bigint }[]>`
    SELECT "value" FROM "Counter"
    WHERE "organizationId" = ${organizationId} AND "name" = ${name}
    FOR UPDATE
  `;
  const current = rows[0]?.value ?? 0n;
  const next = current + 1n;

  await tx.$executeRaw`
    UPDATE "Counter" SET "value" = ${next}
    WHERE "organizationId" = ${organizationId} AND "name" = ${name}
  `;

  return next;
}
