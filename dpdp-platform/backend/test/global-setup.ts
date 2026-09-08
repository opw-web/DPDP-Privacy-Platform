import { loadEnvFile, prepareTestEnvironment } from "./support/test-database";

/**
 * Runs once per e2e run, in the parent process, before any worker starts:
 * creates the dedicated e2e Postgres database if it is missing, migrates
 * and empties it, and empties the dedicated e2e Redis database.
 */
export default async function globalSetup(): Promise<void> {
  loadEnvFile();

  const { databaseUrl, redisUrl } = await prepareTestEnvironment();

  // Printed, not silent: a run that quietly pointed at the demo database —
  // or shared the demo's Redis queues — is exactly what this setup exists
  // to prevent, so the targets belong in the run's own output.
  console.log(`\n[e2e] database: ${withoutCredentials(databaseUrl)}`);
  console.log(`[e2e] redis:    ${withoutCredentials(redisUrl)}\n`);
}

function withoutCredentials(raw: string): string {
  const url = new URL(raw);
  url.username = "";
  url.password = "";
  return url.toString();
}
