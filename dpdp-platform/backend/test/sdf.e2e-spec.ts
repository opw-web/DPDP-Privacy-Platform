import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TenantContext, type TenantStore } from "../src/common/tenant/tenant-context";
import { SdfCycleScanService } from "../src/modules/sdf/sdf-cycle-scan.service";
import { addByDeadlineUnit } from "../src/modules/compliance/compliance.service";
import { seedComplianceRules } from "../prisma/seed/compliance-rules";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
} from "./support/e2e-harness";

/**
 * Task 13 e2e coverage per the task brief:
 *   - Check 29: an org an SDF with `sdfNotifiedAt` 11 months ago --
 *     completing an AUDIT with `isIndependent = false` is rejected, and
 *     closing a cycle without `furnishedToBoardAt` is rejected, both
 *     quoting the Rule 13 citation. The due date is asserted computed
 *     from the resolved rule, not a literal 12.
 *   - A non-SDF org gets the readiness view, not an error.
 *   - `GET /api/sdf/gaps` surfaces a localisation-required transfer and
 *     an SDF without `dpoIsIndiaBased`.
 *   - 403 without CAN_MANAGE_SDF, with a positive control on the same
 *     route and payload.
 *   - `sdf-cycle-scan` opens both DPIA and AUDIT rows for the current
 *     cycle, called directly per `SdfCycleScanService`'s own doc comment
 *     (same split `RetentionScanService` documents for its own
 *     processor).
 */

const TEST_ACTOR_LABEL = "sdf-e2e";
const RULE_13_FRAGMENT = "Rule 13(1)";

// `bootstrapTestApp()` compiles the entire real `AppModule` -- can exceed
// `jest-e2e.json`'s default 15s `testTimeout` in this environment.
jest.setTimeout(120000);

