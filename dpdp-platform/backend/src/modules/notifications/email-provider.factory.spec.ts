import { selectEmailProvider } from "./email-provider.factory";
import type { SmtpProvider } from "./providers/smtp.provider";
import type { ConsoleProvider } from "./providers/console.provider";

/**
 * Task-5-brief required test: "`ConsoleProvider` is selected under
 * `MAIL_TRANSPORT=console` and `SmtpProvider` under `smtp`." Exercised
 * here as a pure unit test against the selection function itself, not
 * through a full app bootstrap -- `dpdp-platform/backend/.env` fixes
 * `MAIL_TRANSPORT=smtp` for the whole process, so an e2e test could only
 * ever observe one branch of this decision. See task-5-report.md for why
 * this was chosen over gymnastics to re-bootstrap the app under a second
 * environment.
 */
describe("selectEmailProvider", () => {
  const smtp = { channel: "EMAIL" } as unknown as SmtpProvider;
  const console_ = { channel: "EMAIL" } as unknown as ConsoleProvider;

  it("selects SmtpProvider when transport is smtp", () => {
    expect(selectEmailProvider("smtp", smtp, console_)).toBe(smtp);
  });

  it("selects ConsoleProvider when transport is console", () => {
    expect(selectEmailProvider("console", smtp, console_)).toBe(console_);
  });
});
