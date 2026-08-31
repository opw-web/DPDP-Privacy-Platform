import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TenantContext, type TenantStore } from "../src/common/tenant/tenant-context";
import { ConsentBackfillService } from "../src/modules/consents/consent-backfill.service";
import { ConsentsService } from "../src/modules/consents/consents.service";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
} from "./support/e2e-harness";

/**
 * Task 10 (spec §4.3, CN-01…CN-11): consent records, evidenced events,
 * backfill and one-click withdrawal.
 *
 * Cleanup note: mirrors `test/mvp2-schema-constraints.e2e-spec.ts`'s
 * established convention -- a `DataPrincipal` row that ends up owning a
 * `ConsentEvent` is never force-deleted (`consent_event_no_delete` would
 * abort a cascade delete of its parent `ConsentRecord` anyway, and "a data
 * principal is never destroyed in this product" per that migration's own
 * rule). Neither `ConsentRecord`/`ConsentEvent`/`DataPrincipal`/
 * `ErasureTask`/`PrivacyNotice`/`NoticeVersion`/`GuardianRelationship`/
 * `PrincipalAccount` carry a real (Prisma-enforced) foreign key to
 * `Organization` -- only `organizationId` scalar columns -- so
 * `cleanupOrgs`'s plain `Organization` delete is never blocked by any test
 * fixture left behind here.
 */
