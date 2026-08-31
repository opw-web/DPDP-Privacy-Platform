import { randomUUID } from "crypto";
import { INestApplication, Logger } from "@nestjs/common";
import * as argon2 from "argon2";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TenantContext } from "../src/common/tenant/tenant-context";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { EMAIL_PROVIDER } from "../src/modules/notifications/email-provider.factory";
import { SmtpProvider } from "../src/modules/notifications/providers/smtp.provider";
import { ConsoleProvider } from "../src/modules/notifications/providers/console.provider";
import type { NotificationSendInput } from "../src/modules/notifications/notification-provider.interface";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
  waitUntil,
  OrgWithEmployee,
} from "./support/e2e-harness";

/**
 * Task 5 gate: mail transport, the three delivery providers, and the
 * notifications API.
 *
 * BOOTSTRAP NOTE -- now uses `test/support/e2e-harness.ts`'s
 * `bootstrapTestApp()`, which compiles the real `AppModule`. Task 5's
 * original hand-built module graph (`ConfigModule` + `PrismaModule` +
 * `TenantModule` + `NotificationsModule`) existed only because
 * `NotificationsModule` was not yet registered in `AppModule` -- now that
 * the Wave 1 integrator has wired it in, this spec exercises the real
 * graph like every other MVP 2 e2e spec.
 */
