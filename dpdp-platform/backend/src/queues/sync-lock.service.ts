import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { AppConfig } from "../config/configuration";
import { toRedisConnectionOptions } from "./redis-connection.util";

/** Redis key prefix for the per-source sync mutex (task 18 review, Critical 1). */
export const SYNC_LOCK_PREFIX = "sync-lock:";

/**
 * Default TTL for a held lock. Long enough that an ordinary slow DB round
 * trip or GC pause never expires a healthy run out from under itself;
 * short enough that a crashed worker's lock self-heals within tens of
 * seconds rather than wedging a source until a human intervenes.
 * Renewed by a heartbeat while the run is alive -- see `acquire()`.
 */
export const SYNC_LOCK_TTL_MS = 30_000;

/**
 * Heartbeat interval: roughly a third of the TTL, so at least two
 * consecutive renewal attempts have to be missed (not just one slow
 * tick) before a still-alive run's lock can expire.
 */
export const SYNC_LOCK_HEARTBEAT_INTERVAL_MS = 10_000;

function lockKey(dataSourceId: string): string {
  return `${SYNC_LOCK_PREFIX}${dataSourceId}`;
}

/**
 * Compare-and-delete: only releases the lock if it is STILL held by the
 * token this handle acquired it with. A bare `DEL` would happily delete a
 * lock a LATER run now owns (this run's TTL already expired, a new run
 * acquired the now-free key, and this run's `finally` block only now gets
 * around to calling `release()`) -- that is exactly the double-run bug
 * this whole mechanism exists to prevent, just introduced by the release
 * path instead of the acquire path.
 */
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

/** Same compare-then-act shape as the release script, for the heartbeat's TTL renewal. */
const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

export interface SyncLockHandle {
  readonly dataSourceId: string;
  readonly token: string;
  /** Stops the heartbeat and releases the lock. Idempotent -- safe to call more than once, e.g. from both a `finally` block and an explicit early return. */
  release(): Promise<void>;
}

/**
 * The real per-source sync mutex (task 18 review, Critical 1): a BullMQ
 * job id is NOT sufficient, because `Queue.upsertJobScheduler` mints its
 * own job ids for repeatable runs (`repeat:{schedulerId}:{millis}`,
 * unrelated to the `sync:{dataSourceId}` id manual triggers use) and
 * overrides any `jobId` supplied in the job template -- so a scheduled
 * run is invisible to any lock keyed off the manual job id. This lock is
 * keyed off `dataSourceId` alone and is acquired by `SyncPipelineService`
 * at the moment a run ACTUALLY starts (manual or scheduled, no
 * distinction), which is the only point both kinds of run pass through.
 *
 * Mechanism: `SET key token PX ttl NX` to acquire (atomic, and the token
 * makes the eventual release/renew safe against a lock this run no
 * longer owns); a heartbeat renews the TTL every
 * `SYNC_LOCK_HEARTBEAT_INTERVAL_MS` while the run is alive; release does
 * a Lua compare-and-delete. If the process holding the lock crashes, the
 * heartbeat simply stops firing and the TTL expires on its own --
 * self-healing, no reaper process or manual intervention required.
 *
 * Uses its OWN dedicated `ioredis` connection, separate from every
 * connection BullMQ itself manages (`QueuesModule`) -- this lock's
 * commands (`SET`, `EVAL`) are unrelated traffic that has no business
 * sharing a connection with a `Worker`'s blocking job-fetch commands.
 */
@Injectable()
export class SyncLockService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly activeHeartbeats = new Set<NodeJS.Timeout>();

  constructor(configService: ConfigService) {
    const appConfig = configService.get<AppConfig>("app");
    this.redis = new Redis(toRedisConnectionOptions(appConfig?.redisUrl ?? ""));
  }

  /** Whether `dataSourceId` currently has a sync in flight -- used by `SyncQueueService.trigger()` to keep the manual-trigger 409 truthful against BOTH manual and scheduled runs. */
  async isLocked(dataSourceId: string): Promise<boolean> {
    const exists = await this.redis.exists(lockKey(dataSourceId));
    return exists === 1;
  }

  /**
   * Attempts to acquire the lock for `dataSourceId`, returning a handle
   * (with a live heartbeat already running) on success, or `null` if
   * another run currently holds it. Callers MUST call `release()` on a
   * successfully acquired handle, normally from a `finally` block
   * wrapping the entire run.
   */
  async acquire(
    dataSourceId: string,
    ttlMs: number = SYNC_LOCK_TTL_MS,
    heartbeatIntervalMs: number = SYNC_LOCK_HEARTBEAT_INTERVAL_MS,
  ): Promise<SyncLockHandle | null> {
    const token = randomUUID();
    const key = lockKey(dataSourceId);
    const acquired = await this.redis.set(key, token, "PX", ttlMs, "NX");
    if (acquired !== "OK") {
      return null;
    }

    const heartbeat = setInterval(() => {
      this.redis.eval(RENEW_SCRIPT, 1, key, token, String(ttlMs)).catch(() => {
        // A renewal failure (Redis briefly unreachable, or the lock was
        // somehow already gone) surfaces on its own via the lock simply
        // expiring -- there is nothing actionable to do from inside a
        // background timer, and letting this reject unhandled would
        // crash the process instead.
      });
    }, heartbeatIntervalMs);
    // Never keep the Node process alive just to keep ticking a lock
    // heartbeat -- this timer's job is to maintain a lock for an
    // already-running task, not to be a reason the process stays up.
    heartbeat.unref?.();
    this.activeHeartbeats.add(heartbeat);

    let released = false;
    return {
      dataSourceId,
      token,
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        clearInterval(heartbeat);
        this.activeHeartbeats.delete(heartbeat);
        await this.redis.eval(RELEASE_SCRIPT, 1, key, token);
      },
    };
  }

  async onModuleDestroy(): Promise<void> {
    for (const heartbeat of this.activeHeartbeats) {
      clearInterval(heartbeat);
    }
    this.activeHeartbeats.clear();
    this.redis.disconnect();
  }
}