describe("Consents API (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let consentBackfillService: ConsentBackfillService;
  let consentsService: ConsentsService;
  const orgIds: string[] = [];

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    consentBackfillService = app.get(ConsentBackfillService);
    consentsService = app.get(ConsentsService);
  });

  afterAll(async () => {
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  const authed = (token: string) => ({
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string, body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(url)
        .set("Authorization", `Bearer ${token}`)
        .send(body),
  });

  function systemStore(organizationId: string): TenantStore {
    return {
      organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: "test-harness",
    };
  }

  async function createPrincipal(
    organizationId: string,
    overrides: { ageStatus?: "ADULT" | "CHILD" | "GUARDIAN_REPRESENTED" | "UNKNOWN" } = {},
  ): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Consents Test Principal",
        ageStatus: overrides.ageStatus ?? "ADULT",
      },
    });
    return principal.id;
  }

  async function createConsentPurpose(organizationId: string): Promise<string> {
    const purpose = await prisma.processingPurpose.create({
      data: {
        organizationId,
        code: `CONSENT_PURPOSE_${randomUUID()}`,
        name: "Marketing emails",
        description: "Send marketing emails.",
        lawfulBasis: "CONSENT",
        basisJustification: "She opts in.",
        dataCategories: [],
        active: true,
      },
    });
    return purpose.id;
  }

  async function createLegitimateUsePurpose(organizationId: string): Promise<string> {
    const purpose = await prisma.processingPurpose.create({
      data: {
        organizationId,
        code: `LU_PURPOSE_${randomUUID()}`,
        name: "Fraud prevention",
        description: "Prevent fraud.",
        lawfulBasis: "LEGITIMATE_USE",
        legitimateUseLimb: "VOLUNTARY_PROVISION",
        basisJustification: "s.7 limb.",
        dataCategories: [],
        active: true,
      },
    });
    return purpose.id;
  }

  /** A PUBLISHED NoticeVersion, fields copied verbatim from
   * `test/mvp2-schema-constraints.e2e-spec.ts`'s own fixture for the same
   * model (this task does not own the notices module). */
  async function createPublishedNotice(
    organizationId: string,
  ): Promise<{ noticeId: string; noticeVersionId: string; contentHash: string }> {
    const notice = await prisma.privacyNotice.create({
      data: {
        organizationId,
        code: `NOTICE_${randomUUID()}`,
        name: "Marketing Notice",
      },
    });
    const contentHash = `hash-${randomUUID()}`;
    const version = await prisma.noticeVersion.create({
      data: {
        organizationId,
        noticeId: notice.id,
        version: 1,
        itemisedDataFields: [],
        purposeStatements: [],
        withdrawalUrl: "https://example.test/withdraw",
        rightsUrl: "https://example.test/rights",
        boardComplaintUrl: "https://example.test/board",
        bodyMarkdown: "Published notice body.",
        contentHash,
        publishedAt: new Date(),
        createdByEmployeeId: randomUUID(),
      },
    });
    await prisma.privacyNotice.update({
      where: { id: notice.id },
      data: { status: "PUBLISHED", currentVersionId: version.id },
    });
    return { noticeId: notice.id, noticeVersionId: version.id, contentHash };
  }

  async function principalPortalToken(
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

  // -------------------------------------------------------------------
  // Check 8: immediately after backfill, before anyone interacts --
  // every row UNKNOWN, zero DENIED.
  // -------------------------------------------------------------------

  describe("Check 8: consent-backfill", () => {
    it("creates UNKNOWN rows for every principal x CONSENT purpose, never DENIED", async () => {
      const { organizationId } = await createOrgWithEmployee(
        app,
        prisma,
        "CONSENTS_BACKFILL",
        ["CAN_MANAGE_CONSENTS"],
      );
      orgIds.push(organizationId);

      const purposeId = await createConsentPurpose(organizationId);
      const principal1 = await createPrincipal(organizationId);
      const principal2 = await createPrincipal(organizationId);

      const created = await TenantContext.run(systemStore(organizationId), () =>
        consentBackfillService.runForCurrentOrganization(),
      );
      expect(created).toBe(2);

      const records = await prisma.consentRecord.findMany({
        where: { organizationId, purposeId, dataPrincipalId: { in: [principal1, principal2] } },
      });
      expect(records).toHaveLength(2);
      for (const record of records) {
        expect(record.status).toBe("UNKNOWN");
      }
      const deniedCount = await prisma.consentRecord.count({
        where: { organizationId, status: "DENIED" },
      });
      expect(deniedCount).toBe(0);

      // Idempotent: a second sweep creates nothing further.
      const secondPass = await TenantContext.run(systemStore(organizationId), () =>
        consentBackfillService.runForCurrentOrganization(),
      );
      expect(secondPass).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Check 10: grant then withdraw -- two ConsentEvents with channel
  // PORTAL, notice version + content hash, IP + UA; UPDATE raises the
  // immutability exception.
  // -------------------------------------------------------------------

  describe("Check 10: grant then withdraw via the portal", () => {
    it("records two evidenced ConsentEvents and immutability holds", async () => {
      const { organizationId } = await createOrgWithEmployee(
        app,
        prisma,
        "CONSENTS_PORTAL",
        ["CAN_MANAGE_CONSENTS"],
      );
      orgIds.push(organizationId);

      const purposeId = await createConsentPurpose(organizationId);
      const dataPrincipalId = await createPrincipal(organizationId);
      const { noticeId, noticeVersionId, contentHash } =
        await createPublishedNotice(organizationId);
      const token = await principalPortalToken(organizationId, dataPrincipalId);

      const grantRes = await request(app.getHttpServer())
        .post(`/api/me/consents/${purposeId}`)
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", "Consents-E2E-Agent/1.0")
        .send({ status: "GRANTED", noticeId });
      expect(grantRes.status).toBe(201);
      expect(grantRes.body.status).toBe("GRANTED");
      expect(grantRes.body.noticeVersionId).toBe(noticeVersionId);
      expect(grantRes.body.noticeContentHash).toBe(contentHash);

      const withdrawRes = await request(app.getHttpServer())
        .post(`/api/me/consents/${purposeId}`)
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", "Consents-E2E-Agent/1.0")
        .send({ status: "WITHDRAWN" });
      expect(withdrawRes.status).toBe(201);
      expect(withdrawRes.body.status).toBe("WITHDRAWN");
      expect(withdrawRes.body.noticeVersionId).toBe(noticeVersionId);
      expect(withdrawRes.body.noticeContentHash).toBe(contentHash);

      const record = await prisma.consentRecord.findFirstOrThrow({
        where: { dataPrincipalId, purposeId },
      });
      const events = await prisma.consentEvent.findMany({
        where: { consentRecordId: record.id },
        orderBy: { createdAt: "asc" },
      });
      expect(events).toHaveLength(2);
      for (const event of events) {
        expect(event.channel).toBe("PORTAL");
        expect(event.noticeVersionId).toBe(noticeVersionId);
        expect(event.noticeContentHash).toBe(contentHash);
        const evidence = event.evidence as { ip?: string; userAgent?: string };
        expect(evidence.userAgent).toBe("Consents-E2E-Agent/1.0");
        expect(typeof evidence.ip).toBe("string");
        expect(evidence.ip).toBeTruthy();
      }
      const [firstEvent, secondEvent] = events;
      expect(firstEvent?.toStatus).toBe("GRANTED");
      expect(secondEvent?.toStatus).toBe("WITHDRAWN");

      // The Wave 0 immutability trigger applies to ConsentEvent too --
      // an UPDATE must raise.
      await expect(
        prisma.consentEvent.update({
          where: { id: firstEvent!.id },
          data: { actorLabel: "Tampered" },
        }),
      ).rejects.toThrow(/rows are immutable/);
    });
  });

  // -------------------------------------------------------------------
  // Check 11: a LEGITIMATE_USE purpose produces no consent row and never
  // appears in a consent audience filter.
  // -------------------------------------------------------------------

  describe("Check 11: LEGITIMATE_USE purposes never get consent rows", () => {
    it("backfill skips it, and every published interface refuses it", async () => {
      const { organizationId } = await createOrgWithEmployee(
        app,
        prisma,
        "CONSENTS_LB06",
        ["CAN_MANAGE_CONSENTS"],
      );
      orgIds.push(organizationId);

      const luPurposeId = await createLegitimateUsePurpose(organizationId);
      const dataPrincipalId = await createPrincipal(organizationId);

      await TenantContext.run(systemStore(organizationId), () =>
        consentBackfillService.runForCurrentOrganization(),
      );
      const rowCount = await prisma.consentRecord.count({
        where: { organizationId, purposeId: luPurposeId },
      });
      expect(rowCount).toBe(0);

      await TenantContext.run(systemStore(organizationId), () =>
        expect(consentsService.getConsentStatus(dataPrincipalId, luPurposeId)).rejects.toThrow(
          /LB-06/,
        ),
      );
      await TenantContext.run(systemStore(organizationId), () =>
        expect(consentsService.findGrantedPrincipalIds(luPurposeId)).rejects.toThrow(/LB-06/),
      );
      await TenantContext.run(systemStore(organizationId), () =>
        expect(consentsService.getConsentStats(luPurposeId)).rejects.toThrow(/LB-06/),
      );
    });
  });

  // -------------------------------------------------------------------
  // Check 13 (service half): a GRANTED consent for a CHILD without a
  // verified guardian is rejected (Rule 10).
  // -------------------------------------------------------------------

  describe("Check 13: CHILD consent requires a verified guardian", () => {
    it("rejects an imported GRANTED consent with no guardian named", async () => {
      const { organizationId, accessToken } = await createOrgWithEmployee(
        app,
        prisma,
        "CONSENTS_CH01",
        ["CAN_MANAGE_CONSENTS"],
      );
      orgIds.push(organizationId);

      const purposeId = await createConsentPurpose(organizationId);
      const dataPrincipalId = await createPrincipal(organizationId, { ageStatus: "CHILD" });
      const { noticeId } = await createPublishedNotice(organizationId);

      const res = await authed(accessToken).post(
        `/api/principals/${dataPrincipalId}/consents/${purposeId}`,
        { status: "GRANTED", channel: "IN_PERSON", noticeId },
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/Rule 10/);

      const record = await prisma.consentRecord.findFirst({
        where: { dataPrincipalId, purposeId },
      });
      // Never left DENIED, never left GRANTED -- either absent or UNKNOWN.
      if (record) {
        expect(record.status).toBe("UNKNOWN");
      }
    });

    it("accepts an imported GRANTED consent naming an active, verified guardian", async () => {
      const { organizationId, accessToken } = await createOrgWithEmployee(
        app,
        prisma,
        "CONSENTS_CH02",
        ["CAN_MANAGE_CONSENTS"],
      );
      orgIds.push(organizationId);

      const purposeId = await createConsentPurpose(organizationId);
      const dataPrincipalId = await createPrincipal(organizationId, { ageStatus: "CHILD" });
      const { noticeId } = await createPublishedNotice(organizationId);
      const guardian = await prisma.guardianRelationship.create({
        data: {
          organizationId,
          dataPrincipalId,
          kind: "PARENT_OF_CHILD",
          guardianName: "Verified Guardian",
          verification: "DIGITAL_LOCKER",
          active: true,
        },
      });

      const res = await authed(accessToken).post(
        `/api/principals/${dataPrincipalId}/consents/${purposeId}`,
        {
          status: "GRANTED",
          channel: "IN_PERSON",
          noticeId,
          givenByGuardianId: guardian.id,
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("GRANTED");
      expect(res.body.givenByGuardianId).toBe(guardian.id);
    });
  });

  // -------------------------------------------------------------------
  // Withdrawal creates exactly one ErasureTask; withdrawing twice does
  // not create a second.
  // -------------------------------------------------------------------

  describe("Withdrawal and the erasure task it triggers", () => {
    it("creates exactly one CONSENT_WITHDRAWN ErasureTask, even across two withdrawals", async () => {
      const { organizationId } = await createOrgWithEmployee(
        app,
        prisma,
        "CONSENTS_ERASURE",
        ["CAN_MANAGE_CONSENTS"],
      );
      orgIds.push(organizationId);

      const purposeId = await createConsentPurpose(organizationId);
      const dataPrincipalId = await createPrincipal(organizationId);
      const { noticeId } = await createPublishedNotice(organizationId);
      const token = await principalPortalToken(organizationId, dataPrincipalId);

      await request(app.getHttpServer())
        .post(`/api/me/consents/${purposeId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "GRANTED", noticeId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/me/consents/${purposeId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "WITHDRAWN" })
        .expect(201);

      // Idempotent no-op: withdrawing a second time changes nothing.
      await request(app.getHttpServer())
        .post(`/api/me/consents/${purposeId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "WITHDRAWN" })
        .expect(201);

      const tasks = await prisma.erasureTask.findMany({
        where: { dataPrincipalId, trigger: "CONSENT_WITHDRAWN" },
      });
      expect(tasks).toHaveLength(1);

      const events = await prisma.consentEvent.findMany({
        where: { record: { dataPrincipalId, purposeId } },
      });
      // GRANTED + WITHDRAWN only -- the second, no-op withdrawal appended
      // no third event.
      expect(events).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------
  // 403 without CAN_MANAGE_CONSENTS, with a positive control on the
  // same route and payload.
  // -------------------------------------------------------------------

  describe("Permission enforcement (each 403 carries a positive control)", () => {
    it("GET /api/principals/:id/consents: CAN_MANAGE_CONSENTS succeeds, no permission gets 403", async () => {
      const granted = await createOrgWithEmployee(app, prisma, "CONSENTS_PERM_OK", [
        "CAN_MANAGE_CONSENTS",
      ]);
      orgIds.push(granted.organizationId);
      const denied = await createOrgWithEmployee(app, prisma, "CONSENTS_PERM_NO", [
        "CAN_VIEW_AUDIT_LOG",
      ]);
      orgIds.push(denied.organizationId);

      const principalOk = await createPrincipal(granted.organizationId);
      const okRes = await authed(granted.accessToken).get(
        `/api/principals/${principalOk}/consents`,
      );
      expect(okRes.status).toBe(200);

      const principalDenied = await createPrincipal(denied.organizationId);
      const deniedRes = await authed(denied.accessToken).get(
        `/api/principals/${principalDenied}/consents`,
      );
      expect(deniedRes.status).toBe(403);
      expect(deniedRes.body.message).toContain("CAN_MANAGE_CONSENTS");
    });

    it("POST /api/principals/:id/consents/:purposeId: CAN_MANAGE_CONSENTS succeeds, no permission gets 403 on the identical payload", async () => {
      const granted = await createOrgWithEmployee(app, prisma, "CONSENTS_PERM_OK2", [
        "CAN_MANAGE_CONSENTS",
      ]);
      orgIds.push(granted.organizationId);
      const denied = await createOrgWithEmployee(app, prisma, "CONSENTS_PERM_NO2", [
        "CAN_VIEW_AUDIT_LOG",
      ]);
      orgIds.push(denied.organizationId);

      const purposeOk = await createConsentPurpose(granted.organizationId);
      const principalOk = await createPrincipal(granted.organizationId);
      const { noticeId: noticeOk } = await createPublishedNotice(granted.organizationId);
      const okRes = await authed(granted.accessToken).post(
        `/api/principals/${principalOk}/consents/${purposeOk}`,
        { status: "GRANTED", channel: "IN_PERSON", noticeId: noticeOk },
      );
      expect(okRes.status).toBe(201);

      const purposeDenied = await createConsentPurpose(denied.organizationId);
      const principalDenied = await createPrincipal(denied.organizationId);
      const { noticeId: noticeDenied } = await createPublishedNotice(denied.organizationId);
      const deniedRes = await authed(denied.accessToken).post(
        `/api/principals/${principalDenied}/consents/${purposeDenied}`,
        { status: "GRANTED", channel: "IN_PERSON", noticeId: noticeDenied },
      );
      expect(deniedRes.status).toBe(403);
      expect(deniedRes.body.message).toContain("CAN_MANAGE_CONSENTS");
    });
  });
});
