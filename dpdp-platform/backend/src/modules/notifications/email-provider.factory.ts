import type { MailConfig } from "../../config/configuration";
import type { NotificationProvider } from "./notification-provider.interface";
import type { SmtpProvider } from "./providers/smtp.provider";
import type { ConsoleProvider } from "./providers/console.provider";

/** DI token for the `EMAIL` channel `NotificationProvider` -- resolves to
 * either `SmtpProvider` or `ConsoleProvider` at module-build time, per
 * `MailConfig.transport`. `NotificationsService` (and anything else that
 * only cares "the email provider", not which concrete class) injects
 * this token, never `SmtpProvider`/`ConsoleProvider` directly. */
export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

/**
 * Pure selection function, extracted from the Nest `useFactory` below so
 * it is unit-testable with no DI container, no `ConfigService`, and no
 * live SMTP/console dependency -- see `email-provider.factory.spec.ts`
 * for "`ConsoleProvider` is selected under `MAIL_TRANSPORT=console` and
 * `SmtpProvider` under `smtp`" (task-5-brief's required test).
 */
export function selectEmailProvider(
  transport: MailConfig["transport"],
  smtpProvider: SmtpProvider,
  consoleProvider: ConsoleProvider,
): NotificationProvider {
  return transport === "smtp" ? smtpProvider : consoleProvider;
}
