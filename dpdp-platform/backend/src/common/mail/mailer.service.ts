import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";
import type { MailConfig } from "../../config/configuration";

/** The minimal message shape every caller of `MailerService.send` supplies.
 * Deliberately narrow -- this is a transport wrapper, not a template
 * engine (that is `handlebars`, driven by Task 9's template rendering,
 * never this file). */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Thin wrapper around `nodemailer`'s SMTP transport, configured entirely
 * from `MailConfig` (`configService.get<MailConfig>("mail")`, exposed by
 * Task 1's `configuration.ts` -- see that file for `MAIL_*` env wiring).
 *
 * Only ever constructed/used when `MailConfig.transport === "smtp"`
 * (`SmtpProvider` is the sole caller) -- `ConsoleProvider` never touches
 * this class, which is exactly why the console transport works in test
 * environments with no SMTP server at all: nothing here runs unless
 * something asks it to.
 *
 * The transporter is built lazily and cached -- one TCP-capable
 * transporter per process, not one per message -- and talks to whatever
 * `MailConfig.host`/`.port` name (MailHog in dev: host `mailhog` inside
 * the Docker network, `localhost` from the backend running on the host;
 * see `dpdp-platform/backend/.env`). No auth: MailHog accepts unauthenticated
 * SMTP, and this codebase has no other SMTP target today.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter?: Transporter;

  constructor(private readonly configService: ConfigService) {}

  private get mailConfig(): MailConfig {
    return this.configService.get<MailConfig>("mail")!;
  }

  private getTransporter(): Transporter {
    this.transporter ??= nodemailer.createTransport({
      host: this.mailConfig.host,
      port: this.mailConfig.port,
      secure: false,
    });
    return this.transporter;
  }

  /**
   * Sends one message via SMTP. Throws on failure -- callers that must
   * not let a mail-delivery failure block a more important write (e.g.
   * `NotificationsService.send`, where the portal record is the system
   * of record and must not be rolled back by an SMTP hiccup) are
   * responsible for catching this, not this method.
   */
  async send(message: MailMessage): Promise<void> {
    await this.getTransporter().sendMail({
      from: this.mailConfig.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.debug(`Sent mail to ${message.to}: "${message.subject}"`);
  }
}
