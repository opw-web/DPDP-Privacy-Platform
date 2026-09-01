import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TenantContext, type TenantStore } from "../src/common/tenant/tenant-context";
import {
  findActiveNonDisclosureDirections,
  isUnderActiveNonDisclosure,
} from "../src/modules/board/non-disclosure";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
} from "./support/e2e-harness";

/**
 * Task 13 e2e coverage, Board/Government interaction (BD-01...BD-06).
 * Spec line 830: "a small feature with a large failure mode. Test it
 * explicitly." Per this task's own instructions, the scope here is
 * "Check 28's data half": an `InformationRequest` with
 * `nonDisclosureDirected = true` naming a principal --
 *   (a) the request is recorded with its authorisation reference, and
 *       that recording IS itself written to the internal audit log
 *       (`INFORMATION_REQUEST_RECORDED`), and
 *   (b) the named principal is queryable as a suppression target via the
 *       EXACT query shape `src/modules/evidence/non-disclosure.ts` (task
 *       12, already shipped) uses against this same table, through the
 *       plain functions this task publishes in
 *       `src/modules/board/non-disclosure.ts`.
 * The "leak" half -- that a suppressed request never reaches her portal,
 * access report or evidence file -- is asserted end-to-end by
 * `test/evidence.e2e-spec.ts` (task 12), which already exercises exactly
 * this fixture shape against `PrincipalEvidenceService` /
 * `AccessReportService`.
 */

const RULE_23_FRAGMENT = "Rule 23(2)";

// `bootstrapTestApp()` compiles the entire real `AppModule` -- can exceed
// `jest-e2e.json`'s default 15s `testTimeout` in this environment.
jest.setTimeout(120000);