describe("SDF pack (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sdfCycleScanService: SdfCycleScanService;
  const orgIds: string[] = [];

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    sdfCycleScanService = app.get(SdfCycleScanService);
  });

  afterAll(async () => {
    if (orgIds.length > 0) {
      // MVP 2 shape rows `cleanupOrgs` does not know about -- FK-safe
      // order: children of DataRecipient before DataRecipient itself.
      await prisma.crossBorderTransfer.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.dataRecipient.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.algorithmRegisterEntry.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.sdfAssessment.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.complianceRule.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  function systemActorStore(organizationId: string): TenantStore {
    return {
      organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: TEST_ACTOR_LABEL,
    };
  }

  async function makeSdfOrg(
    roleCode: string,
    permissionCodes: readonly string[],
    sdfNotifiedAt: Date,
    options?: { dpoIsIndiaBased?: boolean },
  ) {
    const org = await createOrgWithEmployee(app, prisma, roleCode, permissionCodes);
    orgIds.push(org.organizationId);
    // Seed the rule effective well before sdfNotifiedAt -- resolveRule
    // requires effectiveFrom <= at, and seedComplianceRules defaults
    // effectiveFrom to "now" (after sdfNotifiedAt for a backdated org).
    const ruleEffectiveFrom = new Date(sdfNotifiedAt.getTime() - 24 * 60 * 60 * 1000);
    await seedComplianceRules(prisma, org.organizationId, ruleEffectiveFrom);
    await prisma.organization.update({
      where: { id: org.organizationId },
      data: {
        isSignificantDataFiduciary: true,
        sdfNotifiedAt,
        sdfNotificationRef: `SDF-NOTICE-${randomUUID()}`,
        dpoIsIndiaBased: options?.dpoIsIndiaBased ?? true,
      },
    });
    return org;
  }

  describe("Check 29: AUDIT completion rejections cite Rule 13", () => {
    it("rejects completing an AUDIT without isIndependent + auditor, and rejects closing without significantObservations/furnishedToBoardAt -- both citing Rule 13(1); the due date is computed from the resolved rule", async () => {
      const elevenMonthsAgo = new Date();
      elevenMonthsAgo.setMonth(elevenMonthsAgo.getMonth() - 11);
      const org = await makeSdfOrg("SDF_MANAGER_29", ["CAN_MANAGE_SDF"], elevenMonthsAgo);

      const createRes = await request(app.getHttpServer())
        .post("/api/sdf/assessments")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({ kind: "AUDIT" });
      expect(createRes.status).toBe(201);
      const assessmentId: string = createRes.body.id;

      // The due date must be the resolved rule's own 12 MONTHS from
      // cycleStartedAt (sdfNotifiedAt), computed via addByDeadlineUnit --
      // not any other arithmetic a hardcoded "12" could produce.
      const expectedDueAt = addByDeadlineUnit(elevenMonthsAgo, 12, "MONTHS");
      expect(new Date(createRes.body.dueAt).toISOString()).toBe(expectedDueAt.toISOString());

      // Reject: no isIndependent, no auditor.
      const rejectIndependence = await request(app.getHttpServer())
        .post(`/api/sdf/assessments/${assessmentId}/complete`)
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({ significantObservations: "None material.", furnishedToBoardAt: new Date().toISOString() });
      expect(rejectIndependence.status).toBe(400);
      expect(rejectIndependence.body.message).toContain(RULE_13_FRAGMENT);

      // Still reject: independent + auditor present, but no Board furnishing.
      const rejectBoardReport = await request(app.getHttpServer())
        .post(`/api/sdf/assessments/${assessmentId}/complete`)
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({ isIndependent: true, conductedBy: "Acme Independent Auditors LLP" });
      expect(rejectBoardReport.status).toBe(400);
      expect(rejectBoardReport.body.message).toContain(RULE_13_FRAGMENT);

      // Full completion succeeds.
      const completeRes = await request(app.getHttpServer())
        .post(`/api/sdf/assessments/${assessmentId}/complete`)
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          isIndependent: true,
          conductedBy: "Acme Independent Auditors LLP",
          significantObservations: "Two medium findings, remediated.",
          furnishedToBoardAt: new Date().toISOString(),
        });
      // @Post handlers default to 201 in this codebase's convention
      // (unmarked with @HttpCode) -- same as `ComplianceController`'s
      // `POST /:id/review`, an equivalent "action, not create" route.
      expect(completeRes.status).toBe(201);
      expect(completeRes.body.completedAt).not.toBeNull();
      expect(completeRes.body.isIndependent).toBe(true);
    });

    it("rejects closing a DPIA cycle without significantObservations/furnishedToBoardAt even when independence is not at issue (SD-04 applies to every kind)", async () => {
      const elevenMonthsAgo = new Date();
      elevenMonthsAgo.setMonth(elevenMonthsAgo.getMonth() - 11);
      const org = await makeSdfOrg("SDF_MANAGER_SD04", ["CAN_MANAGE_SDF"], elevenMonthsAgo);

      const createRes = await request(app.getHttpServer())
        .post("/api/sdf/assessments")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({ kind: "DPIA" });
      expect(createRes.status).toBe(201);

      const rejectRes = await request(app.getHttpServer())
        .post(`/api/sdf/assessments/${createRes.body.id}/complete`)
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({});
      expect(rejectRes.status).toBe(400);
      expect(rejectRes.body.message).toContain(RULE_13_FRAGMENT);
    });
  });

  describe("Non-SDF readiness view", () => {
    it("GET /api/sdf/assessments returns a readiness view (not an error) for a non-SDF org", async () => {
      const org = await createOrgWithEmployee(app, prisma, "SDF_READER_READY", ["CAN_MANAGE_SDF"]);
      orgIds.push(org.organizationId);

      const res = await request(app.getHttpServer())
        .get("/api/sdf/assessments")
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.organization.isSignificantDataFiduciary).toBe(false);
      expect(res.body.organization.sdfNotifiedAt).toBeNull();
      expect(res.body.assessments).toEqual([]);
    });

    it("opening a cycle on a non-SDF org is rejected, not silently accepted", async () => {
      const org = await createOrgWithEmployee(app, prisma, "SDF_READER_NOOPEN", ["CAN_MANAGE_SDF"]);
      orgIds.push(org.organizationId);

      const res = await request(app.getHttpServer())
        .post("/api/sdf/assessments")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({ kind: "DPIA" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/sdf/gaps", () => {
    it("surfaces a localisation-required transfer, an unreviewed algorithm entry, and dpoNotIndiaBased", async () => {
      const now = new Date();
      const org = await makeSdfOrg("SDF_GAPS_MANAGER", ["CAN_MANAGE_SDF"], now, {
        dpoIsIndiaBased: false,
      });

      const recipient = await prisma.dataRecipient.create({
        data: {
          organizationId: org.organizationId,
          name: `Offshore Processor ${randomUUID()}`,
          // OTHER_DATA_FIDUCIARY, not DATA_PROCESSOR: the DB-level
          // `processor_requires_contract` CHECK constraint requires a
          // DATA_PROCESSOR row to carry contract fields this fixture
          // does not need to exercise -- SD-06/CB-03's localisation gap
          // is independent of the recipient's contractual status.
          type: "OTHER_DATA_FIDUCIARY",
        },
      });
      const transfer = await prisma.crossBorderTransfer.create({
        data: {
          organizationId: org.organizationId,
          recipientId: recipient.id,
          destinationCountry: "XX",
          dataCategories: ["CONTACT"],
          purposeDescription: "Cloud hosting",
          localisationRequired: true,
        },
      });
      const algorithmEntry = await prisma.algorithmRegisterEntry.create({
        data: {
          organizationId: org.organizationId,
          name: "Fraud scoring model",
          description: "Scores transactions for fraud risk.",
          operations: ["HOSTING", "TRANSMISSION"],
          lastReviewedAt: null,
        },
      });

      const res = await request(app.getHttpServer())
        .get("/api/sdf/gaps")
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.dpoNotIndiaBased).toBe(true);
      expect(
        res.body.localisationRequiredTransfers.some((t: { id: string }) => t.id === transfer.id),
      ).toBe(true);
      expect(
        res.body.unreviewedAlgorithms.some((a: { id: string }) => a.id === algorithmEntry.id),
      ).toBe(true);
    });
  });

  describe("Algorithm register CRUD (SD-05)", () => {
    it("creates and updates an entry, recording a risk review", async () => {
      const org = await createOrgWithEmployee(app, prisma, "SDF_ALGO_MANAGER", ["CAN_MANAGE_SDF"]);
      orgIds.push(org.organizationId);

      const createRes = await request(app.getHttpServer())
        .post("/api/sdf/algorithms")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          name: "Recommendation engine",
          description: "Personalises the product feed.",
          operations: ["DISPLAY", "STORAGE", "UPDATING"],
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.operations).toEqual(["DISPLAY", "STORAGE", "UPDATING"]);

      const reviewRes = await request(app.getHttpServer())
        .patch(`/api/sdf/algorithms/${createRes.body.id}`)
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          riskAssessment: "Low risk to rights; periodic bias audit scheduled.",
          riskToRightsIdentified: false,
          lastReviewedAt: new Date().toISOString(),
        });
      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.riskAssessment).toContain("Low risk");
      expect(reviewRes.body.lastReviewedAt).not.toBeNull();
    });

    it("rejects an operation outside the Rule 13(3) vocabulary", async () => {
      const org = await createOrgWithEmployee(app, prisma, "SDF_ALGO_BADOP", ["CAN_MANAGE_SDF"]);
      orgIds.push(org.organizationId);

      const res = await request(app.getHttpServer())
        .post("/api/sdf/algorithms")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({ name: "X", description: "Y", operations: ["DELETION"] });
      expect(res.status).toBe(400);
    });
  });

  describe("Permission enforcement", () => {
    it("GET /api/sdf/gaps: CAN_MANAGE_SDF succeeds, no permission gets 403 on the identical route", async () => {
      const withPermission = await createOrgWithEmployee(app, prisma, "SDF_PERM_YES", [
        "CAN_MANAGE_SDF",
      ]);
      const withoutPermission = await createOrgWithEmployee(app, prisma, "SDF_PERM_NO", []);
      orgIds.push(withPermission.organizationId, withoutPermission.organizationId);

      const okRes = await request(app.getHttpServer())
        .get("/api/sdf/gaps")
        .set("Authorization", `Bearer ${withPermission.accessToken}`);
      expect(okRes.status).toBe(200);

      const deniedRes = await request(app.getHttpServer())
        .get("/api/sdf/gaps")
        .set("Authorization", `Bearer ${withoutPermission.accessToken}`);
      expect(deniedRes.status).toBe(403);
      expect(deniedRes.body.message).toContain("Missing required permission: CAN_MANAGE_SDF");
    });
  });

  describe("sdf-cycle-scan (SD-03)", () => {
    it("opens both a DPIA and an AUDIT row for the current cycle when run directly against a bound TenantContext", async () => {
      const now = new Date();
      const org = await makeSdfOrg("SDF_SCAN_ORG", ["CAN_MANAGE_SDF"], now);

      const summary = await TenantContext.run(systemActorStore(org.organizationId), () =>
        sdfCycleScanService.runForCurrentOrganization(),
      );
      expect(summary.cyclesOpened).toBe(2);

      const rows = await prisma.sdfAssessment.findMany({
        where: { organizationId: org.organizationId },
      });
      expect(rows.map((r) => r.kind).sort()).toEqual(["AUDIT", "DPIA"]);

      // Idempotent: running again for the same cycle opens nothing new.
      const secondSummary = await TenantContext.run(systemActorStore(org.organizationId), () =>
        sdfCycleScanService.runForCurrentOrganization(),
      );
      expect(secondSummary.cyclesOpened).toBe(0);
    });

    it("does nothing for an org that is not a declared SDF", async () => {
      const org = await createOrgWithEmployee(app, prisma, "SDF_SCAN_NONSDF", ["CAN_MANAGE_SDF"]);
      orgIds.push(org.organizationId);

      const summary = await TenantContext.run(systemActorStore(org.organizationId), () =>
        sdfCycleScanService.runForCurrentOrganization(),
      );
      expect(summary).toEqual({ cyclesOpened: 0, warningsSent: 0 });
    });
  });
});
