import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { TenantMiddleware } from "./tenant.middleware";

/**
 * Wires `TenantMiddleware` in front of every route. The middleware itself
 * is a no-op until Task 5 adds JWT verification (see tenant.middleware.ts);
 * this module just owns that plumbing so app.module.ts doesn't have to.
 */
@Module({})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
