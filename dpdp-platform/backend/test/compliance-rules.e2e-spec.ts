import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RuleBasis } from "@prisma/client";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
} from "./support/e2e-harness";
import { seedComplianceRules } from "../prisma/seed/compliance-rules";

/**
 * Task 2 e2e coverage per the task brief:
 *   - Check 3: the seeded set carries exactly the spec table's bases
 *     (DPDP_MVP2_COMPLIANCE_OPERATIONS.md §2.4, lines 555-575), and no
 *     ORG_POLICY row is labelled STATUTORY.
 *   - Check 6: a 120-day GRIEVANCE_RESPONSE deadline is refused with the
 *     Rule 14(3) citation present in the 400 response body.
 *   - Permission enforcement: 403 without CAN_CHANGE_COMPLIANCE_CONFIG on
 *     POST and PATCH, each with a POSITIVE CONTROL on the same route and
 *     an identical payload (this project's house style, established by
 *     `test/rbac.e2e-spec.ts`).
 *
 * The `EXPECTED_BASIS_BY_RULE_CODE` map below is transcribed
 * independently from the spec table text (not imported from
 * `prisma/seed/compliance-rules.ts`'s own `COMPLIANCE_RULE_SEEDS`
 * constant) -- an e2e assertion that just re-imports the seed file's own
 * data and compares it to itself could never catch a transcription bug
 * in that file. This is the row-by-row, spec-is-truth check the task
 * brief calls for.
 */
const EXPECTED_BASIS_BY_RULE_CODE: Record<string, RuleBasis> = {
  GRIEVANCE_RESPONSE: "STATUTORY",
  BREACH_PRINCIPAL_NOTICE: "INTERNAL_TARGET",
  BREACH_BOARD_INITIAL: "INTERNAL_TARGET",
  BREACH_BOARD_DETAIL: "STATUTORY",
  CERT_IN_INCIDENT: "SECTORAL",
  REQUEST_ACCESS: "ORG_POLICY",
  REQUEST_CORRECTION: "ORG_POLICY",
  REQUEST_ERASURE: "ORG_POLICY",
  REQUEST_CONSENT_WITHDRAWAL: "ORG_POLICY",
  REQUEST_NOMINATION: "ORG_POLICY",
  REQUEST_OTHER: "ORG_POLICY",
  RETENTION_INACTIVITY: "STATUTORY",
  PRE_ERASURE_NOTICE: "STATUTORY",
  LOG_RETENTION_MINIMUM: "STATUTORY",
  SDF_ASSESSMENT_CYCLE: "STATUTORY",
  LEGACY_CONSENT_NOTICE: "INTERNAL_TARGET",
};

const GRIEVANCE_CITATION_FRAGMENT = "Rule 14(3)";

// `bootstrapTestApp()` compiles the entire real `AppModule` -- in this
// environment that alone can exceed `jest-e2e.json`'s default 15s
// `testTimeout`. File-local override only (shared config untouched).
jest.setTimeout(120000);

