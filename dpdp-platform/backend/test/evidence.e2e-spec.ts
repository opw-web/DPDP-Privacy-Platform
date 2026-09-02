import { randomUUID } from "crypto";
import { inflateSync } from "zlib";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TenantContext } from "../src/common/tenant/tenant-context";
import { AccessReportService } from "../src/modules/evidence/access-report.service";
import { PrincipalEvidenceService } from "../src/modules/evidence/principal-evidence.service";
import {
  renderAccessReportCsv,
  renderAccessReportPdf,
} from "../src/modules/evidence/access-report-render";
import { renderPrincipalEvidencePdf } from "../src/modules/evidence/principal-evidence-render";
import {
  bootstrapTestApp,
  cleanupOrgs,
  createOrgWithEmployee,
  ensurePermission,
  type OrgWithEmployee,
} from "./support/e2e-harness";

/**
 * supertest/superagent only auto-buffers `res.body` for text/json content
 * types; a binary response (`application/pdf`, `application/zip`) needs
 * an explicit buffering parser or `res.body` stays `{}`. Both binary
 * routes below use this.
 */
function bufferBinaryResponse(req: request.Test): request.Test {
  return req.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => callback(null, Buffer.concat(chunks)));
  });
}

/**
 * Task 12: the s.11 access report, per-principal evidence file, audit
 * chain verification, and the evidence pack.
 *
 * `AccessReportService` and `PrincipalEvidenceService` are exercised
 * directly via Nest DI (`app.get(...)`), not over HTTP: the HTTP routes
 * that actually SERVE the s.11 access report (`GET
 * /api/requests/:ref/access-report.pdf`, `GET /api/me/access-report.pdf`)
 * belong to other tasks' owned modules (`requests`, `principal-portal`)
 * and are out of this task's scope -- this task owns the report-BUILDING
 * service and the evidence-file/chain/pack HTTP surface. Calling a
 * service directly outside a real HTTP request requires binding
 * `TenantContext` manually, exactly as `TenantContext.run`'s own doc
 * comment prescribes: `run(store, () => service.method())`, returning the
 * promise directly so the store stays bound while the (lazy, extension-
 * scoped) Prisma calls inside actually dispatch.
 */