describe("Notifications API (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  const organizationIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
    notificationsService = app.get(NotificationsService);
  });

  afterAll(async () => {
    // Delete our own Notification rows (and the DataPrincipal/
    // PrincipalAccount fixtures cleanupOrgs does not know about) before
    // cleanupOrgs removes the organizations themselves -- brief's explicit
    // instruction.
    await prisma.notification.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.principalAccount.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.dataPrincipal.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await cleanupOrgs(prisma, organizationIds);
    await app.close();
    await prisma.$disconnect();
  });

  /** Calls `NotificationsService.send` the same way Tasks 6/9/11/14/15
   * will: wrapped in a `TenantContext.run` a caller outside an HTTP
   * request is responsible for providing (see that interface's
   * docstring). */
  async function sendNotification(organizationId: string, input: NotificationSendInput) {
    return TenantContext.run(
      {
        actorType: "SYSTEM",
        organizationId,
        actorId: null,
        actorLabel: "e2e-test-seed",
      },
      () => notificationsService.send(input),
    );
  }

  async function createPrincipal(
    organizationId: string,
    displayName: string,
  ): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName,
        ageStatus: "ADULT",
      },
    });
    return principal.id;
  }

  async function principalSession(
    organizationId: string,
    dataPrincipalId: string,
  ): Promise<string> {
    const email = `${randomUUID()}@portal.example.test`;
    const password = "CorrectHorseBattery9!";
    await prisma.principalAccount.create({
      data: {
        organizationId,
        dataPrincipalId,
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: "ACTIVE",
      },
    });
    const res = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email, password });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  /** A second employee in an ALREADY-created organization -- distinct from
   * `createOrgWithEmployee`, which always mints a brand new organization.
   * Reuses that org's (permission-free) role. */
  async function secondEmployeeSession(
    org: OrgWithEmployee,
    label: string,
  ): Promise<{ employeeId: string; accessToken: string }> {
    const email = `${label}-${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const employee = await prisma.employee.create({
      data: {
        organizationId: org.organizationId,
        email,
        fullName: label,
        roleId: org.roleId,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: "ACTIVE",
      },
    });
    const res = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });
    expect(res.status).toBe(200);
    return { employeeId: employee.id, accessToken: res.body.accessToken as string };
  }

  describe("portal-first: a principal with no email address still gets everything", () => {
    it("NotificationsService.send() writes the portal row even when emailAddress is omitted", async () => {
      const org = await createOrgWithEmployee(app, prisma, "NOTIF_PORTAL_FIRST", []);
      organizationIds.push(org.organizationId);
      const dataPrincipalId = await createPrincipal(org.organizationId, "No Email Principal");

      const notification = await sendNotification(org.organizationId, {
        audience: "PRINCIPAL",
        dataPrincipalId,
        title: "Your request was received",
        body: "We received your access request and will respond soon.",
        // emailAddress intentionally omitted -- this principal has none on file.
      });

      expect(notification.audience).toBe("PRINCIPAL");
      expect(notification.dataPrincipalId).toBe(dataPrincipalId);
      expect(notification.employeeId).toBeNull();
      expect(notification.readAt).toBeNull();

      // And it is what the polled list endpoint (spec line 901) actually
      // returns to that principal -- the portal row IS "everything" here.
      const accessToken = await principalSession(org.organizationId, dataPrincipalId);
      const res = await request(app.getHttpServer())
        .get("/api/notifications")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.unreadCount).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(notification.id);
      expect(res.body.items[0].title).toBe("Your request was received");
    });

    it("the EMAIL channel reports NO_ADDRESS rather than throwing when there is nothing to send to", async () => {
      const smtpProvider = app.get(SmtpProvider);
      const result = await smtpProvider.send({
        audience: "PRINCIPAL",
        dataPrincipalId: randomUUID(),
        title: "x",
        body: "y",
        // no emailAddress
      });
      expect(result).toEqual({ channel: "EMAIL", delivered: false, reason: "NO_ADDRESS" });
    });
  });

  describe("email provider selection (MAIL_TRANSPORT)", () => {
    // `dpdp-platform/backend/.env` fixes MAIL_TRANSPORT=smtp for this
    // whole test process, so an e2e run can only ever observe ONE branch
    // of `selectEmailProvider`'s decision live through DI -- the OTHER
    // branch is exhaustively covered by the pure unit test in
    // `email-provider.factory.spec.ts` ("ConsoleProvider is selected under
    // MAIL_TRANSPORT=console and SmtpProvider under smtp"), per that
    // file's own docstring. This suite adds two things a pure unit test
    // cannot: proof the real `NotificationsModule` DI wiring actually
    // resolves `EMAIL_PROVIDER` to the class the current env demands, and
    // proof `ConsoleProvider`'s own behaviour (log instead of send) is
    // correct when exercised directly.
    it("EMAIL_PROVIDER resolves to SmtpProvider under this process's MAIL_TRANSPORT=smtp", () => {
      const emailProvider = app.get(EMAIL_PROVIDER);
      expect(emailProvider).toBeInstanceOf(SmtpProvider);
    });

    it("ConsoleProvider logs the message instead of touching SMTP", async () => {
      const consoleProvider = new ConsoleProvider();
      const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
      try {
        const result = await consoleProvider.send({
          audience: "EMPLOYEE",
          employeeId: randomUUID(),
          title: "Console subject",
          body: "Console body",
          emailAddress: "someone@example.test",
        });
        expect(result).toEqual({ channel: "EMAIL", delivered: true });
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining("someone@example.test"),
        );
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  describe("SmtpProvider actually delivers via the live MailHog instance", () => {
    const MAILHOG_MESSAGES_API = "http://localhost:8025/api/v2/messages";
    const MAILHOG_DELETE_API = "http://localhost:8025/api/v1/messages";

    interface MailHogMessage {
      Content: { Headers: Record<string, string[]> };
    }
    interface MailHogListResponse {
      items: MailHogMessage[];
    }

    beforeEach(async () => {
      await fetch(MAILHOG_DELETE_API, { method: "DELETE" });
    });

    // Not flaky: MailHog is a fixed, already-running local dependency
    // (SMTP on 1025, API on 8025) rather than a remote network resource,
    // and `waitUntil` polls rather than sleeping a fixed delay -- this is
    // the "assert real SMTP delivery... if you judge it not flaky" case
    // the brief calls for, and it also verifies this task's inherited,
    // never-before-run `MailerService`/`SmtpProvider` code actually works.
    it("a message sent through SmtpProvider arrives in MailHog with the right subject, body and recipient", async () => {
      const smtpProvider = app.get(SmtpProvider);
      const to = `${randomUUID()}@portal.example.test`;
      const subject = `Notification e2e ${randomUUID()}`;

      const result = await smtpProvider.send({
        audience: "PRINCIPAL",
        dataPrincipalId: randomUUID(),
        title: subject,
        body: "This is the notification body.",
        emailAddress: to,
      });
      expect(result).toEqual({ channel: "EMAIL", delivered: true });

      await waitUntil(
        async () => {
          const listRes = await fetch(MAILHOG_MESSAGES_API);
          const data = (await listRes.json()) as MailHogListResponse;
          return data.items.some(
            (item) => item.Content.Headers["Subject"]?.[0] === subject,
          );
        },
        5000,
        100,
      );

      const listRes = await fetch(MAILHOG_MESSAGES_API);
      const data = (await listRes.json()) as MailHogListResponse;
      const match = data.items.find(
        (item) => item.Content.Headers["Subject"]?.[0] === subject,
      );
      expect(match).toBeDefined();
      expect(match?.Content.Headers["To"]?.[0]).toContain(to);
    });
  });

  describe("cross-actor and cross-tenant isolation", () => {
    it("an employee cannot read another employee's notifications", async () => {
      const org = await createOrgWithEmployee(app, prisma, "NOTIF_EMP_ISO_A", []);
      organizationIds.push(org.organizationId);
      const employeeB = await secondEmployeeSession(org, "NOTIF_EMP_ISO_B");

      const notifA = await sendNotification(org.organizationId, {
        audience: "EMPLOYEE",
        employeeId: org.employeeId,
        title: "For A",
        body: "A's notification",
      });
      const notifB = await sendNotification(org.organizationId, {
        audience: "EMPLOYEE",
        employeeId: employeeB.employeeId,
        title: "For B",
        body: "B's notification",
      });

      const listAsA = await request(app.getHttpServer())
        .get("/api/notifications")
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(listAsA.status).toBe(200);
      const idsAsA = listAsA.body.items.map((row: { id: string }) => row.id);
      expect(idsAsA).toContain(notifA.id);
      expect(idsAsA).not.toContain(notifB.id);

      // Not just filtered out of the list -- structurally unreadable: A
      // cannot mark B's own notification read via its id either.
      const markAsAOnB = await request(app.getHttpServer())
        .post(`/api/notifications/${notifB.id}/read`)
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(markAsAOnB.status).toBe(404);
    });

    it("a principal cannot read an employee's notifications, and an employee cannot read a principal's (both directions)", async () => {
      const org = await createOrgWithEmployee(app, prisma, "NOTIF_TOKEN_CONFUSION", []);
      organizationIds.push(org.organizationId);
      const dataPrincipalId = await createPrincipal(org.organizationId, "Token Confusion Principal");
      const principalToken = await principalSession(org.organizationId, dataPrincipalId);

      const employeeNotif = await sendNotification(org.organizationId, {
        audience: "EMPLOYEE",
        employeeId: org.employeeId,
        title: "Employee-only",
        body: "For the employee",
      });
      const principalNotif = await sendNotification(org.organizationId, {
        audience: "PRINCIPAL",
        dataPrincipalId,
        title: "Principal-only",
        body: "For the principal",
      });

      // Direction 1: principal token, listed rows never include the
      // employee's notification (ownershipWhere hardcodes audience:
      // PRINCIPAL for a principal actor -- structurally, not just by id).
      const listAsPrincipal = await request(app.getHttpServer())
        .get("/api/notifications")
        .set("Authorization", `Bearer ${principalToken}`);
      expect(listAsPrincipal.status).toBe(200);
      const idsAsPrincipal = listAsPrincipal.body.items.map(
        (row: { id: string }) => row.id,
      );
      expect(idsAsPrincipal).toContain(principalNotif.id);
      expect(idsAsPrincipal).not.toContain(employeeNotif.id);

      // ... and cannot mark the employee's notification read by id.
      const markAsPrincipalOnEmployee = await request(app.getHttpServer())
        .post(`/api/notifications/${employeeNotif.id}/read`)
        .set("Authorization", `Bearer ${principalToken}`);
      expect(markAsPrincipalOnEmployee.status).toBe(404);

      // Direction 2: employee token, the reverse.
      const listAsEmployee = await request(app.getHttpServer())
        .get("/api/notifications")
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(listAsEmployee.status).toBe(200);
      const idsAsEmployee = listAsEmployee.body.items.map(
        (row: { id: string }) => row.id,
      );
      expect(idsAsEmployee).toContain(employeeNotif.id);
      expect(idsAsEmployee).not.toContain(principalNotif.id);

      const markAsEmployeeOnPrincipal = await request(app.getHttpServer())
        .post(`/api/notifications/${principalNotif.id}/read`)
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(markAsEmployeeOnPrincipal.status).toBe(404);
    });

    it("read-all marks only the caller's own rows", async () => {
      const org = await createOrgWithEmployee(app, prisma, "NOTIF_READ_ALL", []);
      organizationIds.push(org.organizationId);
      const employeeB = await secondEmployeeSession(org, "NOTIF_READ_ALL_B");

      await sendNotification(org.organizationId, {
        audience: "EMPLOYEE",
        employeeId: org.employeeId,
        title: "A #1",
        body: "...",
      });
      await sendNotification(org.organizationId, {
        audience: "EMPLOYEE",
        employeeId: org.employeeId,
        title: "A #2",
        body: "...",
      });
      const notifB = await sendNotification(org.organizationId, {
        audience: "EMPLOYEE",
        employeeId: employeeB.employeeId,
        title: "B #1",
        body: "...",
      });

      const readAllRes = await request(app.getHttpServer())
        .post("/api/notifications/read-all")
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(readAllRes.status).toBe(200);
      expect(readAllRes.body.updated).toBe(2);

      const listAsA = await request(app.getHttpServer())
        .get("/api/notifications")
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(listAsA.body.unreadCount).toBe(0);
      expect(
        (listAsA.body.items as Array<{ readAt: string | null }>).every(
          (row) => row.readAt !== null,
        ),
      ).toBe(true);

      const stillUnreadB = await prisma.notification.findUnique({
        where: { id: notifB.id },
      });
      expect(stillUnreadB?.readAt).toBeNull();
    });

    it("tenant isolation: an actor in org A cannot see org B's notifications", async () => {
      const orgA = await createOrgWithEmployee(app, prisma, "NOTIF_TENANT_A", []);
      const orgB = await createOrgWithEmployee(app, prisma, "NOTIF_TENANT_B", []);
      organizationIds.push(orgA.organizationId, orgB.organizationId);

      const notifA = await sendNotification(orgA.organizationId, {
        audience: "EMPLOYEE",
        employeeId: orgA.employeeId,
        title: "Org A",
        body: "...",
      });
      const notifB = await sendNotification(orgB.organizationId, {
        audience: "EMPLOYEE",
        employeeId: orgB.employeeId,
        title: "Org B",
        body: "...",
      });

      const listAsOrgA = await request(app.getHttpServer())
        .get("/api/notifications")
        .set("Authorization", `Bearer ${orgA.accessToken}`);
      expect(listAsOrgA.status).toBe(200);
      const idsAsOrgA = listAsOrgA.body.items.map((row: { id: string }) => row.id);
      expect(idsAsOrgA).toContain(notifA.id);
      expect(idsAsOrgA).not.toContain(notifB.id);

      const markAsOrgAOnOrgB = await request(app.getHttpServer())
        .post(`/api/notifications/${notifB.id}/read`)
        .set("Authorization", `Bearer ${orgA.accessToken}`);
      expect(markAsOrgAOnOrgB.status).toBe(404);
    });
  });

  describe("auth failure modes", () => {
    it("rejects a request with no token at all", async () => {
      const res = await request(app.getHttpServer()).get("/api/notifications");
      expect(res.status).toBe(401);
    });

    it("rejects a garbage token", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/notifications")
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });
  });
});
