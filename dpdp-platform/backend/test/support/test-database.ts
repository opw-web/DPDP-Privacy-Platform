import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

/**
 * E2E database isolation.
 *
 * Every e2e spec boots the real `AppModule` against a real Postgres, and
 * cleans up afterwards with a targeted `deleteMany` keyed off the
 * organization ids it created (see `e2e-harness.ts`). That cleanup is
 * correct for the rows a spec knows it made, but it is not a reset: rows
 * no spec claims ownership of — the global `Permission` catalogue,
 * `Counter`, anything a failed run left behind mid-transaction — survive
 * every run and accumulate.
 *
 * Until now `DATABASE_URL` came from the single `.env`, so that
 * accumulation happened *in the demo database itself*, alongside the
 * seeded 327-principal demo. Two consequences, both observed:
 *
 *  1. Running the suite churned the demo data the `demo-control` scripts
 *     had staged, so "run the tests" and "keep the demo intact" were
 *     mutually exclusive.
 *  2. Volume grew without bound across runs within a session. That is the
 *     leading explanation for the load-dependent, suite-level teardown
 *     failure recorded as Ruling 45 in `docs/EVALUATION_MVP2.md` — a
 *     failure that never landed on an assertion and migrated between spec
 *     files run to run, which is the signature of a shared resource
 *     degrading rather than a broken test.
 *
 * So the e2e suite now gets its own database, created and migrated on
 * demand and truncated at the start of every run.
 *
 * Redis needs the same treatment, for a sharper reason. Every BullMQ queue
 * name in this codebase is a fixed string (`campaign-send`,
 * `pre-erasure-notice`, ...), so a locally running demo backend and an e2e
 * run pointed at the same Redis are two sets of workers subscribed to the
 * same queues. The demo's worker will happily pick up a job a test
 * enqueued, look for the campaign in the *demo* database, not find it, and
 * drop it — and the test then fails with `waitUntil: timed out waiting for
 * condition`. Which suite loses that race depends on timing, which is why
 * the symptom moved between spec files run to run. Isolating the Redis
 * database index removes the race outright.
 *
 * `globalSetup` calls `prepareTestEnvironment()` once per run, before any
 * worker starts.
 */

/**
 * Reads `DATABASE_URL` and friends out of `.env` into `process.env`.
 *
 * `globalSetup` and `setupFiles` both run before Nest — and therefore
 * before `ConfigModule.forRoot()` — has loaded anything, so without this
 * there is no `DATABASE_URL` to derive a test URL from.
 *
 * Deliberately not `dotenv`: that package is present only as a transitive
 * dependency of `@nestjs/config`, and a bootstrap that silently breaks
 * when a dependency reshuffles its own tree is not worth the ten lines it
 * saves. Existing values always win, so `TEST_DATABASE_URL=... npm run
 * test:e2e` still overrides the file.
 */
export function loadEnvFile(path = join(__dirname, "..", "..", ".env")): void {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return; // No .env is fine when the environment is already populated.
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    if (key === undefined) continue;
    if (process.env[key] !== undefined) continue;
    let value = (match[2] ?? "").trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    value = quoted?.[2] ?? value.replace(/\s+#.*$/, "").trim();
    process.env[key] = value;
  }
}

/** `TEST_DATABASE_URL` if set, else `DATABASE_URL` with `_test` appended to the database name. */
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env["TEST_DATABASE_URL"];
  if (explicit) return explicit;

  const base = process.env["DATABASE_URL"];
  if (!base) {
    throw new Error(
      "Neither TEST_DATABASE_URL nor DATABASE_URL is set; the e2e suite has no database to run against.",
    );
  }
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "");
  if (!name) {
    throw new Error(`DATABASE_URL has no database name: ${base}`);
  }
  // Refuse to derive a test URL that points back at the source database.
  if (name.endsWith("_test")) return url.toString();
  url.pathname = `/${name}_test`;
  return url.toString();
}

/** The maintenance URL for the same server — `postgres`, which always exists. */
function adminUrlFor(testUrl: string): string {
  const url = new URL(testUrl);
  url.pathname = "/postgres";
  return url.toString();
}

function databaseNameOf(testUrl: string): string {
  return new URL(testUrl).pathname.replace(/^\//, "");
}

async function createDatabaseIfMissing(testUrl: string): Promise<void> {
  const name = databaseNameOf(testUrl);
  const client = new Client({ connectionString: adminUrlFor(testUrl) });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (existing.rowCount === 0) {
      // The name is derived from our own connection string, never from a
      // test's input, but it still cannot be a bound parameter in DDL.
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

/** `prisma migrate deploy` against the test database only. */
function migrate(testUrl: string): void {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: testUrl },
      // npx resolves through the shell on Windows.
      shell: process.platform === "win32",
    },
  );
}

/**
 * Empties every table the migrations own, leaving the schema and
 * `_prisma_migrations` alone.
 *
 * `TRUNCATE` rather than `DELETE` on purpose: the audit log carries a
 * BEFORE DELETE trigger (`audit_is_immutable`) that refuses row deletion
 * by design, and `TRUNCATE` does not fire row-level triggers. `CASCADE`
 * handles the foreign-key graph without needing a topological order.
 */
async function truncateAll(testUrl: string): Promise<void> {
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length === 0) return;
    const targets = rows
      .map((r) => `"public"."${r.tablename.replace(/"/g, '""')}"`)
      .join(", ");
    await client.query(`TRUNCATE TABLE ${targets} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}

/**
 * Creates (if needed), migrates and empties the e2e database, then points
 * `process.env.DATABASE_URL` at it. Returns the URL it settled on.
 *
 * Jest runs `globalSetup` in the parent process before forking workers,
 * so the `DATABASE_URL` set here is inherited by every worker. `setup-env.ts`
 * sets it again inside each worker so the guarantee does not rest on that
 * inheritance alone.
 */
export async function prepareTestDatabase(): Promise<string> {
  const testUrl = resolveTestDatabaseUrl();
  await createDatabaseIfMissing(testUrl);
  migrate(testUrl);
  await truncateAll(testUrl);
  process.env["DATABASE_URL"] = testUrl;
  return testUrl;
}

/**
 * `TEST_REDIS_URL` if set, else `REDIS_URL` pointed at database index 1.
 *
 * Index 0 is what a locally running demo backend uses, and its workers
 * subscribe to the very same fixed queue names this suite does.
 */
export function resolveTestRedisUrl(): string {
  const explicit = process.env["TEST_REDIS_URL"];
  if (explicit) return explicit;

  const base = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const url = new URL(base);
  const index = url.pathname.replace(/^\//, "");
  if (index && index !== "0") return url.toString();
  url.pathname = "/1";
  return url.toString();
}

/** Empties the e2e Redis database so a previous run's jobs cannot be replayed into this one. */
async function flushTestRedis(redisUrl: string): Promise<void> {
  const { default: IORedis } = await import("ioredis");
  const client = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  try {
    await client.connect();
    await client.flushdb();
  } finally {
    client.disconnect();
  }
}

/**
 * Creates/migrates/empties the e2e Postgres database and empties the e2e
 * Redis database, then points `process.env` at both. Returns what it chose.
 */
export async function prepareTestEnvironment(): Promise<{
  databaseUrl: string;
  redisUrl: string;
}> {
  const databaseUrl = await prepareTestDatabase();
  const redisUrl = resolveTestRedisUrl();
  await flushTestRedis(redisUrl);
  process.env["REDIS_URL"] = redisUrl;
  return { databaseUrl, redisUrl };
}