describe("Evidence module (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessReportService: AccessReportService;
  let principalEvidenceService: PrincipalEvidenceService;

  const orgIds: string[] = [];
  const dataSourceIds: string[] = [];
  const purposeIds: string[] = [];
  const recipientIds: string[] = [];
  const informationRequestIds: string[] = [];
  // DataPrincipal rows are never force-deleted in this test suite (same
  // convention `mvp2-schema-constraints.e2e-spec.ts` documents: some carry
  // delete-protected ConsentEvent children, and "a data principal is
  // never destroyed in this product"). Left in place permanently.
  const principalIds: string[] = [];

  let orgA: OrgWithEmployee; // full evidence permissions
  let orgALimited: OrgWithEmployee; // same org, no evidence permissions

  let principal1Id: string; // her contributing source is dataSourceHer only
  let principal2Id: string; // named in an active non-disclosure InformationRequest
  let dataSourceHerId: string;
  let dataSourceOtherId: string;
  let recipientHerId: string;
  let recipientOtherId: string;
  let purposeId: string;
  let nonDisclosureRequestId: string;
  const NON_DISCLOSURE_AUTH_REF = "AUTH-REF-EVIDENCE-TEST-1";

  async function createPrincipal(
    organizationId: string,
    displayName: string,
  ): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName,
      },
    });
    principalIds.push(principal.id);
    return principal.id;
  }

  /**
   * A second role+employee in the SAME organization as `org`, so fixture
   * data can be shared across the permission-gated / permission-denied
   * pair of requests each check below makes. `createOrgWithEmployee`
   * cannot be reused here -- it always mints a brand-new organization.
   */
  async function addEmployee(
    organizationId: string,
    roleCode: string,
    permissionCodes: readonly string[],
  ): Promise<OrgWithEmployee> {
    for (const code of permissionCodes) {
      await ensurePermission(prisma, code);
    }
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: roleCode,
        name: roleCode,
        isSystem: false,
        permissions: {
          create: permissionCodes.map((permissionCode) => ({ permissionCode })),
        },
      },
    });
    const email = `${roleCode.toLowerCase()}-${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const employee = await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: roleCode,
        roleId: role.id,
        passwordHash,
        status: "ACTIVE",
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });
    if (loginRes.status !== 200) {
      throw new Error(`addEmployee(): login failed: ${JSON.stringify(loginRes.body)}`);
    }
    return {
      organizationId,
      roleId: role.id,
      employeeId: employee.id,
      email,
      accessToken: loginRes.body.accessToken as string,
    };
  }

  function tenantStoreFor(org: OrgWithEmployee) {
    return {
      actorType: "EMPLOYEE" as const,
      organizationId: org.organizationId,
      actorId: org.employeeId,
      actorLabel: "Evidence Test Harness",
    };
  }

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    accessReportService = app.get(AccessReportService);
    principalEvidenceService = app.get(PrincipalEvidenceService);

    orgA = await createOrgWithEmployee(app, prisma, "EVID_FULL", [
      "CAN_VIEW_ALL_PERSONAL_DATA",
      "CAN_VIEW_AUDIT_LOG",
      "CAN_EXPORT_EVIDENCE",
      "CAN_VIEW_PRINCIPALS",
    ]);
    orgIds.push(orgA.organizationId);
    orgALimited = await addEmployee(orgA.organizationId, "EVID_LIMITED", [
      "CAN_VIEW_PRINCIPALS",
    ]);

    // ── fixtures: principal 1 -- her personal data, processing activity,
    // recipient (via her contributing source), consent, retention ──
    principal1Id = await createPrincipal(orgA.organizationId, "Report Test Principal");

    const dataSourceHer = await prisma.dataSource.create({
      data: {
        organizationId: orgA.organizationId,
        name: `Source Her ${randomUUID()}`,
        systemType: "CRM",
        baseUrl: "https://example.test/her",
        recordsPath: "data",
        externalIdField: "id",
        status: "CONNECTED",
      },
    });
    dataSourceHerId = dataSourceHer.id;
    dataSourceIds.push(dataSourceHerId);

    const dataSourceOther = await prisma.dataSource.create({
      data: {
        organizationId: orgA.organizationId,
        name: `Source Other ${randomUUID()}`,
        systemType: "CRM",
        baseUrl: "https://example.test/other",
        recordsPath: "data",
        externalIdField: "id",
        status: "CONNECTED",
      },
    });
    dataSourceOtherId = dataSourceOther.id;
    dataSourceIds.push(dataSourceOtherId);

    const purpose = await prisma.processingPurpose.create({
      data: {
        organizationId: orgA.organizationId,
        code: `SUPPORT_${randomUUID().slice(0, 8)}`,
        name: "Customer support",
        description: "Responding to support enquiries",
        lawfulBasis: "CONSENT",
        basisJustification: "She consented at signup",
        dataCategories: ["CONTACT"],
      },
    });
    purposeId = purpose.id;
    purposeIds.push(purposeId);

    await prisma.dataSourcePurpose.create({
      data: { dataSourceId: dataSourceHerId, purposeId },
    });

    await prisma.principalDataField.create({
      data: {
        organizationId: orgA.organizationId,
        dataPrincipalId: principal1Id,
        canonicalField: "EMAIL",
        value: "principal-one@example.test",
        dataCategory: "CONTACT",
        sourceIds: [dataSourceHerId],
        isPrimary: true,
      },
    });

    const recipientHer = await prisma.dataRecipient.create({
      data: {
        organizationId: orgA.organizationId,
        name: `Recipient Her ${randomUUID()}`,
        type: "OTHER_DATA_FIDUCIARY",
      },
    });
    recipientHerId = recipientHer.id;
    recipientIds.push(recipientHerId);

    const recipientOther = await prisma.dataRecipient.create({
      data: {
        organizationId: orgA.organizationId,
        name: `Recipient Other ${randomUUID()}`,
        type: "OTHER_DATA_FIDUCIARY",
      },
    });
    recipientOtherId = recipientOther.id;
    recipientIds.push(recipientOtherId);

    // She contributed to dataSourceHer only -- this activity's sourceIds
    // overlap hers, so it MUST appear in her report/recipients.
    await prisma.sharingActivity.create({
      data: {
        organizationId: orgA.organizationId,
        recipientId: recipientHerId,
        purposeId,
        dataCategories: ["CONTACT"],
        description: "Shared her email for support ticket handoff",
        sourceIds: [dataSourceHerId],
        startedAt: new Date(),
        active: true,
      },
    });

    // Fed only by dataSourceOther -- a system she is NOT in. Check 26:
    // this recipient must NOT appear in her report.
    await prisma.sharingActivity.create({
      data: {
        organizationId: orgA.organizationId,
        recipientId: recipientOtherId,
        purposeId,
        dataCategories: ["CONTACT"],
        description: "Shared an unrelated principal's data",
        sourceIds: [dataSourceOtherId],
        startedAt: new Date(),
        active: true,
      },
    });

    const consentRecord = await prisma.consentRecord.create({
      data: {
        organizationId: orgA.organizationId,
        dataPrincipalId: principal1Id,
        purposeId,
        status: "GRANTED",
        channel: "PORTAL",
        grantedAt: new Date(),
      },
    });
    await prisma.consentEvent.create({
      data: {
        organizationId: orgA.organizationId,
        consentRecordId: consentRecord.id,
        toStatus: "GRANTED",
        channel: "PORTAL",
        actorType: "PRINCIPAL",
        actorLabel: "Report Test Principal",
      },
    });

    await prisma.erasureTask.create({
      data: {
        organizationId: orgA.organizationId,
        dataPrincipalId: principal1Id,
        trigger: "INACTIVITY",
        state: "EVALUATED",
      },
    });

    // ── fixtures: principal 2 -- named in an active non-disclosure request ──
    principal2Id = await createPrincipal(orgA.organizationId, "Non-Disclosure Principal");
    const infoRequest = await prisma.informationRequest.create({
      data: {
        organizationId: orgA.organizationId,
        reference: `IR-${randomUUID().slice(0, 8)}`,
        requestingBody: "BOARD",
        authorisedPersonRef: "Authorised Officer Ref 1",
        purposeCited: "Ongoing Board inquiry",
        receivedAt: new Date(),
        responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        nonDisclosureDirected: true,
        nonDisclosurePermissionRef: NON_DISCLOSURE_AUTH_REF,
        affectedPrincipalIds: [principal2Id],
      },
    });
    nonDisclosureRequestId = infoRequest.id;
    informationRequestIds.push(infoRequest.id);
  });

  afterAll(async () => {
    await prisma.sharingActivity.deleteMany({
      where: { recipientId: { in: recipientIds } },
    });
    await prisma.dataRecipient.deleteMany({ where: { id: { in: recipientIds } } });
    await prisma.dataSource.deleteMany({ where: { id: { in: dataSourceIds } } });
    await prisma.processingPurpose.deleteMany({ where: { id: { in: purposeIds } } });
    await prisma.informationRequest.deleteMany({
      where: { id: { in: informationRequestIds } },
    });
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  describe("Check 26: the access report answers s.11 in full", () => {
    it("assembles all five sections and filters recipients to her contributing sources only", async () => {
      const report = await TenantContext.run(tenantStoreFor(orgA), () =>
        accessReportService.buildReport(principal1Id),
      );

      // Section 1: personal data with lineage.
      expect(report.personalData.length).toBeGreaterThan(0);
      const emailField = report.personalData.find((f) => f.canonicalField === "EMAIL");
      expect(emailField?.value).toBe("principal-one@example.test");
      expect(emailField?.sources.map((s) => s.id)).toContain(dataSourceHerId);

      // Section 2: processing activities.
      expect(report.processingActivities.length).toBeGreaterThan(0);
      expect(report.processingActivities.some((a) => a.purposeId === purposeId)).toBe(
        true,
      );

      // Section 3: recipients -- her contributing sources only.
      const recipientIdsInReport = report.recipients.map((r) => r.recipient.id);
      expect(recipientIdsInReport).toContain(recipientHerId);
      expect(recipientIdsInReport).not.toContain(recipientOtherId);
      const herEntry = report.recipients.find((r) => r.recipient.id === recipientHerId);
      expect(herEntry?.description).toBe("Shared her email for support ticket handoff");

      // Section 4: consent status and history.
      expect(report.consent.length).toBeGreaterThan(0);
      const consentEntry = report.consent.find((c) => c.purposeId === purposeId);
      expect(consentEntry?.status).toBe("GRANTED");
      expect(consentEntry?.history.length).toBeGreaterThan(0);

      // Section 5: retention position / erasure task.
      expect(report.retention.length).toBeGreaterThan(0);
      expect(report.retention[0]?.trigger).toBe("INACTIVITY");

      expect(report.organizationName).toContain("E2E Harness Org");
    });
  });

  describe("Check 28 (evidence half): non-disclosure exclusion", () => {
    it("excludes an active non-disclosure request from the access report and evidence file, and audits the suppression with its authorisation reference", async () => {
      const report = await TenantContext.run(tenantStoreFor(orgA), () =>
        accessReportService.buildReport(principal2Id),
      );
      expect(
        report.governmentRequests.some((r) => r.id === nonDisclosureRequestId),
      ).toBe(false);
      expect(report.suppressedRequestCount).toBeGreaterThanOrEqual(1);

      const evidenceFile = await TenantContext.run(tenantStoreFor(orgA), () =>
        principalEvidenceService.buildEvidenceFile(principal2Id),
      );
      expect(
        evidenceFile.governmentRequests.some((r) => r.id === nonDisclosureRequestId),
      ).toBe(false);
      expect(evidenceFile.suppressedRequestCount).toBeGreaterThanOrEqual(1);

      const suppressionEvents = await prisma.auditEvent.findMany({
        where: {
          organizationId: orgA.organizationId,
          action: "NON_DISCLOSURE_SUPPRESSION_APPLIED",
          resourceId: nonDisclosureRequestId,
        },
      });
      // One from the access-report build, one from the evidence-file build.
      expect(suppressionEvents.length).toBeGreaterThanOrEqual(2);
      for (const event of suppressionEvents) {
        const metadata = event.metadata as Record<string, unknown>;
        expect(metadata["authorisationRef"]).toBe(NON_DISCLOSURE_AUTH_REF);
        expect(metadata["reference"]).toBe(
          (
            await prisma.informationRequest.findUniqueOrThrow({
              where: { id: nonDisclosureRequestId },
            })
          ).reference,
        );
      }
    });

    /**
     * D9: a live walkthrough found the access report and the evidence
     * file both telling the data principal, in plain words, that a
     * record naming her is "withheld under a non-disclosure direction" --
     * disclosing exactly the two facts such a direction exists to
     * conceal. Spec 4.12: "the request never appears in her portal, her
     * access report, or her evidence file" (no exception for a note
     * about its absence), and "this is a small feature with a large
     * failure mode. Test it explicitly."
     *
     * This asserts on the RENDERED documents (PDF text pulled back out
     * of pdfkit's compressed content streams, plus the plain CSV), not
     * just the pre-render `AccessReportData`/`PrincipalEvidenceFile`
     * shape checked above -- the earlier version of this test suite only
     * asserted the latter and passed while the render functions leaked
     * the note, which is exactly why it did not catch D9.
     */
    it("D9: the rendered access report (PDF and CSV) and evidence file (PDF) say nothing about the suppressed record", async () => {
      const report = await TenantContext.run(tenantStoreFor(orgA), () =>
        accessReportService.buildReport(principal2Id),
      );
      const evidenceFile = await TenantContext.run(tenantStoreFor(orgA), () =>
        principalEvidenceService.buildEvidenceFile(principal2Id),
      );
      // Fixture sanity: if this were 0, the assertions below would pass
      // vacuously (nothing to leak).
      expect(report.suppressedRequestCount).toBeGreaterThanOrEqual(1);
      expect(evidenceFile.suppressedRequestCount).toBeGreaterThanOrEqual(1);

      const accessReportPdfText = extractPdfText(await renderAccessReportPdf(report));
      const accessReportCsv = renderAccessReportCsv(report);
      const evidencePdfText = extractPdfText(
        await renderPrincipalEvidencePdf(evidenceFile),
      );

      for (const rendered of [accessReportPdfText, accessReportCsv, evidencePdfText]) {
        // The wording the walkthrough actually saw -- and the single
        // word ("withheld") that can never be split by pdfkit's line
        // wrapping, so this assertion still catches a reworded leak.
        expect(rendered).not.toContain("withheld");
        expect(rendered).not.toContain("non-disclosure direction");
        expect(rendered).not.toContain("record(s) affecting");
        // Not just the sentence -- the count itself is part of the
        // disclosure (it tells her something is being hidden at all).
        expect(rendered).not.toContain("suppressed");
        expect(rendered).not.toMatch(/Withheld under non-disclosure/i);
      }

      // The internal-accountability half must still hold: the staff-only
      // evidence JSON view (`PrincipalEvidencePage.tsx`'s "N visible
      // request(s); M suppressed request(s)") still counts the
      // suppression, and the audit log still carries it with its
      // authorisation reference.
      const staffEvidenceRes = await request(app.getHttpServer())
        .get(`/api/principals/${principal2Id}/evidence`)
        .set("Authorization", `Bearer ${orgA.accessToken}`);
      expect(staffEvidenceRes.status).toBe(200);
      expect(staffEvidenceRes.body.suppressedRequestCount).toBeGreaterThanOrEqual(1);
      expect(
        (staffEvidenceRes.body.governmentRequests as Array<{ id: string }>).some(
          (r) => r.id === nonDisclosureRequestId,
        ),
      ).toBe(false);

      const suppressionEvents = await prisma.auditEvent.findMany({
        where: {
          organizationId: orgA.organizationId,
          action: "NON_DISCLOSURE_SUPPRESSION_APPLIED",
          resourceId: nonDisclosureRequestId,
        },
      });
      expect(suppressionEvents.length).toBeGreaterThan(0);
      for (const event of suppressionEvents) {
        expect((event.metadata as Record<string, unknown>)["authorisationRef"]).toBe(
          NON_DISCLOSURE_AUTH_REF,
        );
      }
    });
  });

  describe("D9 (HTTP half): neither principal-facing access-report route leaks the withheld-record note", () => {
    let principalToken: string;
    let requestsEmployee: OrgWithEmployee;
    let requestReference: string;

    beforeAll(async () => {
      const email = `nondisclosure-principal-${randomUUID()}@example.test`;
      await prisma.principalAccount.create({
        data: {
          organizationId: orgA.organizationId,
          dataPrincipalId: principal2Id,
          email,
          passwordHash: await argon2.hash("CorrectHorseBattery9!", {
            type: argon2.argon2id,
          }),
          status: "ACTIVE",
        },
      });
      const loginRes = await request(app.getHttpServer())
        .post("/api/auth/principal/login")
        .send({ email, password: "CorrectHorseBattery9!" });
      expect(loginRes.status).toBe(200);
      principalToken = loginRes.body.accessToken as string;

      // `GET /api/requests/:ref/access-report.pdf` is the staff-facing
      // route: an employee handling her rights request, gated on
      // CAN_MANAGE_REQUESTS (a separate permission from every other
      // employee fixture in this file, which is deliberately EVID_FULL /
      // EVID_LIMITED, neither of which carries it).
      requestsEmployee = await addEmployee(orgA.organizationId, "EVID_REQUESTS", [
        "CAN_MANAGE_REQUESTS",
      ]);
      const principalRequest = await prisma.principalRequest.create({
        data: {
          organizationId: orgA.organizationId,
          reference: `REQ-${randomUUID()}`,
          dataPrincipalId: principal2Id,
          type: "ACCESS",
          subject: "Access request",
          body: "Please provide my s.11 access report.",
        },
      });
      requestReference = principalRequest.reference;
    });

    it("GET /api/me/access-report.pdf (her own copy) says nothing about the withheld record", async () => {
      const res = await bufferBinaryResponse(
        request(app.getHttpServer())
          .get("/api/me/access-report.pdf")
          .set("Authorization", `Bearer ${principalToken}`),
      );
      expect(res.status).toBe(200);
      const text = extractPdfText(Buffer.from(res.body as Buffer));
      expect(text).not.toContain("withheld");
      expect(text).not.toContain("non-disclosure direction");
      expect(text).not.toContain("suppressed");
    });

    /**
     * D9 crux: `MeController.accessReport()` and
     * `RequestsController.accessReport()` both call
     * `AccessReportService.buildReport()` and then the exact same
     * `renderAccessReportPdf()` -- one renderer, reachable from both a
     * principal-audience token and an employee-audience token with
     * CAN_MANAGE_REQUESTS. This is the same document either way, so this
     * staff route must be exactly as silent about the suppression as her
     * own copy above -- the fix could not have been "only the /me route"
     * without leaving this one leaking.
     */
    it("GET /api/requests/:ref/access-report.pdf (the employee's copy of the SAME document) is equally silent", async () => {
      const res = await bufferBinaryResponse(
        request(app.getHttpServer())
          .get(`/api/requests/${requestReference}/access-report.pdf`)
          .set("Authorization", `Bearer ${requestsEmployee.accessToken}`),
      );
      expect(res.status).toBe(200);
      const text = extractPdfText(Buffer.from(res.body as Buffer));
      expect(text).not.toContain("withheld");
      expect(text).not.toContain("non-disclosure direction");
      expect(text).not.toContain("suppressed");
    });
  });

  describe("GET /api/principals/:id/evidence[.pdf]", () => {
    it("returns the EV-03 evidence file shape as JSON", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/principals/${principal1Id}/evidence`)
        .set("Authorization", `Bearer ${orgA.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("consentEvents");
      expect(res.body).toHaveProperty("noticeVersionsShown");
      expect(res.body).toHaveProperty("requests");
      expect(res.body).toHaveProperty("messagesReceived");
      expect(res.body).toHaveProperty("breachInclusions");
      expect(Array.isArray(res.body.consentEvents)).toBe(true);
      expect(res.body.consentEvents.length).toBeGreaterThan(0);
    });

    it("returns a PDF for the same principal", async () => {
      const res = await bufferBinaryResponse(
        request(app.getHttpServer())
          .get(`/api/principals/${principal1Id}/evidence.pdf`)
          .set("Authorization", `Bearer ${orgA.accessToken}`),
      );
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(Buffer.from(res.body as Buffer).slice(0, 4).toString()).toBe("%PDF");
    });
  });

  describe("Check 31: the evidence pack contains all eleven artefacts", () => {
    it("bundles EV-01,02,04-12, each carrying the organisation name and a generation timestamp", async () => {
      const before = new Date(Date.now() - 5000);
      const res = await bufferBinaryResponse(
        request(app.getHttpServer())
          .get("/api/evidence/pack.zip")
          .set("Authorization", `Bearer ${orgA.accessToken}`),
      );
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/zip");
      const after = new Date(Date.now() + 5000);

      const entries = parseStoreZip(Buffer.from(res.body as Buffer));
      const expectedNames = [
        "EV-01-data-inventory.csv",
        "EV-02-record-of-processing-activities.csv",
        "EV-04-consent-ledger.csv",
        "EV-05-rights-request-register.csv",
        "EV-06-grievance-response-time-report.csv",
        "EV-07-breach-file.csv",
        "EV-08-access-log.csv",
        "EV-09-processor-and-sharing-register.csv",
        "EV-10-retention-schedule.csv",
        "EV-11-dpia-and-audit-records.csv",
        "EV-12-immutable-audit-log.csv",
      ];
      expect(entries.map((e) => e.name).sort()).toEqual([...expectedNames].sort());
      expect(entries.length).toBe(11);

      for (const entry of entries) {
        const text = entry.content.toString("utf8");
        expect(text).toContain("E2E Harness Org");
        const match = /Generated at,"?([^\r\n,"]+)"?/.exec(text);
        expect(match).not.toBeNull();
        const generatedAt = new Date(match![1] as string);
        expect(generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });
  });

  describe("Check 30: audit chain verification", () => {
    it("reports the chain valid, then names the first sequence corrupted after a simulated tamper, restoring the trigger even on failure", async () => {
      const validRes = await request(app.getHttpServer())
        .get("/api/audit-events/verify-chain")
        .set("Authorization", `Bearer ${orgA.accessToken}`);
      expect(validRes.status).toBe(200);
      expect(validRes.body.valid).toBe(true);
      expect(validRes.body.firstBrokenSequence).toBeNull();

      const events = await prisma.auditEvent.findMany({
        where: { organizationId: orgA.organizationId },
        orderBy: { sequence: "asc" },
      });
      expect(events.length).toBeGreaterThan(0);
      const target = events[Math.floor(events.length / 2)]!;

      let triggerDisabled = false;
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "AuditEvent" DISABLE TRIGGER audit_no_update`,
        );
        triggerDisabled = true;
        await prisma.$executeRawUnsafe(
          `UPDATE "AuditEvent" SET metadata = $1::jsonb WHERE id = $2`,
          JSON.stringify({ tampered: true }),
          target.id,
        );
      } finally {
        if (triggerDisabled) {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "AuditEvent" ENABLE TRIGGER audit_no_update`,
          );
        }
      }

      const brokenRes = await request(app.getHttpServer())
        .get("/api/audit-events/verify-chain")
        .set("Authorization", `Bearer ${orgA.accessToken}`);
      expect(brokenRes.status).toBe(200);
      expect(brokenRes.body.valid).toBe(false);
      expect(brokenRes.body.firstBrokenSequence).toBe(target.sequence.toString());
    });
  });

  describe("GET /api/audit-events/export.csv", () => {
    it("exports the full hash-chained log as CSV", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/audit-events/export.csv")
        .set("Authorization", `Bearer ${orgA.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.text.split("\r\n")[0]).toContain("Sequence");
      expect(res.text).toContain("Hash");
    });
  });

  describe("permissions: 403 without the right permission, with a positive control on the same route", () => {
    const cases: Array<{ name: string; path: () => string }> = [
      { name: "verify-chain", path: () => "/api/audit-events/verify-chain" },
      { name: "export.csv", path: () => "/api/audit-events/export.csv" },
      { name: "principal evidence json", path: () => `/api/principals/${principal1Id}/evidence` },
      { name: "principal evidence pdf", path: () => `/api/principals/${principal1Id}/evidence.pdf` },
      { name: "pack.zip", path: () => "/api/evidence/pack.zip" },
    ];

    it.each(cases)("$name: denies the limited role and allows the full role", async ({ path }) => {
      const denied = await request(app.getHttpServer())
        .get(path())
        .set("Authorization", `Bearer ${orgALimited.accessToken}`);
      expect(denied.status).toBe(403);

      const allowed = await request(app.getHttpServer())
        .get(path())
        .set("Authorization", `Bearer ${orgA.accessToken}`);
      expect(allowed.status).toBe(200);
    });
  });
});

