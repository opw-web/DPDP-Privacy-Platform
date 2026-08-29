import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Raw, unextended Prisma client wired into Nest's lifecycle.
 *
 * This is intentionally a thin wrapper: it owns the connection lifecycle and
 * nothing else. Task 3 applies a tenant-scoping Prisma client extension on
 * top of this service (via `prismaService.$extends(tenantExtension)`) to
 * produce the org-scoped client that the rest of the app injects day to day.
 * Code that must bypass tenant scoping — migrations, seeding, the extension
 * itself — injects `PrismaService` directly and gets the raw client.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    // Connect eagerly so failures surface at startup logs rather than on
    // the first request — but don't let a datastore that is briefly down
    // take the whole Nest bootstrap down with it. The health check (and
    // Prisma's own lazy reconnect-on-next-query behaviour) is what reports
    // and recovers from a database that isn't reachable yet.
    try {
      await this.$connect();
      this.logger.log("Prisma client connected");
    } catch (error) {
      this.logger.warn(
        `Prisma client failed to connect on startup: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
