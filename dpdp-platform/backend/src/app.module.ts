import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "crypto";
import cookieParser from "cookie-parser";
import configuration from "./config/configuration";
import { validate } from "./config/env.validation";
import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { TenantModule } from "./common/tenant/tenant.module";
import { AuditModule } from "./common/audit/audit.module";
import { ReferenceModule } from "./common/reference/reference.module";
import { AuthModule } from "./modules/auth/auth.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { EmployeesModule } from "./modules/employees/employees.module";
import { PurposesModule } from "./modules/purposes/purposes.module";
import { ConnectorsModule } from "./modules/connectors/connectors.module";
import { JwtEmployeeGuard } from "./common/guards/jwt-employee.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { MaskingModule } from "./common/masking/masking.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req, res) => {
          const existing = req.headers["x-request-id"];
          const id =
            (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
          res.setHeader("x-request-id", id);
          return id;
        },
        customProps: (req) => ({ requestId: req.id }),
        transport:
          process.env["NODE_ENV"] === "development"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
      },
    }),
    PrismaModule,
    TenantModule,
    AuditModule,
    ReferenceModule,
    AuthModule,
    OrganizationsModule,
    EmployeesModule,
    PurposesModule,
    ConnectorsModule,
    MaskingModule,
    HealthModule,
  ],
  providers: [
    // Order matters: Nest runs multiple APP_GUARD providers in
    // registration order. JwtEmployeeGuard must run first (it decides
    // WHETHER the caller is authenticated and populates `request.actor`);
    // PermissionsGuard runs second and decides WHAT that verified caller
    // may do, per `@RequirePermission`. Swapping this order would make
    // PermissionsGuard see requests JwtEmployeeGuard hasn't vetted yet.
    { provide: APP_GUARD, useClass: JwtEmployeeGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applied ahead of TenantMiddleware (see TenantModule) so
    // `req.cookies` is populated before anything tries to read the
    // employee refresh-token cookie -- Express middleware from multiple
    // Nest modules runs in the order the modules were imported above.
    consumer.apply(cookieParser()).forRoutes("*");
  }
}