/**
 * Minimal reader for the STORE-only (uncompressed) zip format
 * `src/modules/evidence/zip-writer.ts` writes -- reads local file headers
 * sequentially until the central-directory signature, mirroring exactly
 * the layout that writer produces. No zip library is installed in this
 * backend (the writer's own doc comment: "no ZIP library is installed
 * ... and none is being added for one archive endpoint") -- same ruling
 * applies to reading it back in this test.
 */
/**
 * D9 regression guard: `pdfkit` (default `compress: true`, unchanged by
 * `renderPdf` in `pdf-utils.ts`) FlateDecode-compresses every content
 * stream, so a rendered PDF's text is not readable by scanning the raw
 * bytes -- it has to be pulled back out of the `stream ... endstream`
 * blocks. This walks every such block, inflates it, and concatenates
 * whatever decodes successfully (non-content streams, e.g. the font
 * descriptor, simply fail to `JSON`-adjacent-parse as text and are
 * skipped -- ok, since the assertions below only need to prove a phrase
 * is ABSENT from the whole document).
 */
function extractPdfText(buffer: Buffer): string {
  const streamMarker = Buffer.from("stream");
  const endMarker = Buffer.from("endstream");
  let text = "";
  let offset = 0;
  for (;;) {
    const start = buffer.indexOf(streamMarker, offset);
    if (start === -1) break;
    let dataStart = start + streamMarker.length;
    if (buffer[dataStart] === 0x0d) dataStart += 1;
    if (buffer[dataStart] === 0x0a) dataStart += 1;
    const end = buffer.indexOf(endMarker, dataStart);
    if (end === -1) break;
    const raw = buffer.subarray(dataStart, end);
    try {
      text += inflateSync(raw).toString("latin1");
    } catch {
      // Not a (validly-aligned) flate stream -- skip it.
    }
    offset = end + endMarker.length;
  }
  return text;
}

function parseStoreZip(buffer: Buffer): Array<{ name: string; content: Buffer }> {
  const entries: Array<{ name: string; content: Buffer }> = [];
  let offset = 0;
  const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
  while (
    offset + 4 <= buffer.length &&
    buffer.readUInt32LE(offset) === LOCAL_FILE_HEADER_SIGNATURE
  ) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const content = buffer.subarray(contentStart, contentStart + compressedSize);
    entries.push({ name, content });
    offset = contentStart + compressedSize;
  }
  return entries;
}
