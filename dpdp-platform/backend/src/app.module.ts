import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "crypto";
import configuration from "./config/configuration";
import { validate } from "./config/env.validation";
import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { TenantModule } from "./common/tenant/tenant.module";
import { AuditModule } from "./common/audit/audit.module";
import { ReferenceModule } from "./common/reference/reference.module";

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
    HealthModule,
  ],
})
export class AppModule {}
