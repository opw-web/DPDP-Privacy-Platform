import { Module } from "@nestjs/common";
import { MailerService } from "./mailer.service";

/**
 * The `common/` module shape used throughout this codebase (see
 * `MaskingModule`, `AuditModule`): providers in, providers out, no
 * controllers. `MailerService` needs Nest's `ConfigService`
 * (`ConfigModule` is registered `isGlobal: true` in `AppModule`), so
 * nothing else needs importing here.
 */
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailModule {}
