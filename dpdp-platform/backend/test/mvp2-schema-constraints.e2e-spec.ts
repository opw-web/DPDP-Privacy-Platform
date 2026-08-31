import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
  waitUntil,
} from "./support/e2e-harness";

/**
 * Proves, against a real Postgres database, the five triggers and one
 * CHECK constraint carried by the hand-written second MVP 2 migration
 * (`prisma/migrations/20260831080000_mvp2_immutability_triggers_and_erasure_floor`,
 * transcribed from DPDP_MVP2_COMPLIANCE_OPERATIONS.md §2.3) -- one
 * required test case per guarantee, matching the style
 * `test/schema-constraints.e2e-spec.ts` already established for MVP 1's
 * own raw-SQL constraints.
 *
 * `consent_event_no_update`, `consent_event_no_delete` and
 * `request_event_no_update` all reuse MVP 1's `audit_is_immutable()`
 * trigger function verbatim (per the task brief: "reuse that existing
 * function; do not redefine it"). That function's RAISE EXCEPTION message
 * is hardcoded to say "AuditEvent rows are immutable ..." regardless of
 * which table's trigger actually fired -- so the assertions below on
 * ConsentEvent/RequestEvent deliberately match that literal (misleading
 * but spec-correct) message rather than inventing a table-specific one.
 *
 * This talks to the raw (unscoped) `PrismaService` from
 * `bootstrapTestApp()` directly for every constraint fixture -- these are
 * database-level guarantees, not application/tenant-extension behaviour --
 * while ALSO using the full harness (`createOrgWithEmployee`,
 * `cleanupOrgs`, `waitUntil`) in its own dedicated block below, to prove
 * `test/support/e2e-harness.ts` actually works end to end.
 */
