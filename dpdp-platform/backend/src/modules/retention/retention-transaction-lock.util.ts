import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";

/**
 * Serialises a small retention workflow inside PostgreSQL. Scanner workers
 * can overlap after retries or a multi-node deployment; a per-key transaction
 * advisory lock lets the second worker re-read the durable state before it
 * creates a task or records a transition. The key contains tenant-owned UUIDs
 * and is only ever bound as a SQL value.
 */
export async function lockRetentionWorkflow(
  tx: ScopedTransactionClient,
  key: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
