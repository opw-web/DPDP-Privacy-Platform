import { Injectable, Logger } from "@nestjs/common";
import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "../notification-provider.interface";

/**
 * The `EMAIL` channel provider selected when `MAIL_TRANSPORT=console`
 * (`email-provider.factory.ts`) -- used by the test suite so no spec
 * anywhere depends on a live SMTP server. Never calls `MailerService` /
 * nodemailer; logs the would-be message instead.
 *
 * Same no-address contract as `SmtpProvider`: a missing `emailAddress`
 * is not an error, just nothing to log.
 */
@Injectable()
export class ConsoleProvider implements NotificationProvider {
  readonly channel = "EMAIL" as const;

  private readonly logger = new Logger(ConsoleProvider.name);

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    if (!input.emailAddress) {
      return { channel: "EMAIL", delivered: false, reason: "NO_ADDRESS" };
    }
    this.logger.log(
      `[console-mail] to=${input.emailAddress} subject=${JSON.stringify(
        input.title,
      )} body=${JSON.stringify(input.body)}`,
    );
    return { channel: "EMAIL", delivered: true };
  }
}
