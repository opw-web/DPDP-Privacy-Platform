import type { TenantScopedPrismaClient } from "./prisma.service";

/**
 * The type Prisma actually hands the callback of
 * `prisma.scoped.$transaction(async (tx) => { ... })` -- i.e. the
 * interactive-transaction client for the tenant-scoped, extended Prisma
 * client, with full per-model typing intact.
 *
 * Extracted from `TenantScopedPrismaClient["$transaction"]`'s function
 * overload instead of hand-typed, so it can never drift from whatever
 * `PrismaService.scoped` actually produces.
 *
 * Every service whose write must participate in the caller's transaction
 * (starting with `AuditService.record`) takes this as its `tx` parameter
 * type instead of accepting a bare `PrismaService` and opening its own
 * transaction -- see Task 3's note that the tenant extension's
 * `findUnique`/`update`/`delete`/`upsert` overrides are eager, not lazy
 * `PrismaPromise`s, so only the interactive `$transaction(async (tx) => ...)`
 * form composes safely with them.
 */
export type ScopedTransactionClient = TenantScopedPrismaClient extends {
  $transaction<R>(
    fn: (client: infer T) => Promise<R>,
    ...rest: never[]
  ): Promise<R>;
}
  ? T
  : never;
