import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { MailModule } from "../../common/mail/mail.module";
import type { MailConfig } from "../../config/configuration";
import { EMAIL_PROVIDER, selectEmailProvider } from "./email-provider.factory";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { JwtAnyActorGuard } from "./guards/jwt-any-actor.guard";
import { PortalProvider } from "./providers/portal.provider";
import { SmtpProvider } from "./providers/smtp.provider";
import { ConsoleProvider } from "./providers/console.provider";

/**
 * Task 5. Exports `NotificationsService` -- the single call site Tasks 6,
 * 9, 11, 14 and 15 use to send a notification (`send()`; see that
 * method's own doc comment) -- plus `PortalProvider`, `SmtpProvider` and
 * `ConsoleProvider` themselves, for a caller that genuinely needs one
 * channel directly rather than the portal-first orchestration `send()`
 * gives everyone by default.
 *
 * Imports `AuthModule` for the same reason `PrincipalPortalModule` does:
 * `JwtAnyActorGuard` (referenced by class via `@UseGuards`, not
 * pre-registered as a local provider) needs `TokenService` resolvable in
 * THIS module's DI context. `PrismaService` needs no import --
 * `PrismaModule` is `@Global()`.
 *
 * Not registered in `app.module.ts` by this task -- the brief reserves
 * that edit for the wave integrator. Whoever wires this in only needs to
 * add `NotificationsModule` to `AppModule`'s `imports` array; nothing
 * else in this file requires further configuration.
 */
@Module({
  imports: [AuthModule, MailModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    PortalProvider,
    SmtpProvider,
    ConsoleProvider,
    JwtAnyActorGuard,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        configService: ConfigService,
        smtpProvider: SmtpProvider,
        consoleProvider: ConsoleProvider,
      ) => {
        const mailConfig = configService.get<MailConfig>("mail")!;
        return selectEmailProvider(
          mailConfig.transport,
          smtpProvider,
          consoleProvider,
        );
      },
      inject: [ConfigService, SmtpProvider, ConsoleProvider],
    },
  ],
  exports: [NotificationsService, PortalProvider, SmtpProvider, ConsoleProvider],
})
export class NotificationsModule {}