describe("Information requests / Board & Government interaction (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const orgIds: string[] = [];
  const principalIds: string[] = [];

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    if (principalIds.length > 0) {
      await prisma.dataPrincipal.deleteMany({ where: { id: { in: principalIds } } });
    }
    if (orgIds.length > 0) {
      await prisma.informationRequest.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.voluntaryUndertaking.deleteMany({ where: { organizationId: { in: orgIds } } });
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
      actorLabel: "information-requests-e2e",
    };
  }

  async function createPrincipal(organizationId: string): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Non-Disclosure Test Principal",
      },
    });
    principalIds.push(principal.id);
    return principal.id;
  }

  describe("Check 28 (data half): non-disclosure direction requires its authorisation reference, and is auditable", () => {
    it("rejects nonDisclosureDirected = true with no nonDisclosurePermissionRef, citing Rule 23(2)", async () => {
      const org = await createOrgWithEmployee(app, prisma, "BOARD_MGR_NODIR", [
        "CAN_CHANGE_COMPLIANCE_CONFIG",
      ]);
      orgIds.push(org.organizationId);
      const principalId = await createPrincipal(org.organizationId);

      const res = await request(app.getHttpServer())
        .post("/api/information-requests")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          requestingBody: "CENTRAL_GOVERNMENT",
          authorisedPersonRef: "Authorised Officer Ref X",
          purposeCited: "Sovereignty and integrity of India",
          receivedAt: new Date().toISOString(),
          responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          nonDisclosureDirected: true,
          affectedPrincipalIds: [principalId],
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain(RULE_23_FRAGMENT);
    });

    it("recording a non-disclosure direction with its authorisation reference is itself written to the audit log, and the named principal becomes queryable as a suppression target", async () => {
      const org = await createOrgWithEmployee(app, prisma, "BOARD_MGR_DIR", [
        "CAN_CHANGE_COMPLIANCE_CONFIG",
      ]);
      orgIds.push(org.organizationId);
      const namedPrincipalId = await createPrincipal(org.organizationId);
      const unrelatedPrincipalId = await createPrincipal(org.organizationId);
      const authorisationRef = `AUTH-REF-${randomUUID()}`;

      const createRes = await request(app.getHttpServer())
        .post("/api/information-requests")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          requestingBody: "BOARD",
          authorisedPersonRef: "Authorised Officer Ref Y",
          purposeCited: "Ongoing Board inquiry",
          receivedAt: new Date().toISOString(),
          responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          nonDisclosureDirected: true,
          nonDisclosurePermissionRef: authorisationRef,
          affectedPrincipalIds: [namedPrincipalId],
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.reference).toMatch(/^IR-\d{6}$/);
      expect(createRes.body.nonDisclosureDirected).toBe(true);
      expect(createRes.body.nonDisclosurePermissionRef).toBe(authorisationRef);

      // (a) internal accountability -- the direction itself, with its
      // authorisation reference, is on the audit log.
      const auditRow = await prisma.auditEvent.findFirst({
        where: {
          organizationId: org.organizationId,
          action: "INFORMATION_REQUEST_RECORDED",
          resourceId: createRes.body.id,
        },
      });
      expect(auditRow).not.toBeNull();
      const metadata = auditRow!.metadata as Record<string, unknown>;
      expect(metadata["authorisationRef"]).toBe(authorisationRef);
      expect(metadata["nonDisclosureDirected"]).toBe(true);

      // (b) queryable as a suppression target -- the exact shape
      // evidence/non-disclosure.ts and campaigns are told to use.
      await TenantContext.run(systemActorStore(org.organizationId), () =>
        prisma.scoped.$transaction(async (tx) => {
          const directions = await findActiveNonDisclosureDirections(tx, namedPrincipalId);
          expect(directions).toHaveLength(1);
          const [direction] = directions;
          expect(direction!.authorisationRef).toBe(authorisationRef);
          expect(direction!.reference).toBe(createRes.body.reference);

          expect(await isUnderActiveNonDisclosure(tx, namedPrincipalId)).toBe(true);
          // An unrelated principal, named by nothing, is never swept in.
          expect(await isUnderActiveNonDisclosure(tx, unrelatedPrincipalId)).toBe(false);
        }),
      );
    });

    it("a request naming a principal WITHOUT a non-disclosure direction never counts as an active direction", async () => {
      const org = await createOrgWithEmployee(app, prisma, "BOARD_MGR_NORMAL", [
        "CAN_CHANGE_COMPLIANCE_CONFIG",
      ]);
      orgIds.push(org.organizationId);
      const principalId = await createPrincipal(org.organizationId);

      const createRes = await request(app.getHttpServer())
        .post("/api/information-requests")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          requestingBody: "BOARD",
          authorisedPersonRef: "Authorised Officer Ref Z",
          purposeCited: "Routine information request",
          receivedAt: new Date().toISOString(),
          responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          affectedPrincipalIds: [principalId],
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.nonDisclosureDirected).toBe(false);

      await TenantContext.run(systemActorStore(org.organizationId), () =>
        prisma.scoped.$transaction(async (tx) => {
          expect(await isUnderActiveNonDisclosure(tx, principalId)).toBe(false);
        }),
      );
    });
  });

  describe("CRUD", () => {
    it("rejects unknown and cross-tenant affected principal ids without creating a request", async () => {
      const org = await createOrgWithEmployee(app, prisma, "BOARD_MGR_BAD_PRINCIPAL", [
        "CAN_CHANGE_COMPLIANCE_CONFIG",
      ]);
      orgIds.push(org.organizationId);
      const foreignOrg = await createOrgWithEmployee(app, prisma, "BOARD_MGR_FOREIGN", []);
      orgIds.push(foreignOrg.organizationId);
      const foreignPrincipalId = await createPrincipal(foreignOrg.organizationId);
      const payload = {
        requestingBody: "BOARD",
        authorisedPersonRef: "Authorised Officer Ref Invalid",
        purposeCited: "Integrity of a test investigation",
        receivedAt: new Date().toISOString(),
        responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      for (const affectedPrincipalIds of [[randomUUID()], [foreignPrincipalId]]) {
        // eslint-disable-next-line no-await-in-loop
        const response = await request(app.getHttpServer())
          .post("/api/information-requests")
          .set("Authorization", `Bearer ${org.accessToken}`)
          .send({ ...payload, affectedPrincipalIds });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("unknown principal");
      }
      expect(await prisma.informationRequest.count({ where: { organizationId: org.organizationId } })).toBe(0);
    });

    it("rejects an update that introduces an unknown affected principal and leaves the row unchanged", async () => {
      const org = await createOrgWithEmployee(app, prisma, "BOARD_MGR_BAD_PATCH", [
        "CAN_CHANGE_COMPLIANCE_CONFIG",
      ]);
      orgIds.push(org.organizationId);
      const principalId = await createPrincipal(org.organizationId);
      const createRes = await request(app.getHttpServer())
        .post("/api/information-requests")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          requestingBody: "BOARD",
          authorisedPersonRef: "Authorised Officer Ref Patch",
          purposeCited: "A documented Board purpose",
          receivedAt: new Date().toISOString(),
          responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          affectedPrincipalIds: [principalId],
        });
      expect(createRes.status).toBe(201);
      const response = await request(app.getHttpServer())
        .patch(`/api/information-requests/${createRes.body.id}`)
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({ affectedPrincipalIds: [randomUUID()] });
      expect(response.status).toBe(400);
      expect(response.body.message).toContain("unknown principal");
      const unchanged = await prisma.informationRequest.findUniqueOrThrow({
        where: { id: createRes.body.id },
      });
      expect(unchanged.affectedPrincipalIds).toEqual([principalId]);
    });

    it("PATCH records what was furnished in response", async () => {
      const org = await createOrgWithEmployee(app, prisma, "BOARD_MGR_PATCH", [
        "CAN_CHANGE_COMPLIANCE_CONFIG",
      ]);
      orgIds.push(org.organizationId);

      const createRes = await request(app.getHttpServer())
        .post("/api/information-requests")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          requestingBody: "CENTRAL_GOVERNMENT",
          authorisedPersonRef: "Authorised Officer Ref P",
          purposeCited: "Prevention of offence",
          receivedAt: new Date().toISOString(),
          responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(createRes.status).toBe(201);

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/information-requests/${createRes.body.id}`)
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          respondedAt: new Date().toISOString(),
          responseReference: "Letter dated today, Ref FUR-001",
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.responseReference).toBe("Letter dated today, Ref FUR-001");
      expect(patchRes.body.respondedAt).not.toBeNull();

      const listRes = await request(app.getHttpServer())
        .get("/api/information-requests")
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.some((r: { id: string }) => r.id === createRes.body.id)).toBe(true);
    });
  });

  describe("Permission enforcement", () => {
    it("POST /api/information-requests: CAN_CHANGE_COMPLIANCE_CONFIG succeeds, no permission gets 403 on the identical payload", async () => {
      const withPermission = await createOrgWithEmployee(app, prisma, "BOARD_PERM_YES", [
        "CAN_CHANGE_COMPLIANCE_CONFIG",
      ]);
      const withoutPermission = await createOrgWithEmployee(app, prisma, "BOARD_PERM_NO", []);
      orgIds.push(withPermission.organizationId, withoutPermission.organizationId);

      const payload = {
        requestingBody: "BOARD",
        authorisedPersonRef: "Authorised Officer Ref Q",
        purposeCited: "Routine information request",
        receivedAt: new Date().toISOString(),
        responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const okRes = await request(app.getHttpServer())
        .post("/api/information-requests")
        .set("Authorization", `Bearer ${withPermission.accessToken}`)
        .send(payload);
      expect(okRes.status).toBe(201);

      const deniedRes = await request(app.getHttpServer())
        .post("/api/information-requests")
        .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
        .send(payload);
      expect(deniedRes.status).toBe(403);
      expect(deniedRes.body.message).toContain(
        "Missing required permission: CAN_CHANGE_COMPLIANCE_CONFIG",
      );
    });
  });

  describe("Voluntary undertakings (BD-06, s.32)", () => {
    it("creates an undertaking with commitments and can close it", async () => {
      const org = await createOrgWithEmployee(app, prisma, "BOARD_VU_MGR", [
        "CAN_CHANGE_COMPLIANCE_CONFIG",
      ]);
      orgIds.push(org.organizationId);

      const createRes = await request(app.getHttpServer())
        .post("/api/voluntary-undertakings")
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({
          reference: `VU-${randomUUID()}`,
          summary: "Undertaking to remediate consent capture gaps.",
          acceptedAt: new Date().toISOString(),
          commitments: [{ text: "Fix consent widget", dueAt: new Date().toISOString(), status: "PENDING" }],
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.commitments).toHaveLength(1);
      const createAudit = await prisma.auditEvent.findFirst({
        where: {
          organizationId: org.organizationId,
          resourceType: "VoluntaryUndertaking",
          resourceId: createRes.body.id,
          action: "VOLUNTARY_UNDERTAKING_CREATED",
        },
      });
      expect(createAudit).not.toBeNull();

      const closeRes = await request(app.getHttpServer())
        .patch(`/api/voluntary-undertakings/${createRes.body.id}`)
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send({ closedAt: new Date().toISOString() });
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.closedAt).not.toBeNull();
      const updateAudit = await prisma.auditEvent.findFirst({
        where: {
          organizationId: org.organizationId,
          resourceType: "VoluntaryUndertaking",
          resourceId: createRes.body.id,
          action: "VOLUNTARY_UNDERTAKING_UPDATED",
        },
      });
      expect(updateAudit).not.toBeNull();
    });
  });
});
