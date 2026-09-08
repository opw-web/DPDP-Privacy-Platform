import {
  loadEnvFile,
  resolveTestDatabaseUrl,
  resolveTestRedisUrl,
} from "./support/test-database";

/**
 * Runs inside every Jest worker before the test framework or any module
 * under test loads, so neither the `PrismaClient` a spec constructs nor
 * the BullMQ connections `QueuesModule` builds can reach the demo stack.
 *
 * `globalSetup` already sets both in the parent process and workers
 * inherit them; doing it again here makes the guarantee independent of
 * that inheritance.
 */
loadEnvFile();
process.env["DATABASE_URL"] = resolveTestDatabaseUrl();
process.env["REDIS_URL"] = resolveTestRedisUrl();
