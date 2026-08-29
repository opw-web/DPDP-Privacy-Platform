import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import Redis from "ioredis";
import type { AppConfig } from "../../config/configuration";

export interface HealthStatus {
  status: "ok" | "error";
  db: "up" | "down";
  redis: "up" | "down";
  uptime: number;
}

/**
 * Real connectivity checks for the datastores backing the platform.
 *
 * `checkDatabase()` currently opens a direct `pg` connection and runs
 * `SELECT 1`. Once Task 2 introduces PrismaService, this is the one place
 * to swap the probe for `prismaService.$queryRaw\`SELECT 1\`` — the public
 * contract (`Promise<boolean>`) does not need to change.
 */
@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private readonly pgPool: Pool;
  private readonly redisClient: Redis;

  constructor(private readonly configService: ConfigService) {
    const appConfig = this.configService.get<AppConfig>("app");

    this.pgPool = new Pool({
      connectionString: appConfig?.databaseUrl,
      connectionTimeoutMillis: 2000,
      max: 2,
    });

    this.redisClient = new Redis(appConfig?.redisUrl ?? "", {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
  }

  async checkDatabase(): Promise<boolean> {
    try {
      const client = await this.pgPool.connect();
      try {
        await client.query("SELECT 1");
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      this.logger.warn(
        `Database health check failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async checkRedis(): Promise<boolean> {
    try {
      if (
        this.redisClient.status === "wait" ||
        this.redisClient.status === "end"
      ) {
        await this.redisClient.connect();
      }
      const reply = await this.redisClient.ping();
      return reply === "PONG";
    } catch (error) {
      this.logger.warn(
        `Redis health check failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async getHealth(): Promise<HealthStatus> {
    const [dbUp, redisUp] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return {
      status: dbUp && redisUp ? "ok" : "error",
      db: dbUp ? "up" : "down",
      redis: redisUp ? "up" : "down",
      uptime: process.uptime(),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pgPool.end();
    this.redisClient.disconnect();
  }
}