describe("MVP 2 schema constraints and triggers (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // DataPrincipal fixtures for the sections below that now need a real
  // backing row (`prisma/migrations/20260831090000_mvp2_principal_relations`
  // added real FKs from ConsentRecord/PrincipalRequest/CampaignRecipient/
  // ErasureTask to DataPrincipal). Two buckets:
  //  - principalIds: cleaned up in afterAll below, in FK-safe order.
  //  - principalIdsWithConsentEvidence: backs a ConsentRecord that owns a
  //    ConsentEvent, and ConsentEvent is delete-protected by the
  //    consent_event_no_delete trigger (see migration
  //    20260831080000_mvp2_immutability_triggers_and_erasure_floor). A
  //    cascade delete of that ConsentRecord would fire that trigger and
  //    abort, so — same as the four pre-existing orphaned ConsentRecord
  //    rows the principal_relations migration already accepts as permanent,
  //    and per that migration's own "a data principal is never destroyed in
  //    this product" rule — these DataPrincipal rows are intentionally left
  //    in place rather than force-deleted.
  const principalIds: string[] = [];
  const principalIdsWithConsentEvidence: string[] = [];

  async function createPrincipal(organizationId: string): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Constraint Test Principal",
      },
    });
    return principal.id;
  }

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    if (principalIds.length) {
      // Children first (all reference DataPrincipal with ON DELETE
      // RESTRICT and none of them are delete-protected), then the
      // DataPrincipal rows themselves. principalRequest.deleteMany also
      // cascades its RequestEvent children at the DB level (RequestEvent
      // only carries a no-*update* trigger, so that cascade delete is not
      // blocked the way ConsentEvent's would be).
      await prisma.campaignRecipient.deleteMany({
        where: { dataPrincipalId: { in: principalIds } },
      });
      await prisma.erasureTask.deleteMany({
        where: { dataPrincipalId: { in: principalIds } },
      });
      await prisma.principalRequest.deleteMany({
        where: { dataPrincipalId: { in: principalIds } },
      });
      await prisma.dataPrincipal.deleteMany({
        where: { id: { in: principalIds } },
      });
    }
    await app.close();
    await prisma.$disconnect();
  });

  describe("test/support/e2e-harness.ts sanity check", () => {
    const orgIds: string[] = [];

    afterAll(async () => {
      await cleanupOrgs(prisma, orgIds);
    });

    it("bootstraps a real app, mints a working access token via createOrgWithEmployee, and cleanupOrgs removes it afterwards", async () => {
      const org = await createOrgWithEmployee(app, prisma, "HARNESS_SANITY", [
        "CAN_MANAGE_EMPLOYEES",
      ]);
      orgIds.push(org.organizationId);

      // waitUntil: the row is visible immediately here, but this proves
      // the exported helper actually polls-and-resolves rather than just
      // type-checking.
      await waitUntil(async () => {
        const found = await prisma.organization.findUnique({
          where: { id: org.organizationId },
        });
        return found !== null;
      }, 2000);

      const res = await request(app.getHttpServer())
        .get("/api/employees")
        .set("Authorization", `Bearer ${org.accessToken}`);
      expect(res.status).toBe(200);

      await cleanupOrgs(prisma, [org.organizationId]);
      const afterCleanup = await prisma.organization.findUnique({
        where: { id: org.organizationId },
      });
      expect(afterCleanup).toBeNull();

      // Already cleaned up above -- afterAll's cleanupOrgs on this id is a
      // harmless no-op (deleteMany/executeRaw on ids that no longer match).
    });
  });

  describe("(a) a published NoticeVersion's bodyMarkdown cannot be edited (notice_frozen)", () => {
    it("rejects UPDATE of bodyMarkdown once publishedAt is set", async () => {
      const organizationId = randomUUID();
      const notice = await prisma.privacyNotice.create({
        data: {
          organizationId,
          code: `NOTICE_${randomUUID()}`,
          name: "Account Signup Notice",
        },
      });
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
          bodyMarkdown: "Original published body",
          contentHash: "hash-original",
          publishedAt: new Date(),
          createdByEmployeeId: randomUUID(),
        },
      });

      await expect(
        prisma.noticeVersion.update({
          where: { id: version.id },
          data: { bodyMarkdown: "Tampered body" },
        }),
      ).rejects.toThrow(/Published notice versions are immutable/);
    });

    it("allows updating an unpublished (draft) NoticeVersion", async () => {
      const organizationId = randomUUID();
      const notice = await prisma.privacyNotice.create({
        data: {
          organizationId,
          code: `NOTICE_${randomUUID()}`,
          name: "Draft Notice",
        },
      });
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
          bodyMarkdown: "Draft body",
          contentHash: "hash-draft",
          createdByEmployeeId: randomUUID(),
        },
      });

      const updated = await prisma.noticeVersion.update({
        where: { id: version.id },
        data: { bodyMarkdown: "Edited draft body" },
      });
      expect(updated.bodyMarkdown).toBe("Edited draft body");
    });
  });

  describe("(b) a ConsentEvent cannot be UPDATEd (consent_event_no_update, reusing audit_is_immutable())", () => {
    it("rejects UPDATE", async () => {
      const organizationId = randomUUID();
      const dataPrincipalId = await createPrincipal(organizationId);
      principalIdsWithConsentEvidence.push(dataPrincipalId);
      const record = await prisma.consentRecord.create({
        data: {
          organizationId,
          dataPrincipalId,
          purposeId: randomUUID(),
        },
      });
      const event = await prisma.consentEvent.create({
        data: {
          organizationId,
          consentRecordId: record.id,
          toStatus: "GRANTED",
          channel: "PORTAL",
          actorType: "PRINCIPAL",
          actorLabel: "Test Principal",
        },
      });

      await expect(
        prisma.consentEvent.update({
          where: { id: event.id },
          data: { actorLabel: "Tampered" },
        }),
      ).rejects.toThrow(/rows are immutable/);
    });
  });

  describe("(c) a ConsentEvent cannot be DELETEd (consent_event_no_delete, reusing audit_is_immutable())", () => {
    it("rejects DELETE", async () => {
      const organizationId = randomUUID();
      const dataPrincipalId = await createPrincipal(organizationId);
      principalIdsWithConsentEvidence.push(dataPrincipalId);
      const record = await prisma.consentRecord.create({
        data: {
          organizationId,
          dataPrincipalId,
          purposeId: randomUUID(),
        },
      });
      const event = await prisma.consentEvent.create({
        data: {
          organizationId,
          consentRecordId: record.id,
          toStatus: "GRANTED",
          channel: "PORTAL",
          actorType: "PRINCIPAL",
          actorLabel: "Test Principal",
        },
      });

      await expect(
        prisma.consentEvent.delete({ where: { id: event.id } }),
      ).rejects.toThrow(/rows are immutable/);
    });
  });

  describe("(d) a RequestEvent cannot be UPDATEd (request_event_no_update, reusing audit_is_immutable())", () => {
    it("rejects UPDATE", async () => {
      const organizationId = randomUUID();
      const dataPrincipalId = await createPrincipal(organizationId);
      principalIds.push(dataPrincipalId);
      const principalRequest = await prisma.principalRequest.create({
        data: {
          organizationId,
          reference: `REQ-${randomUUID()}`,
          dataPrincipalId,
          type: "ACCESS",
          subject: "Access request",
          body: "Please provide my data.",
        },
      });
      const event = await prisma.requestEvent.create({
        data: {
          organizationId,
          requestId: principalRequest.id,
          toStatus: "SUBMITTED",
          actorType: "PRINCIPAL",
          actorLabel: "Test Principal",
        },
      });

      await expect(
        prisma.requestEvent.update({
          where: { id: event.id },
          data: { note: "Tampered" },
        }),
      ).rejects.toThrow(/rows are immutable/);
    });
  });

  describe("(e) a DELIVERED CampaignRecipient's renderedBody cannot change (recipient_frozen)", () => {
    it("rejects UPDATE of renderedBody once status is DELIVERED", async () => {
      const organizationId = randomUUID();
      const campaign = await prisma.messageCampaign.create({
        data: {
          organizationId,
          reference: `CMP-${randomUUID()}`,
          name: "Marketing Blast",
          category: "MARKETING",
          subject: "Hello",
          bodyMarkdown: "Body",
          audienceFilter: {},
          createdByEmployeeId: randomUUID(),
        },
      });
      const dataPrincipalId = await createPrincipal(organizationId);
      principalIds.push(dataPrincipalId);
      const recipient = await prisma.campaignRecipient.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          dataPrincipalId,
          channel: "EMAIL",
          status: "DELIVERED",
          renderedBody: "Original rendered content",
        },
      });

      await expect(
        prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { renderedBody: "Tampered content" },
        }),
      ).rejects.toThrow(/Delivered message content is immutable/);
    });

    it("allows updating renderedBody while status is still PENDING", async () => {
      const organizationId = randomUUID();
      const campaign = await prisma.messageCampaign.create({
        data: {
          organizationId,
          reference: `CMP-${randomUUID()}`,
          name: "Marketing Blast Draft",
          category: "MARKETING",
          subject: "Hello",
          bodyMarkdown: "Body",
          audienceFilter: {},
          createdByEmployeeId: randomUUID(),
        },
      });
      const dataPrincipalId = await createPrincipal(organizationId);
      principalIds.push(dataPrincipalId);
      const recipient = await prisma.campaignRecipient.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          dataPrincipalId,
          channel: "EMAIL",
          status: "PENDING",
          renderedBody: "Draft content",
        },
      });

      const updated = await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { renderedBody: "Revised draft content" },
      });
      expect(updated.renderedBody).toBe("Revised draft content");
    });
  });

  describe("(f) erasure_respects_floor CHECK constraint", () => {
    it("rejects an ErasureTask with erasureDueAt earlier than retentionFloorUntil", async () => {
      const organizationId = randomUUID();
      const retentionFloorUntil = new Date("2027-01-01T00:00:00Z");
      const erasureDueAt = new Date("2026-06-01T00:00:00Z"); // before the floor

      await expect(
        prisma.erasureTask.create({
          data: {
            organizationId,
            dataPrincipalId: randomUUID(),
            trigger: "CONSENT_WITHDRAWN",
            retentionFloorUntil,
            erasureDueAt,
          },
        }),
      ).rejects.toThrow(/erasure_respects_floor/);
    });

    it("allows an ErasureTask with erasureDueAt at or after retentionFloorUntil", async () => {
      const organizationId = randomUUID();
      const retentionFloorUntil = new Date("2027-01-01T00:00:00Z");
      const erasureDueAt = new Date("2027-01-01T00:00:00Z"); // exactly at the floor
      const dataPrincipalId = await createPrincipal(organizationId);
      principalIds.push(dataPrincipalId);

      const task = await prisma.erasureTask.create({
        data: {
          organizationId,
          dataPrincipalId,
          trigger: "CONSENT_WITHDRAWN",
          retentionFloorUntil,
          erasureDueAt,
        },
      });
      expect(task.id).toBeDefined();
    });
  });
});
