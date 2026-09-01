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
import { DataSourcesModule } from "./modules/data-sources/data-sources.module";
import { RegistersModule } from "./modules/registers/registers.module";
import { JwtEmployeeGuard } from "./common/guards/jwt-employee.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { MaskingModule } from "./common/masking/masking.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { SyncModule } from "./modules/sync/sync.module";
import { PrincipalsModule } from "./modules/principals/principals.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { AuditReadModule } from "./modules/audit/audit-read.module";
import { PrincipalPortalModule } from "./modules/principal-portal/principal-portal.module";
import { ComplianceModule } from "./modules/compliance/compliance.module";
import { TemplatesModule } from "./modules/messaging/templates/templates.module";
import { AudienceModule } from "./modules/messaging/audience/audience.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { MailModule } from "./common/mail/mail.module";
import { RequestsModule } from "./modules/requests/requests.module";
import { NoticesModule } from "./modules/notices/notices.module";
import { ChildrenModule } from "./modules/children/children.module";
import { RetentionModule } from "./modules/retention/retention.module";
import { EvidenceModule } from "./modules/evidence/evidence.module";
import { ConsentsModule } from "./modules/consents/consents.module";
import { SdfModule } from "./modules/sdf/sdf.module";
import { BoardModule } from "./modules/board/board.module";
import { CampaignsModule } from "./modules/messaging/campaigns/campaigns.module";
import { BreachesModule } from "./modules/breaches/breaches.module";

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
    DataSourcesModule,
    RegistersModule,
    IdentityModule,
    SyncModule,
    PrincipalsModule,
    InventoryModule,
    AuditReadModule,
    PrincipalPortalModule,
    MaskingModule,
    ComplianceModule,
    TemplatesModule,
    AudienceModule,
    MailModule,
    NotificationsModule,
    RequestsModule,
    NoticesModule,
    ChildrenModule,
    RetentionModule,
    // Task 12: the s.11 access report, per-principal evidence file, audit
    // chain verification, and the evidence pack.
    EvidenceModule,
    // TEMP-TASK10-VERIFY: added by task 10 to prove ConsentsModule boots
    // and its routes are reachable, per that task's explicit verification
    // instructions. Left in place for the wave integrator to normalise.
    ConsentsModule,
    // Task 13: the SDF pack (SD-01...SD-07) and the Board/Government
    // interaction surface (BD-01...BD-06). Registered here by this task
    // itself per its own verification instructions, and left in place.
    SdfModule,
    BoardModule,
    // Task 11: campaigns, the eight send guards, and per-recipient
    // delivery evidence -- the last unfinished backend module. Registered
    // here per this task's own instructions (leave in place).
    CampaignsModule,
    BreachesModule,
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
