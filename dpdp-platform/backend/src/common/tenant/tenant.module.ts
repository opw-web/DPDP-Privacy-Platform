import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { AuthModule } from "../../modules/auth/auth.module";
import { TenantMiddleware } from "./tenant.middleware";

/**
 * Wires `TenantMiddleware` in front of every route. `TenantMiddleware`
 * needs `TokenService` (to verify the request's access token), which is
 * why this module imports `AuthModule` -- `AuthModule` has no dependency
 * back on `TenantModule`, so this is a one-way edge, not a cycle.
 */
@Module({ imports: [AuthModule] })
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
