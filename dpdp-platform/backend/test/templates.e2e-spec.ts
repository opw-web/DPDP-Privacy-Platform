import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
} from "./support/e2e-harness";
import { seedMessageTemplates } from "../prisma/seed/message-templates";
import { BREACH_NOTIFICATION_REQUIRED_ELEMENTS } from "../src/modules/messaging/templates/whitelisted-variables";

/**
 * Task 3: `MessageTemplate` CRUD, the whitelisted Handlebars renderer,
 * and the fifteen seeded system templates.
 *
 * Every negative (400/403/409) assertion below has a POSITIVE CONTROL --
 * the identical route/payload, corrected only in the one thing under
 * test, asserted to succeed -- per this project's house style
 * (registers.e2e-spec.ts precedent).
 *
 * These tests exercise the REAL renderer through the REAL HTTP endpoints
 * (`POST /api/templates`, `POST /api/templates/:id/preview`) -- nothing
 * here mocks `template-renderer.ts` or `TemplatesService`. Check 17's
 * script-escaping assertion in particular reads the actual rendered
 * `body`/`subject` strings the preview endpoint returns.
 */
describe("Message templates: whitelisted rendering, CRUD, RBAC (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const orgIds: string[] = [];

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    // This harness only knows the MVP 1 org shape -- delete this task's
    // own MessageTemplate rows for these orgs before cleanupOrgs (which
    // does not know about MessageTemplate). AuditEvent rows are NOT
    // deleted here -- they are immutable by design (the mvp2 trigger
    // `audit_is_immutable()` rejects DELETE, same as UPDATE), and
    // `cleanupOrgs` deliberately never touches them either; they are
    // simply left behind as orphaned rows, same as every other e2e spec
    // that writes audit events.
    await prisma.messageTemplate.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  function authed(accessToken: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer())
          .get(url)
          .set("Authorization", `Bearer ${accessToken}`),
      post: (url: string, body: object) =>
        request(app.getHttpServer())
          .post(url)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(body),
      patch: (url: string, body: object) =>
        request(app.getHttpServer())
          .patch(url)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(body),
    };
  }

  /**
   * `TemplatesService.preview()` always renders through
   * `renderOrganizationMessageTemplate`, which unconditionally resolves
   * (and throws without) an org DPO/responsible-person contact -- by
   * design, not a bug: see `resolveOrganizationContactVariables`'s own
   * doc. A real organization must have this configured (Rule 9/GO-10)
   * before it can send ANY message through this platform, whether or not
   * the specific template text happens to reference
   * `{{dpo_name}}`/`{{dpo_contact}}`. So every fixture org here starts
   * with a real DPO contact on file, matching that realistic
   * precondition -- except the one test in the "Check 27" block that
   * deliberately clears it to prove the render is refused without one.
   */
  async function orgWithSender(): Promise<{
    organizationId: string;
    accessToken: string;
  }> {
    const org = await createOrgWithEmployee(app, prisma, "TEMPLATE_SENDER", [
      "CAN_SEND_MESSAGES",
    ]);
    orgIds.push(org.organizationId);
    await prisma.organization.update({
      where: { id: org.organizationId },
      data: {
        dpoName: "Default Test DPO",
        dpoEmail: `dpo-${org.organizationId}@e2e-templates-test.example`,
      },
    });
    return { organizationId: org.organizationId, accessToken: org.accessToken };
  }

  // ───────────────────────── Check 17 ─────────────────────────

  describe("Check 17: closed whitelist throws on unknown variables; script arrives escaped", () => {
    it("refuses to create a template referencing a non-whitelisted variable", async () => {
      const { accessToken } = await orgWithSender();

      const res = await authed(accessToken).post("/api/templates", {
        code: `E2E_UNKNOWN_VAR_${randomUUID()}`,
        name: "Has an unwhitelisted variable",
        category: "GENERAL_NOTIFICATION",
        subject: "Hello {{principal_name}}",
        bodyMarkdown: "Your secret is {{secret_field}}.",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("secret_field");
      expect(res.body.message).toContain(
        "not one of the whitelisted template variables",
      );

      // POSITIVE CONTROL: identical request, only the unknown variable
      // swapped for a whitelisted one -- the create succeeds.
      const okRes = await authed(accessToken).post("/api/templates", {
        code: `E2E_KNOWN_VAR_${randomUUID()}`,
        name: "Only whitelisted variables",
        category: "GENERAL_NOTIFICATION",
        subject: "Hello {{principal_name}}",
        bodyMarkdown: "Your company is {{company_name}}.",
      });
      expect(okRes.status).toBe(201);
    });

    it("also refuses disallowed Handlebars syntax (triple-stash) even when the name is whitelisted", async () => {
      const { accessToken } = await orgWithSender();

      const res = await authed(accessToken).post("/api/templates", {
        code: `E2E_TRIPLESTASH_${randomUUID()}`,
        name: "Uses raw/unescaped output",
        category: "GENERAL_NOTIFICATION",
        subject: "Hello",
        bodyMarkdown: "Unescaped: {{{principal_name}}}",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/raw|unescaped/i);
    });

    it("renders a <script> tag value as visible, escaped text -- never as executable markup", async () => {
      const { accessToken } = await orgWithSender();

      const created = await authed(accessToken).post("/api/templates", {
        code: `E2E_ESCAPE_${randomUUID()}`,
        name: "Escaping check",
        category: "GENERAL_NOTIFICATION",
        subject: "Hi {{principal_name}}",
        bodyMarkdown:
          "Dear {{principal_name}}, your company is {{company_name}}.",
        requiredVariables: ["principal_name"],
      });
      expect(created.status).toBe(201);
      const templateId = created.body.id as string;

      const malicious = "<script>alert(1)</script>";
      const previewRes = await authed(accessToken).post(
        `/api/templates/${templateId}/preview`,
        { variables: { principal_name: malicious, company_name: "Acme" } },
      );

      expect(previewRes.status).toBe(201);
      const { subject, body } = previewRes.body as {
        subject: string;
        body: string;
      };
      // The raw, executable tag must never appear verbatim...
      expect(subject).not.toContain("<script>");
      expect(body).not.toContain("<script>");
      // ...but the text the author typed must still be visible, as
      // harmless, HTML-escaped text.
      expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    });
  });

  // ───────────────────────── Missing required variable ─────────────────────────

  describe("a missing required value fails the render rather than printing empty", () => {
    it("400s when a required variable has no value, and succeeds once supplied (positive control)", async () => {
      const { accessToken } = await orgWithSender();

      const created = await authed(accessToken).post("/api/templates", {
        code: `E2E_REQUIRED_${randomUUID()}`,
        name: "Required variable check",
        category: "GENERAL_NOTIFICATION",
        subject: "Hi {{principal_name}}",
        bodyMarkdown: "Dear {{principal_name}}, regards {{company_name}}.",
        requiredVariables: ["principal_name"],
      });
      expect(created.status).toBe(201);
      const templateId = created.body.id as string;

      // NEGATIVE: principal_name omitted entirely.
      const missingRes = await authed(accessToken).post(
        `/api/templates/${templateId}/preview`,
        { variables: { company_name: "Acme" } },
      );
      expect(missingRes.status).toBe(400);
      expect(missingRes.body.message).toContain("principal_name");
      expect(missingRes.body.message).toContain("Required variable");

      // Whitespace-only also counts as missing.
      const blankRes = await authed(accessToken).post(
        `/api/templates/${templateId}/preview`,
        { variables: { principal_name: "   ", company_name: "Acme" } },
      );
      expect(blankRes.status).toBe(400);

      // POSITIVE CONTROL: identical request, the required value supplied.
      const okRes = await authed(accessToken).post(
        `/api/templates/${templateId}/preview`,
        { variables: { principal_name: "Priya", company_name: "Acme" } },
      );
      expect(okRes.status).toBe(201);
      expect(okRes.body.body).toContain("Priya");
    });
  });

  // ───────────────────────── Check 19 ─────────────────────────

  describe("Check 19: editing BREACH_NOTIFICATION to drop a mandatory Rule 7(1) placeholder warns and requires acknowledgement", () => {
    it("the default seeded BREACH_NOTIFICATION contains all six required elements", async () => {
      const { organizationId, accessToken } = await orgWithSender();
      await seedMessageTemplates(prisma, organizationId);

      const listRes = await authed(accessToken).get("/api/templates");
      expect(listRes.status).toBe(200);
      const breach = (listRes.body as Array<{ code: string; variables: string[] }>).find(
        (t) => t.code === "BREACH_NOTIFICATION",
      );
      expect(breach).toBeDefined();
      for (const element of BREACH_NOTIFICATION_REQUIRED_ELEMENTS) {
        expect(breach!.variables).toContain(element);
      }
      expect(BREACH_NOTIFICATION_REQUIRED_ELEMENTS.length).toBe(6);
    });

    it("refuses to save an edit that removes {{breach_safety_measures}} without acknowledgement, naming it; succeeds with acknowledgement (positive control) and records it on the audit log", async () => {
      const { organizationId, accessToken } = await orgWithSender();
      await seedMessageTemplates(prisma, organizationId);

      const listRes = await authed(accessToken).get("/api/templates");
      const breach = (
        listRes.body as Array<{
          id: string;
          code: string;
          subject: string;
          bodyMarkdown: string;
          requiredVariables: string[];
        }>
      ).find((t) => t.code === "BREACH_NOTIFICATION")!;

      const nextBody = breach.bodyMarkdown.replace(
        "{{breach_safety_measures}}",
        "",
      );
      const nextRequired = breach.requiredVariables.filter(
        (v) => v !== "breach_safety_measures",
      );

      // NEGATIVE: no acknowledgement -- rejected, naming the element.
      const deniedRes = await authed(accessToken).patch(
        `/api/templates/${breach.id}`,
        { bodyMarkdown: nextBody, requiredVariables: nextRequired },
      );
      expect(deniedRes.status).toBe(409);
      expect(deniedRes.body.message).toContain("breach_safety_measures");
      expect(deniedRes.body.message).toContain("Rule 7(1)");

      // Verify the row was NOT modified by the rejected attempt.
      const stillIntact = await prisma.messageTemplate.findUnique({
        where: { id: breach.id },
      });
      expect(stillIntact!.variables).toContain("breach_safety_measures");

      // POSITIVE CONTROL: identical request, acknowledgement supplied.
      const okRes = await authed(accessToken).patch(
        `/api/templates/${breach.id}`,
        {
          bodyMarkdown: nextBody,
          requiredVariables: nextRequired,
          acknowledgeBreachElementRemoval: true,
        },
      );
      expect(okRes.status).toBe(200);
      expect(okRes.body.variables).not.toContain("breach_safety_measures");

      const auditRows = await prisma.auditEvent.findMany({
        where: {
          organizationId,
          resourceType: "MessageTemplate",
          resourceId: breach.id,
          action: "TEMPLATE_UPDATED",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(auditRows.length).toBeGreaterThan(0);
      const latest = auditRows[0]!.metadata as Record<string, unknown>;
      expect(latest["breachElementRemovalAcknowledged"]).toBe(true);
      expect(latest["removedBreachElements"]).toEqual(
        expect.arrayContaining(["breach_safety_measures"]),
      );
    });
  });

  // ───────────────────────── PRE_ERASURE_NOTICE ─────────────────────────

  describe("PRE_ERASURE_NOTICE contains all three Rule 8(2) ways to stop erasure", () => {
    it("contains: log into her user account, contact the company for the specified purpose, and exercise her rights", async () => {
      const { organizationId, accessToken } = await orgWithSender();
      await seedMessageTemplates(prisma, organizationId);

      const listRes = await authed(accessToken).get("/api/templates");
      const preErasure = (
        listRes.body as Array<{ code: string; bodyMarkdown: string }>
      ).find((t) => t.code === "PRE_ERASURE_NOTICE")!;
      expect(preErasure).toBeDefined();

      const bodyLower = preErasure.bodyMarkdown.toLowerCase();
      expect(bodyLower).toContain("log into your user account");
      expect(bodyLower).toContain("contact the company for the specified purpose");
      expect(bodyLower).toContain("exercise your rights");
    });
  });

  // ───────────────────────── Check 27 ─────────────────────────

  describe("Check 27: REQUEST_COMPLETED carries the DPO contact sourced from the org record, not from the editable body", () => {
    it("injects dpo_name/dpo_contact from the Organization row and ignores/overrides any caller-supplied values", async () => {
      const { organizationId, accessToken } = await orgWithSender();
      await seedMessageTemplates(prisma, organizationId);

      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          dpoName: "Asha Verma",
          dpoEmail: "dpo@e2e-templates-test.example",
          dpoPhone: "+91-98765-43210",
        },
      });

      const listRes = await authed(accessToken).get("/api/templates");
      const completed = (
        listRes.body as Array<{ id: string; code: string }>
      ).find((t) => t.code === "REQUEST_COMPLETED")!;
      expect(completed).toBeDefined();

      // Caller supplies every OTHER required variable, and tries (in
      // vain) to inject its own dpo_name/dpo_contact -- RT-16: an
      // employee must not be able to omit or falsify the DPO contact.
      const previewRes = await authed(accessToken).post(
        `/api/templates/${completed.id}/preview`,
        {
          variables: {
            principal_name: "Rahul",
            company_name: "Acme Retail",
            request_type: "ACCESS",
            reference: "REQ-000123",
            portal_link: "https://portal.example/req/123",
            dpo_name: "FAKE DPO -- ignore me",
            dpo_contact: "attacker@example.com",
          },
        },
      );

      expect(previewRes.status).toBe(201);
      const { subject, body } = previewRes.body as {
        subject: string;
        body: string;
      };
      const rendered = `${subject}\n${body}`;
      expect(rendered).toContain("Asha Verma");
      expect(rendered).toMatch(/dpo@e2e-templates-test\.example|\+91-98765-43210/);
      expect(rendered).not.toContain("FAKE DPO");
      expect(rendered).not.toContain("attacker@example.com");
    });

    it("refuses to render (400) when the organization has no DPO or responsible-person contact on file", async () => {
      const { organizationId, accessToken } = await orgWithSender();
      await seedMessageTemplates(prisma, organizationId);
      // orgWithSender() sets a default DPO contact so every OTHER test
      // gets a realistic org -- this test clears every contact field
      // back out to prove the render is refused without one.
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          dpoName: null,
          dpoEmail: null,
          dpoPhone: null,
          responsiblePersonName: null,
          responsiblePersonEmail: null,
          grievanceContactEmail: null,
        },
      });
      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
      });
      expect(org.dpoName).toBeNull();
      expect(org.responsiblePersonName).toBeNull();

      const listRes = await authed(accessToken).get("/api/templates");
      const completed = (
        listRes.body as Array<{ id: string; code: string }>
      ).find((t) => t.code === "REQUEST_COMPLETED")!;

      const res = await authed(accessToken).post(
        `/api/templates/${completed.id}/preview`,
        {
          variables: {
            principal_name: "Rahul",
            company_name: "Acme Retail",
            request_type: "ACCESS",
            reference: "REQ-000124",
            portal_link: "https://portal.example/req/124",
          },
        },
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/DPO|responsible person/i);
    });
  });

  // ───────────────────────── RBAC ─────────────────────────

  describe("RBAC: every route requires CAN_SEND_MESSAGES", () => {
    it("403s a no-permission employee on list/create/patch/preview; a CAN_SEND_MESSAGES employee (positive control) succeeds on the same routes/payloads", async () => {
      const { organizationId, accessToken: senderToken } = await orgWithSender();
      const noPerm = await createOrgWithEmployee(
        app,
        prisma,
        "NO_PERMS",
        [],
      );
      orgIds.push(noPerm.organizationId);

      // GET list
      const deniedList = await authed(noPerm.accessToken).get("/api/templates");
      expect(deniedList.status).toBe(403);
      expect(deniedList.body.message).toContain(
        "Missing required permission: CAN_SEND_MESSAGES",
      );
      const okList = await authed(senderToken).get("/api/templates");
      expect(okList.status).toBe(200);

      // POST create
      const payload = {
        code: `E2E_RBAC_${randomUUID()}`,
        name: "RBAC check",
        category: "GENERAL_NOTIFICATION",
        subject: "Hi {{principal_name}}",
        bodyMarkdown: "Dear {{principal_name}}.",
      };
      const deniedCreate = await authed(noPerm.accessToken).post(
        "/api/templates",
        payload,
      );
      expect(deniedCreate.status).toBe(403);
      const okCreate = await authed(senderToken).post(
        "/api/templates",
        payload,
      );
      expect(okCreate.status).toBe(201);
      const templateId = okCreate.body.id as string;

      // PATCH
      const patchPayload = { name: "RBAC check (renamed)" };
      const deniedPatch = await authed(noPerm.accessToken).patch(
        `/api/templates/${templateId}`,
        patchPayload,
      );
      expect(deniedPatch.status).toBe(403);
      const okPatch = await authed(senderToken).patch(
        `/api/templates/${templateId}`,
        patchPayload,
      );
      expect(okPatch.status).toBe(200);

      // POST preview
      const previewPayload = { variables: { principal_name: "Priya" } };
      const deniedPreview = await authed(noPerm.accessToken).post(
        `/api/templates/${templateId}/preview`,
        previewPayload,
      );
      expect(deniedPreview.status).toBe(403);
      const okPreview = await authed(senderToken).post(
        `/api/templates/${templateId}/preview`,
        previewPayload,
      );
      expect(okPreview.status).toBe(201);

      expect(organizationId).toBeTruthy();
    });
  });
});
