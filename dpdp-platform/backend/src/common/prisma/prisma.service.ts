import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { tenantScopingExtension } from "../tenant/tenant.extension";

// `ReturnType<PrismaClient["$extends"]>` collapses to `unknown` because
// `$extends` is generic and there is no call site to resolve the generic
// against. Routing the call through this helper -- called with a concrete,
// already-typed `PrismaClient` and the concrete `tenantScopingExtension` --
// gives TypeScript a real call to infer the return type from, so
// `PrismaService.scoped` below (and everyone who calls it) gets full,
// per-model typing instead of `unknown`.
function extendWithTenantScoping(client: PrismaClient) {
  return client.$extends(tenantScopingExtension);
}

export type TenantScopedPrismaClient = ReturnType<
  typeof extendWithTenantScoping
>;

/**
 * Raw Prisma client wired into Nest's lifecycle, plus the tenant-scoped
 * client services actually use.
 *
 * `PrismaService` itself owns only the connection lifecycle and stays
 * unextended: code that must bypass tenant scoping — migrations, seeding,
 * the extension's own internals — injects `PrismaService` directly and
 * gets the raw client.
 *
 * `PrismaService.scoped` is the org-scoped client (built once, lazily, by
 * `$extends(tenantScopingExtension)`) that every service injects day to
 * day. It never accepts `organizationId` as an argument — the current
 * tenant comes from `TenantContext`, which the extension reads on every
 * query. See `src/common/tenant/tenant.extension.ts`.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private scopedClient?: TenantScopedPrismaClient;

  constructor() {
    // Opt-in query events keep production logging unchanged while allowing
    // performance tests to count the exact SQL issued by one endpoint.
    // Task 20 uses PRISMA_QUERY_LOG=1; it is intentionally not a query
    // result logger and does not expose bound personal-data parameters.
    super(
      process.env["PRISMA_QUERY_LOG"] === "1"
        ? { log: [{ emit: "event", level: "query" }] }
        : {},
    );
  }

  /** The tenant-scoped client. Services inject `PrismaService` and call `.scoped`. */
  get scoped(): TenantScopedPrismaClient {
    this.scopedClient ??= extendWithTenantScoping(this);
    return this.scopedClient;
  }

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
