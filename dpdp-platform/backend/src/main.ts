import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import type { AppConfig } from "./config/configuration";

// AuditEvent.sequence, Organization.registeredUserCount and Counter.value are
// Prisma BigInt fields. JSON.stringify() throws on BigInt by default, and
// every controller response goes through it — so every process that can
// serialize a Prisma row to JSON needs this shim applied once, globally,
// before any request is served.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>("app");

  app.setGlobalPrefix("api");
  app.enableCors({ origin: appConfig?.corsOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("DPDP Platform API")
    .setDescription("DPDP Act 2023 compliance platform API")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = appConfig?.port ?? 4000;
  await app.listen(port);
}

bootstrap();
