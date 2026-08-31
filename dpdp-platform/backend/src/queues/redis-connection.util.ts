import type { RedisOptions } from "ioredis";

/**
 * Parses `REDIS_URL` (already validated non-empty by `env.validation.ts`)
 * into a plain connection-options object, shared by every Redis client
 * this module tree builds (BullMQ's `Queue`/`Worker` connections in
 * `QueuesModule`, and `SyncLockService`'s own dedicated lock client) --
 * rather than each constructing its own parsing logic, or sharing one
 * live `ioredis.Redis` instance across unrelated concerns.
 *
 * Sharing a single instance across a BullMQ `Worker` (which issues
 * blocking Redis commands) and anything else (a `Queue`'s ordinary
 * commands, or `SyncLockService`'s `SET`/`EVAL` calls) would let the
 * blocking commands starve the others sharing that connection -- see
 * `QueuesModule`'s own doc comment for the fuller BullMQ-specific
 * reasoning. Passing plain OPTIONS lets each caller construct its own
 * independent client instead.
 *
 * `maxRetriesPerRequest: null` is BullMQ's own documented requirement for
 * any connection it manages (a finite retry count can abort one of its
 * blocking commands mid-wait, surfacing as a hard connection error rather
 * than a normal retry) -- harmless to apply to `SyncLockService`'s
 * non-blocking client too, and keeps one shared parsing function correct
 * for both.
 */
export function toRedisConnectionOptions(redisUrl: string): RedisOptions {
  const parsed = new URL(redisUrl);
  const db = parsed.pathname.replace(/^\//, "");
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: db ? Number(db) : undefined,
    maxRetriesPerRequest: null,
  };
}
