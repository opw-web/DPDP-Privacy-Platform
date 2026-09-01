import { INestApplication } from "@nestjs/common";
import { randomUUID } from "crypto";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  bootstrapTestApp,
  cleanupOrgs,
  createOrgWithEmployee,
} from "./support/e2e-harness";

/**
 * MVP 2 §6 Check 35: exercise one representative endpoint for each new
 * tenant-scoped model with Acme's token and Globex's row identifiers.  Every
 * response must be indistinguishable from a missing row (404), including the
 * retention mutation route.  Fixtures use the raw Prisma client deliberately
 * so this test proves the HTTP tenant scope rather than fixture filtering.
 */
describe("MVP2 tenant isolation (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let attackerOrgId: string;
  let victimOrgId: string;
  let attackerToken: string;
  const orgIds: string[] = [];
  const created = {
    requestReference: "",
    campaignId: "",
    breachId: "",
    noticeId: "",
    erasureTaskId: "",
    principalId: "",
  };

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    const permissions = [
      "CAN_MANAGE_REQUESTS",
      "CAN_SEND_MESSAGES",
      "CAN_MANAGE_BREACHES",
      "CAN_MANAGE_NOTICES",
      "CAN_MANAGE_RETENTION",
    ];
    const attacker = await createOrgWithEmployee(
      app,
      prisma,
      "MVP2_ACME",
      permissions,
    );
    const victim = await createOrgWithEmployee(
      app,
      prisma,
      "MVP2_GLOBEX",
      permissions,
    );
    attackerOrgId = attacker.organizationId;
    victimOrgId = victim.organizationId;
    attackerToken = attacker.accessToken;
    orgIds.push(attackerOrgId, victimOrgId);

    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId: victimOrgId,
        reference: `DP-${randomUUID()}`,
        displayName: "Globex isolation fixture",
        ageStatus: "ADULT",
      },
    });
    created.principalId = principal.id;
    created.requestReference = `REQ-${randomUUID()}`;
    await prisma.principalRequest.create({
      data: {
        organizationId: victimOrgId,
        reference: created.requestReference,
        dataPrincipalId: principal.id,
        type: "ACCESS",
        subject: "Isolation fixture",
        body: "Isolation fixture",
      },
    });

    const notice = await prisma.privacyNotice.create({
      data: {
        organizationId: victimOrgId,
        code: `ISOLATION_${randomUUID()}`,
        name: "Isolation fixture notice",
        purposeIds: [],
      },
    });
    created.noticeId = notice.id;

    const campaign = await prisma.messageCampaign.create({
      data: {
        organizationId: victimOrgId,
        reference: `CMP-${randomUUID()}`,
        name: "Isolation fixture campaign",
        category: "GENERAL_NOTIFICATION",
        subject: "Isolation fixture",
        bodyMarkdown: "Isolation fixture",
        audienceFilter: { op: "AND", rules: [] },
        createdByEmployeeId: victim.employeeId,
      },
    });
    created.campaignId = campaign.id;

    const breach = await prisma.breachIncident.create({
      data: {
        organizationId: victimOrgId,
        reference: `BR-${randomUUID()}`,
        title: "Isolation fixture breach",
        description: "Isolation fixture",
        occurredAt: new Date("2026-08-30T09:00:00.000Z"),
        becameAwareAt: new Date("2026-08-30T12:00:00.000Z"),
        discoveredByEmployeeId: victim.employeeId,
        affectedSourceIds: [],
        dataCategories: [],
      },
    });
    created.breachId = breach.id;

    const erasureTask = await prisma.erasureTask.create({
      data: {
        organizationId: victimOrgId,
        dataPrincipalId: principal.id,
        trigger: "REQUEST",
      },
    });
    created.erasureTaskId = erasureTask.id;
  });

  afterAll(async () => {
    // FK-safe cleanup for the rows created above; the shared harness then
    // removes the two employee organizations and their roles.
    await prisma.erasureTask.deleteMany({ where: { organizationId: victimOrgId } });
    await prisma.principalRequest.deleteMany({ where: { organizationId: victimOrgId } });
    await prisma.messageCampaign.deleteMany({ where: { organizationId: victimOrgId } });
    await prisma.breachIncident.deleteMany({ where: { organizationId: victimOrgId } });
    await prisma.privacyNotice.deleteMany({ where: { organizationId: victimOrgId } });
    await prisma.dataPrincipal.deleteMany({ where: { organizationId: victimOrgId } });
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  const checks = [
    ["request", "get", () => `/api/requests/${created.requestReference}`],
    ["campaign", "get", () => `/api/campaigns/${created.campaignId}`],
    ["breach", "get", () => `/api/breaches/${created.breachId}`],
    ["notice", "get", () => `/api/notices/${created.noticeId}`],
    [
      "retention task",
      "post",
      () => `/api/retention/tasks/${created.erasureTaskId}/cancel`,
    ],
  ] as const;

  it.each(checks)("%s returns 404 across tenants", async (_name, method, url) => {
    const endpoint = url();
    const response = method === "get"
      ? await request(app.getHttpServer())
          .get(endpoint)
          .set("Authorization", `Bearer ${attackerToken}`)
      : await request(app.getHttpServer())
          .post(endpoint)
          .set("Authorization", `Bearer ${attackerToken}`)
          .send({ reason: "cross-tenant isolation probe" });
    expect(response.status).toBe(404);
  });
});
