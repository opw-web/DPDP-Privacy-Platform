import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
} from "./support/e2e-harness";

/**
 * Task 7 e2e coverage per the task brief:
 *
 *   Check 7 (the whole test), four steps, each its own case:
 *     1. Publish with no itemised fields -> fails, naming what is missing.
 *     2. Publish with fields but a purpose lacking
 *        goodsOrServicesDescription -> fails, naming the incomplete
 *        purpose.
 *     3. Publish with only two of the three Rule 3(c) links -> fails,
 *        naming the missing link.
 *     4. Publish a valid notice -> succeeds and gets a contentHash; then
 *        an attempt to edit its body raises "Published notice versions
 *        are immutable" (the Wave 0 `notice_frozen` trigger).
 *
 *   Plus: a stored translation is served; a missing translation falls
 *   back to English with a visible note; 403 without CAN_MANAGE_NOTICES
 *   on the same route/payload that a positive control (a token that DOES
 *   hold the permission) succeeds on.
 *
 * Fixtures for the itemised data list (Rule 3(b)(i)) go through the REAL
 * `/api/data-sources`, `/api/purposes`, `/api/data-sources/:id/mappings`
 * and `/api/data-sources/:id/purposes` endpoints -- same convention as
 * `test/mappings.e2e-spec.ts` -- rather than writing MVP 1 rows directly,
 * so this spec exercises the actual DataSourcePurpose/SourceFieldMapping
 * join the notice builder reads.
 */
jest.setTimeout(120000);

