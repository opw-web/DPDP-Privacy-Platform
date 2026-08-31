import { Injectable } from "@nestjs/common";
import { MailerService } from "../../../common/mail/mailer.service";
import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "../notification-provider.interface";

/**
 * The `EMAIL` channel provider selected when `MAIL_TRANSPORT=smtp`
 * (`email-provider.factory.ts`). Sends via `MailerService` -> nodemailer
 * -> MailHog in dev.
 *
 * A missing `emailAddress` is never an error here -- portal-first (spec
 * line 768) means this provider simply has nothing to do, and returns
 * `{ delivered: false, reason: "NO_ADDRESS" }` rather than throwing.
 */
@Injectable()
export class SmtpProvider implements NotificationProvider {
  readonly channel = "EMAIL" as const;

  constructor(private readonly mailer: MailerService) {}

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    if (!input.emailAddress) {
      return { channel: "EMAIL", delivered: false, reason: "NO_ADDRESS" };
    }
    await this.mailer.send({
      to: input.emailAddress,
      subject: input.title,
      text: input.body,
    });
    return { channel: "EMAIL", delivered: true };
  }
}
