import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  bootstrapTestApp,
  cleanupOrgs,
  createOrgWithEmployee,
} from "./support/e2e-harness";

/**
 * MVP 2 §6 Check 34: the eight newly added write endpoints must reject an
 * authenticated employee whose role has no permissions.  The request bodies
 * are intentionally minimal; the permission guard runs before DTO/service
 * validation, so a 403 proves the route permission rather than payload shape.
 */
describe("MVP2 endpoint permissions (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const orgIds: string[] = [];

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    const fixture = await createOrgWithEmployee(
      app,
      prisma,
      "MVP2_AUDITOR",
      [],
    );
    orgIds.push(fixture.organizationId);
    accessToken = fixture.accessToken;
  });

  afterAll(async () => {
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  const checks = [
    ["request status", "/api/requests/REQ-CHECK34/status", { status: "OPEN" }],
    ["campaign create", "/api/campaigns", {}],
    ["breach create", "/api/breaches", {}],
    ["compliance rule create", "/api/compliance-rules", {}],
    [
      "erasure task complete",
      "/api/retention/tasks/00000000-0000-0000-0000-000000000000/complete",
      { systemChecklist: [], processorChecklist: [] },
    ],
    ["guardian create", "/api/guardians", {}],
    [
      "campaign approval",
      "/api/campaigns/00000000-0000-0000-0000-000000000000/approve",
      {},
    ],
    [
      "breach notification",
      "/api/breaches/00000000-0000-0000-0000-000000000000/notify",
      {},
    ],
  ] as const;

  it.each(checks)("%s returns 403", async (_name, url, body) => {
    const response = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body);
    expect(response.status).toBe(403);
  });
});