describe("Notices (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const orgIds: string[] = [];

  const ADMIN_PERMISSIONS = [
    "CAN_MANAGE_NOTICES",
    "CAN_MANAGE_DATA_SOURCES",
    "CAN_MANAGE_PURPOSES",
  ] as const;

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    if (orgIds.length > 0) {
      // PrivacyNotice cascades to NoticeVersion and NoticeTranslation.
      await prisma.privacyNotice.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      // DataSource cascades to SourceFieldMapping, DataSourceField and
      // DataSourcePurpose.
      await prisma.dataSource.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.processingPurpose.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  async function createAdmin() {
    const org = await createOrgWithEmployee(
      app,
      prisma,
      "NOTICE_ADMIN",
      ADMIN_PERMISSIONS,
    );
    orgIds.push(org.organizationId);
    return org;
  }

  async function createPurpose(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; name: string }> {
    const payload = {
      code: `PURPOSE_${randomUUID()}`,
      name: `Order Fulfilment ${randomUUID()}`,
      description: "Fulfil customer orders placed on the storefront.",
      lawfulBasis: "CONSENT",
      basisJustification: "Customer opts in at checkout.",
      dataCategories: ["CONTACT"],
      ...overrides,
    };
    const res = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    if (res.status !== 201) {
      throw new Error(`Fixture purpose creation failed: ${JSON.stringify(res.body)}`);
    }
    return { id: res.body.id as string, name: res.body.name as string };
  }

  async function completePurpose(accessToken: string, purposeId: string): Promise<void> {
    const res = await request(app.getHttpServer())
      .patch(`/api/purposes/${purposeId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ goodsOrServicesDescription: "Delivery of purchased goods to the customer." });
    if (res.status !== 200) {
      throw new Error(`Fixture purpose completion failed: ${JSON.stringify(res.body)}`);
    }
  }

  async function createDataSource(accessToken: string): Promise<string> {
    const payload = {
      name: `Source ${randomUUID()}`,
      systemType: "REST_TEST_SYSTEM",
      baseUrl: "http://127.0.0.1:1/records",
      recordsPath: "data",
      externalIdField: "id",
      authType: "BEARER",
      credential: "super-secret-token-ABCD",
    };
    const res = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    if (res.status !== 201) {
      throw new Error(`Fixture data source creation failed: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  async function attachPurposeAndMapping(
    accessToken: string,
    dataSourceId: string,
    purposeId: string,
  ): Promise<string> {
    const purposesRes = await request(app.getHttpServer())
      .put(`/api/data-sources/${dataSourceId}/purposes`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ purposeIds: [purposeId] });
    if (purposesRes.status !== 200) {
      throw new Error(`Fixture attach-purpose failed: ${JSON.stringify(purposesRes.body)}`);
    }

    const mappingsRes = await request(app.getHttpServer())
      .put(`/api/data-sources/${dataSourceId}/mappings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mappings: [
          {
            sourceField: "email",
            canonicalField: "EMAIL",
            dataCategory: "CONTACT",
            containsPersonalData: true,
          },
        ],
      });
    if (mappingsRes.status !== 200) {
      throw new Error(`Fixture mapping creation failed: ${JSON.stringify(mappingsRes.body)}`);
    }
    return mappingsRes.body.mappings[0].id as string;
  }

  async function createNotice(
    accessToken: string,
    purposeIds: string[],
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/api/notices")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: `NOTICE_${randomUUID()}`, name: "Account Signup Notice", purposeIds });
    if (res.status !== 201) {
      throw new Error(`Fixture notice creation failed: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  /** A fresh org + admin + purpose + data source + mapping + notice, ready to build versions on. */
  async function setupFixture() {
    const admin = await createAdmin();
    const purpose = await createPurpose(admin.accessToken);
    const dataSourceId = await createDataSource(admin.accessToken);
    const mappingId = await attachPurposeAndMapping(
      admin.accessToken,
      dataSourceId,
      purpose.id,
    );
    const noticeId = await createNotice(admin.accessToken, [purpose.id]);
    return { admin, purpose, dataSourceId, mappingId, noticeId };
  }

  const ALL_LINKS = {
    withdrawalUrl: "https://example.com/withdraw",
    rightsUrl: "https://example.com/rights",
    boardComplaintUrl: "https://example.com/board-complaint",
  };

  describe("Check 7.1: publish with no itemised fields fails, naming what is missing", () => {
    it("400s and names the itemised data list", async () => {
      const { admin, noticeId } = await setupFixture();

      const versionRes = await request(app.getHttpServer())
        .post(`/api/notices/${noticeId}/versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ bodyMarkdown: "We collect your data to fulfil orders.", ...ALL_LINKS });
      expect(versionRes.status).toBe(201);
      const version = versionRes.body.version as number;

      const publishRes = await request(app.getHttpServer())
        .post(`/api/notices/${noticeId}/versions/${version}/publish`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send();

      expect(publishRes.status).toBe(400);
      expect(publishRes.body.message).toMatch(/itemised personal data list is empty/i);
      expect(publishRes.body.message).toMatch(/3\(b\)\(i\)/);
    });
  });

  describe("Check 7.2: publish with an incomplete purpose fails, naming it", () => {
    it("400s and names the purpose missing goodsOrServicesDescription", async () => {
      const { admin, purpose, mappingId, noticeId } = await setupFixture();
      // Deliberately do NOT complete the purpose here.

      const versionRes = await request(app.getHttpServer())
        .post(`/api/notices/${noticeId}/versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          bodyMarkdown: "We collect your data to fulfil orders.",
          itemisedDataFields: [{ sourceFieldMappingId: mappingId }],
          ...ALL_LINKS,
        });
      expect(versionRes.status).toBe(201);
      const version = versionRes.body.version as number;

      const publishRes = await request(app.getHttpServer())
        .post(`/api/notices/${noticeId}/versions/${version}/publish`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send();

      expect(publishRes.status).toBe(400);
      expect(publishRes.body.message).toMatch(/goods\/services description/i);
      expect(publishRes.body.message).toContain(purpose.name);
      expect(publishRes.body.message).toMatch(/3\(b\)\(ii\)/);
    });
  });

  describe("Check 7.3: publish with only two of three Rule 3(c) links fails, naming the missing one", () => {
    it("400s and names boardComplaintUrl when it is the one omitted", async () => {
      const { admin, purpose, mappingId, noticeId } = await setupFixture();
      await completePurpose(admin.accessToken, purpose.id);

      const versionRes = await request(app.getHttpServer())
        .post(`/api/notices/${noticeId}/versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          bodyMarkdown: "We collect your data to fulfil orders.",
          itemisedDataFields: [{ sourceFieldMappingId: mappingId }],
          withdrawalUrl: ALL_LINKS.withdrawalUrl,
          rightsUrl: ALL_LINKS.rightsUrl,
          // boardComplaintUrl deliberately omitted
        });
      expect(versionRes.status).toBe(201);
      const version = versionRes.body.version as number;

      const publishRes = await request(app.getHttpServer())
        .post(`/api/notices/${noticeId}/versions/${version}/publish`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send();

      expect(publishRes.status).toBe(400);
      expect(publishRes.body.message).toContain("boardComplaintUrl");
      expect(publishRes.body.message).not.toContain("withdrawalUrl");
      expect(publishRes.body.message).not.toContain("rightsUrl");
      expect(publishRes.body.message).toMatch(/3\(c\)/);
    });
  });

  describe("Check 7.4: a valid publish succeeds with a contentHash, then a raw edit is refused as immutable", () => {
    it("publishes successfully and then rejects a direct bodyMarkdown edit", async () => {
      const { admin, purpose, mappingId, noticeId } = await setupFixture();
      await completePurpose(admin.accessToken, purpose.id);

      const versionRes = await request(app.getHttpServer())
        .post(`/api/notices/${noticeId}/versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          bodyMarkdown: "We collect your data to fulfil orders.",
          itemisedDataFields: [{ sourceFieldMappingId: mappingId, label: "Email address" }],
          ...ALL_LINKS,
        });
      expect(versionRes.status).toBe(201);
      const version = versionRes.body.version as number;

      const publishRes = await request(app.getHttpServer())
        .post(`/api/notices/${noticeId}/versions/${version}/publish`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send();

      expect(publishRes.status).toBe(201);
      expect(typeof publishRes.body.contentHash).toBe("string");
      expect(publishRes.body.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(publishRes.body.publishedAt).toBeTruthy();

      const noticeVersionId = publishRes.body.id as string;

      // Direct, raw attempt to mutate a published version's body -- the
      // Wave 0 `notice_frozen` trigger must refuse this regardless of
      // which layer of the app is doing the writing.
      await expect(
        prisma.noticeVersion.update({
          where: { id: noticeVersionId },
          data: { bodyMarkdown: "Tampered body." },
        }),
      ).rejects.toThrow(/Published notice versions are immutable/);

      // The published version is discoverable as THE published version
      // for this notice -- the lookup a CONSENT_REQUEST campaign needs.
      const detailRes = await request(app.getHttpServer())
        .get(`/api/notices/${noticeId}`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.status).toBe("PUBLISHED");
      expect(detailRes.body.currentVersionId).toBe(noticeVersionId);
    });
  });

  describe("Translations", () => {
    it("stores and serves a translation, and falls back to English with a visible note when missing", async () => {
      const { admin, purpose, mappingId, noticeId } = await setupFixture();
      await completePurpose(admin.accessToken, purpose.id);

      const versionRes = await request(app.getHttpServer())
        .post(`/api/notices/${noticeId}/versions`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          bodyMarkdown: "We collect your data to fulfil orders.",
          itemisedDataFields: [{ sourceFieldMappingId: mappingId }],
          ...ALL_LINKS,
        });
      const version = versionRes.body.version as number;

      const translationRes = await request(app.getHttpServer())
        .put(`/api/notices/${noticeId}/versions/${version}/translations/hi`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ bodyMarkdown: "हम आपका डेटा ऑर्डर पूरा करने के लिए एकत्र करते हैं।" });
      expect(translationRes.status).toBe(200);
      expect(translationRes.body.languageCode).toBe("hi");

      const hiPreview = await request(app.getHttpServer())
        .get(`/api/notices/${noticeId}/versions/${version}/preview?lang=hi`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(hiPreview.status).toBe(200);
      expect(hiPreview.body.languageCode).toBe("hi");
      expect(hiPreview.body.isFallback).toBe(false);
      expect(hiPreview.body.bodyMarkdown).toContain("एकत्र");

      // "ta" (Tamil) has no stored translation -- falls back to English
      // with a visible note, per NT-08.
      const taPreview = await request(app.getHttpServer())
        .get(`/api/notices/${noticeId}/versions/${version}/preview?lang=ta`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(taPreview.status).toBe(200);
      expect(taPreview.body.languageCode).toBe("en");
      expect(taPreview.body.isFallback).toBe(true);
      expect(typeof taPreview.body.fallbackNote).toBe("string");
      expect(taPreview.body.fallbackNote.length).toBeGreaterThan(0);
      expect(taPreview.body.bodyMarkdown).toBe(versionRes.body.bodyMarkdown);

      // The standalone preview with no language qualifier renders
      // exactly the body and nothing else (Rule 3(a)).
      const enPreview = await request(app.getHttpServer())
        .get(`/api/notices/${noticeId}/versions/${version}/preview`)
        .set("Authorization", `Bearer ${admin.accessToken}`);
      expect(enPreview.status).toBe(200);
      expect(Object.keys(enPreview.body).sort()).toEqual(
        ["bodyMarkdown", "isFallback", "languageCode"].sort(),
      );
    });
  });

  describe("Permission enforcement: CAN_MANAGE_NOTICES", () => {
    it("403s POST /api/notices without CAN_MANAGE_NOTICES, with a positive control on the same route and payload", async () => {
      const withoutPermission = await createOrgWithEmployee(
        app,
        prisma,
        "NO_NOTICES_ROLE",
        ["CAN_MANAGE_DATA_SOURCES"],
      );
      orgIds.push(withoutPermission.organizationId);
      const withPermission = await createOrgWithEmployee(
        app,
        prisma,
        "HAS_NOTICES_ROLE",
        ["CAN_MANAGE_NOTICES"],
      );
      orgIds.push(withPermission.organizationId);

      const payload = { code: `NOTICE_${randomUUID()}`, name: "Marketing Opt-in", purposeIds: [randomUUID()] };

      const forbidden = await request(app.getHttpServer())
        .post("/api/notices")
        .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
        .send(payload);
      expect(forbidden.status).toBe(403);

      // Positive control: an otherwise-identical request from an actor
      // who DOES hold the permission is NOT rejected by the guard (it
      // may still fail downstream on referential validity of purposeIds,
      // but never with a 403).
      const allowed = await request(app.getHttpServer())
        .post("/api/notices")
        .set("Authorization", `Bearer ${withPermission.accessToken}`)
        .send({ ...payload, code: `NOTICE_${randomUUID()}` });
      expect(allowed.status).not.toBe(403);
    });
  });
});