describe("Compliance rules (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const orgIds: string[] = [];

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    // ComplianceRule rows are MVP 2 shape -- cleanupOrgs only knows the
    // MVP 1 org shape, so this spec deletes its own rows first (per the
    // task brief and the harness's own doc comment).
    if (orgIds.length > 0) {
      await prisma.complianceRule.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  describe("Check 3: seeded rule set bases match the spec table; no ORG_POLICY/INTERNAL_TARGET row is labelled STATUTORY", () => {
    it("GET /api/compliance-rules returns every seeded rule with the exact spec-table basis", async () => {
      const reader = await createOrgWithEmployee(app, prisma, "COMPLIANCE_READER", [
        "CAN_VIEW_AUDIT_LOG",
      ]);
      orgIds.push(reader.organizationId);

      await seedComplianceRules(prisma, reader.organizationId);

      const res = await request(app.getHttpServer())
        .get("/api/compliance-rules")
        .set("Authorization", `Bearer ${reader.accessToken}`);
      expect(res.status).toBe(200);

      const rows = res.body as Array<{
        ruleCode: string;
        basis: RuleBasis;
        version: number;
        reviewedByEmployeeId: string | null;
        isReviewed: boolean;
      }>;

      const ruleCodesReturned = rows.map((r) => r.ruleCode).sort();
      const expectedRuleCodes = Object.keys(EXPECTED_BASIS_BY_RULE_CODE).sort();
      expect(ruleCodesReturned).toEqual(expectedRuleCodes);

      for (const row of rows) {
        expect(row.basis).toBe(EXPECTED_BASIS_BY_RULE_CODE[row.ruleCode]);
        // Every seeded rule starts at version 1 and unreviewed.
        expect(row.version).toBe(1);
        expect(row.reviewedByEmployeeId).toBeNull();
        expect(row.isReviewed).toBe(false);
      }

      // The specific assertion the task brief calls out by name: never
      // ORG_POLICY or INTERNAL_TARGET labelled STATUTORY.
      for (const row of rows) {
        const expectedBasis = EXPECTED_BASIS_BY_RULE_CODE[row.ruleCode];
        if (expectedBasis === "ORG_POLICY" || expectedBasis === "INTERNAL_TARGET") {
          expect(row.basis).not.toBe("STATUTORY");
        }
      }
    });
  });

  describe("Check 6: GRIEVANCE_RESPONSE refuses a deadline over 90 days", () => {
    it("POST /api/compliance-rules rejects deadlineValue: 120 with the Rule 14(3) citation in the 400 body", async () => {
      const grantee = await createOrgWithEmployee(
        app,
        prisma,
        "COMPLIANCE_ADMIN_GRIEVANCE",
        ["CAN_CHANGE_COMPLIANCE_CONFIG"],
      );
      orgIds.push(grantee.organizationId);

      const res = await request(app.getHttpServer())
        .post("/api/compliance-rules")
        .set("Authorization", `Bearer ${grantee.accessToken}`)
        .send({
          ruleCode: "GRIEVANCE_RESPONSE",
          name: "Grievance response deadline",
          legalSource:
            "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
          basis: "STATUTORY",
          appliesTo: "REQUEST:GRIEVANCE",
          deadlineValue: 120,
          deadlineUnit: "DAYS",
          warningLead: 14,
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain(GRIEVANCE_CITATION_FRAGMENT);
    });

    it("positive control: exactly 90 days is accepted on the identical route", async () => {
      const grantee = await createOrgWithEmployee(
        app,
        prisma,
        "COMPLIANCE_GRIEVANCE_OK",
        ["CAN_CHANGE_COMPLIANCE_CONFIG"],
      );
      orgIds.push(grantee.organizationId);

      const res = await request(app.getHttpServer())
        .post("/api/compliance-rules")
        .set("Authorization", `Bearer ${grantee.accessToken}`)
        .send({
          ruleCode: "GRIEVANCE_RESPONSE",
          name: "Grievance response deadline",
          legalSource:
            "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
          basis: "STATUTORY",
          appliesTo: "REQUEST:GRIEVANCE",
          deadlineValue: 90,
          deadlineUnit: "DAYS",
          warningLead: 14,
        });

      expect(res.status).toBe(201);
      expect(res.body.deadlineValue).toBe(90);
    });
  });

  describe("Permission enforcement (each 403 carries a positive control on the same route/payload)", () => {
    function rulePayload(ruleCode: string) {
      return {
        ruleCode,
        name: "Access request response",
        legalSource: "Company service level — the Rules set no separate figure for access",
        basis: "ORG_POLICY" as const,
        appliesTo: "REQUEST:ACCESS",
        deadlineValue: 30,
        deadlineUnit: "DAYS" as const,
        warningLead: 7,
      };
    }

    it("POST /api/compliance-rules: CAN_CHANGE_COMPLIANCE_CONFIG succeeds, no permission gets 403 on the identical payload", async () => {
      const withPermission = await createOrgWithEmployee(
        app,
        prisma,
        "COMPLIANCE_ADMIN_POST",
        ["CAN_CHANGE_COMPLIANCE_CONFIG"],
      );
      const withoutPermission = await createOrgWithEmployee(
        app,
        prisma,
        "COMPLIANCE_NOPERM_POST",
        [],
      );
      orgIds.push(withPermission.organizationId, withoutPermission.organizationId);

      const okRes = await request(app.getHttpServer())
        .post("/api/compliance-rules")
        .set("Authorization", `Bearer ${withPermission.accessToken}`)
        .send(rulePayload("REQUEST_ACCESS"));
      expect(okRes.status).toBe(201);

      const deniedRes = await request(app.getHttpServer())
        .post("/api/compliance-rules")
        .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
        .send(rulePayload("REQUEST_ACCESS"));
      expect(deniedRes.status).toBe(403);
      expect(deniedRes.body.message).toContain(
        "Missing required permission: CAN_CHANGE_COMPLIANCE_CONFIG",
      );
    });

    it("PATCH /api/compliance-rules/:id: CAN_CHANGE_COMPLIANCE_CONFIG succeeds, no permission gets 403 on the identical payload", async () => {
      const withPermission = await createOrgWithEmployee(
        app,
        prisma,
        "COMPLIANCE_ADMIN_PATCH",
        ["CAN_CHANGE_COMPLIANCE_CONFIG"],
      );
      const withoutPermission = await createOrgWithEmployee(
        app,
        prisma,
        "COMPLIANCE_NOPERM_PATCH",
        [],
      );
      orgIds.push(withPermission.organizationId, withoutPermission.organizationId);

      // Each org gets its own target row to PATCH -- seeded directly via
      // Prisma (bypassing the API) so this test does not also depend on
      // POST already working.
      const now = new Date();
      const targetInGrantedOrg = await prisma.complianceRule.create({
        data: {
          organizationId: withPermission.organizationId,
          ruleCode: "REQUEST_ACCESS",
          version: 1,
          name: "Access request response",
          legalSource: "Company service level",
          basis: "ORG_POLICY",
          appliesTo: "REQUEST:ACCESS",
          deadlineValue: 30,
          deadlineUnit: "DAYS",
          warningLead: 7,
          effectiveFrom: now,
        },
      });
      const targetInDeniedOrg = await prisma.complianceRule.create({
        data: {
          organizationId: withoutPermission.organizationId,
          ruleCode: "REQUEST_ACCESS",
          version: 1,
          name: "Access request response",
          legalSource: "Company service level",
          basis: "ORG_POLICY",
          appliesTo: "REQUEST:ACCESS",
          deadlineValue: 30,
          deadlineUnit: "DAYS",
          warningLead: 7,
          effectiveFrom: now,
        },
      });

      const patchPayload = { deadlineValue: 45 };

      const okRes = await request(app.getHttpServer())
        .patch(`/api/compliance-rules/${targetInGrantedOrg.id}`)
        .set("Authorization", `Bearer ${withPermission.accessToken}`)
        .send(patchPayload);
      expect(okRes.status).toBe(200);
      expect(okRes.body.deadlineValue).toBe(45);
      expect(okRes.body.version).toBe(2);

      const deniedRes = await request(app.getHttpServer())
        .patch(`/api/compliance-rules/${targetInDeniedOrg.id}`)
        .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
        .send(patchPayload);
      expect(deniedRes.status).toBe(403);
      expect(deniedRes.body.message).toContain(
        "Missing required permission: CAN_CHANGE_COMPLIANCE_CONFIG",
      );
    });
  });

  describe("Rule versioning end to end: editing never mutates the row in use", () => {
    it("PATCH creates version 2; the version-1 row is unchanged and still fetchable by id", async () => {
      const admin = await createOrgWithEmployee(app, prisma, "COMPLIANCE_ADMIN_VERSION", [
        "CAN_CHANGE_COMPLIANCE_CONFIG",
        "CAN_VIEW_AUDIT_LOG",
      ]);
      orgIds.push(admin.organizationId);

      const createRes = await request(app.getHttpServer())
        .post("/api/compliance-rules")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send(rulePayload_forVersionTest());
      expect(createRes.status).toBe(201);
      const v1Id = createRes.body.id as string;
      expect(createRes.body.version).toBe(1);

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/compliance-rules/${v1Id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ deadlineValue: 15 });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.version).toBe(2);
      const v2Id = patchRes.body.id as string;
      expect(v2Id).not.toBe(v1Id);

      // The version-1 row is untouched: still exists, still deadlineValue 30.
      const v1Row = await prisma.complianceRule.findUniqueOrThrow({
        where: { id: v1Id },
      });
      expect(v1Row.deadlineValue).toBe(30);
      expect(v1Row.version).toBe(1);

      // list() surfaces only the latest version per ruleCode.
      const listRes = await request(app.getHttpServer())
        .get("/api/compliance-rules")
        .set("Authorization", `Bearer ${admin.accessToken}`);
      const returned = (listRes.body as Array<{ id: string; version: number }>).find(
        (r) => r.id === v2Id,
      );
      expect(returned).toBeDefined();
      expect(returned?.version).toBe(2);
      const stale = (listRes.body as Array<{ id: string }>).find((r) => r.id === v1Id);
      expect(stale).toBeUndefined();
    });

    function rulePayload_forVersionTest() {
      return {
        ruleCode: `VERSION_TEST_${randomUUID()}`,
        name: "Version test rule",
        legalSource: "Company service level",
        basis: "ORG_POLICY" as const,
        appliesTo: "REQUEST:OTHER",
        deadlineValue: 30,
        deadlineUnit: "DAYS" as const,
        warningLead: 7,
      };
    }
  });
});
