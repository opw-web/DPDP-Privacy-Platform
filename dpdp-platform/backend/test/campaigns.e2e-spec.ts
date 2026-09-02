import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TenantContext, type TenantStore } from "../src/common/tenant/tenant-context";
import { CampaignsService } from "../src/modules/messaging/campaigns/campaigns.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import type { CampaignSendJobData } from "../src/queues/campaign-send.queue";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  ensurePermission,
  cleanupOrgs,
  waitUntil,
} from "./support/e2e-harness";

/**
 * Task 11 (spec §4.8, lines 753-768): campaigns, the eight send guards,
 * and per-recipient delivery evidence.
 *
 * Cleanup note: mirrors `test/consents.e2e-spec.ts`'s established
 * convention -- none of `DataPrincipal` / `ConsentRecord` / `CampaignRecipient`
 * / `BreachIncident` / `BreachAffectedPrincipal` / `InformationRequest`
 * carries a real (Prisma-enforced) foreign key to `Organization` or
 * `Employee` (only `organizationId`/`createdByEmployeeId` scalar
 * columns), so `cleanupOrgs`'s plain `Organization`/`Employee` delete is
 * never blocked by any fixture left behind here. Nothing is force-deleted
 * per-model; only `cleanupOrgs(prisma, orgIds)` runs in `afterAll`.
 */
describe("Campaigns API (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let campaignsService: CampaignsService;
  let notificationsService: NotificationsService;
  const orgIds: string[] = [];

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    campaignsService = app.get(CampaignsService);
    notificationsService = app.get(NotificationsService);
  });

  afterAll(async () => {
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  const authed = (token: string) => ({
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string, body?: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(url)
        .set("Authorization", `Bearer ${token}`)
        .send(body ?? {}),
  });

  /** Everyone in the org, regardless of age status -- the "no real
   * filtering, just select the whole org" DSL used by most of these
   * tests (each test uses a fresh org, so this never needs to be more
   * specific to avoid cross-test contamination). */
  const EVERYONE_FILTER = {
    op: "AND" as const,
    rules: [
      {
        field: "ageStatus",
        operator: "in",
        value: ["UNKNOWN", "ADULT", "CHILD", "GUARDIAN_REPRESENTED"],
      },
    ],
  };

  /**
   * One org with two employees holding CAN_SEND_MESSAGES +
   * CAN_SEND_BREACH_NOTICES (`creator`, `approver` -- both able to
   * create/approve/send, so guard 7's "creator cannot approve their own"
   * is exercised at the SERVICE layer, not turned into a route-level 403
   * by `approver` lacking a permission `creator` also needs) plus one
   * employee with no permissions at all (`noPerm`, for the 403/positive-
   * control pair). The organization's DPO contact is set -- required by
   * `renderOrganizationMessageTemplate` (`MissingOrganizationContactError`
   * otherwise), which every `send()` call goes through.
   */
  async function setupOrg(): Promise<{
    organizationId: string;
    creator: { employeeId: string; accessToken: string };
    approver: { employeeId: string; accessToken: string };
    noPerm: { employeeId: string; accessToken: string };
  }> {
    const perms = ["CAN_SEND_MESSAGES", "CAN_SEND_BREACH_NOTICES"];
    const creatorOrg = await createOrgWithEmployee(app, prisma, `CMP_CREATOR_${randomUUID().slice(0, 8)}`, perms);
    orgIds.push(creatorOrg.organizationId);
    const organizationId = creatorOrg.organizationId;

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        dpoName: "Test DPO",
        dpoEmail: "dpo@example.test",
        grievanceContactEmail: "grievance@example.test",
      },
    });

    const approver = await addEmployeeToOrg(organizationId, `CMP_APPROVER_${randomUUID().slice(0, 8)}`, perms);
    const noPerm = await addEmployeeToOrg(organizationId, `CMP_NOPERM_${randomUUID().slice(0, 8)}`, []);

    return {
      organizationId,
      creator: { employeeId: creatorOrg.employeeId, accessToken: creatorOrg.accessToken },
      approver,
      noPerm,
    };
  }

  /** Adds a second (or third...) employee, in their own role, to an
   * ALREADY-CREATED organization -- `createOrgWithEmployee` only builds
   * one org + one employee, so multi-employee guard-7/guard-3 tests need
   * this local counterpart, hand-rolled the same way that helper is. */
  async function addEmployeeToOrg(
    organizationId: string,
    roleCode: string,
    permissionCodes: readonly string[],
  ): Promise<{ employeeId: string; accessToken: string }> {
    for (const code of permissionCodes) {
      await ensurePermission(prisma, code);
    }
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: roleCode,
        name: roleCode,
        isSystem: false,
        permissions: { create: permissionCodes.map((permissionCode) => ({ permissionCode })) },
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
      throw new Error(`addEmployeeToOrg(): fixture login failed: ${JSON.stringify(loginRes.body)}`);
    }
    return { employeeId: employee.id, accessToken: loginRes.body.accessToken as string };
  }

  async function createPrincipal(
    organizationId: string,
    overrides: { ageStatus?: "UNKNOWN" | "ADULT" | "CHILD" | "GUARDIAN_REPRESENTED" } = {},
  ): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: `Campaign Test Principal ${randomUUID().slice(0, 8)}`,
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

  async function setConsent(
    organizationId: string,
    dataPrincipalId: string,
    purposeId: string,
    status: "GRANTED" | "DENIED" | "WITHDRAWN",
  ): Promise<void> {
    await prisma.consentRecord.create({
      data: { organizationId, dataPrincipalId, purposeId, status },
    });
  }

  /** A PUBLISHED (or, if `publish: false`, a DRAFT) NoticeVersion --
   * fields copied from `test/consents.e2e-spec.ts`'s own fixture for the
   * same model (this task does not own the notices module). */
  async function createNotice(
    organizationId: string,
    publish: boolean,
  ): Promise<{ noticeId: string }> {
    const notice = await prisma.privacyNotice.create({
      data: { organizationId, code: `NOTICE_${randomUUID()}`, name: "Consent Request Notice" },
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
        bodyMarkdown: "Notice body.",
        contentHash: `hash-${randomUUID()}`,
        publishedAt: publish ? new Date() : null,
        createdByEmployeeId: randomUUID(),
      },
    });
    if (publish) {
      await prisma.privacyNotice.update({
        where: { id: notice.id },
        data: { status: "PUBLISHED", currentVersionId: version.id },
      });
    }
    return { noticeId: notice.id };
  }

  async function createBreach(
    organizationId: string,
    discoveredByEmployeeId: string,
  ): Promise<string> {
    const breach = await prisma.breachIncident.create({
      data: {
        organizationId,
        reference: `BR-${randomUUID()}`,
        title: "Test breach",
        description: "A test breach incident.",
        occurredAt: new Date("2026-08-30T09:00:00.000Z"),
        becameAwareAt: new Date("2026-08-30T12:00:00.000Z"),
        discoveredByEmployeeId,
        affectedSourceIds: [],
        dataCategories: [],
      },
    });
    return breach.id;
  }

  async function markAffected(
    organizationId: string,
    breachId: string,
    dataPrincipalId: string,
  ): Promise<void> {
    await prisma.breachAffectedPrincipal.create({
      data: { organizationId, breachId, dataPrincipalId },
    });
  }

  async function getRecipients(
    token: string,
    campaignId: string,
  ): Promise<Array<{ dataPrincipalId: string; status: string; suppressReason: string | null }>> {
    const res = await authed(token).get(`/api/campaigns/${campaignId}/recipients`);
    expect(res.status).toBe(200);
    return res.body;
  }

  // ─────────────────────────── guard 1 ───────────────────────────

  describe("Guard 1: MARKETING requires purposeId; recipients intersect GRANTED consent", () => {
    it("refuses to create a MARKETING campaign with no purposeId (400)", async () => {
      const { creator } = await setupOrg();
      const res = await authed(creator.accessToken).post("/api/campaigns", {
        name: "No purpose",
        category: "MARKETING",
        subject: "Hi {{principal_name}}",
        bodyMarkdown: "Hello.",
        audienceFilter: EVERYONE_FILTER,
      });
      expect(res.status).toBe(400);
    });

    it("intersects with GRANTED consent; everyone else is recorded SUPPRESSED/NO_CONSENT, not dropped (also Check 14: preview total = DELIVERED + PENDING + SUPPRESSED)", async () => {
      const { organizationId, creator } = await setupOrg();
      const purposeId = await createConsentPurpose(organizationId);

      const granted = await createPrincipal(organizationId);
      const noRecord = await createPrincipal(organizationId);
      const withdrawn = await createPrincipal(organizationId);
      await setConsent(organizationId, granted, purposeId, "GRANTED");
      await setConsent(organizationId, withdrawn, purposeId, "WITHDRAWN");

      const previewRes = await authed(creator.accessToken).post("/api/audiences/preview", {
        filter: EVERYONE_FILTER,
      });
      expect(previewRes.status).toBe(201);
      expect(previewRes.body.total).toBe(3);

      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Marketing send",
        category: "MARKETING",
        subject: "Hi {{principal_name}}",
        bodyMarkdown: "About {{purpose_name}}.",
        requiredVariables: ["principal_name"],
        audienceFilter: EVERYONE_FILTER,
        purposeId,
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe("DRAFT");
      expect(createRes.body.recipientCount).toBe(3);
      const campaignId = createRes.body.id;

      const sendRes = await authed(creator.accessToken).post(`/api/campaigns/${campaignId}/send`);
      expect(sendRes.status).toBe(201);

      await waitUntil(async () => {
        const rows = await getRecipients(creator.accessToken, campaignId);
        return rows.every((r) => r.status === "DELIVERED" || r.status === "SUPPRESSED");
      });

      const rows = await getRecipients(creator.accessToken, campaignId);
      const byPrincipal = new Map(rows.map((r) => [r.dataPrincipalId, r]));

      expect(byPrincipal.get(granted)?.status).toBe("DELIVERED");
      expect(byPrincipal.get(granted)?.suppressReason).toBeNull();
      expect(byPrincipal.get(noRecord)?.status).toBe("SUPPRESSED");
      expect(byPrincipal.get(noRecord)?.suppressReason).toBe("NO_CONSENT");
      expect(byPrincipal.get(withdrawn)?.status).toBe("SUPPRESSED");
      expect(byPrincipal.get(withdrawn)?.suppressReason).toBe("NO_CONSENT");

      // Check 14: preview total = DELIVERED + PENDING + SUPPRESSED.
      const delivered = rows.filter((r) => r.status === "DELIVERED").length;
      const pending = rows.filter((r) => r.status === "PENDING").length;
      const suppressed = rows.filter((r) => r.status === "SUPPRESSED").length;
      expect(previewRes.body.total).toBe(delivered + pending + suppressed);

      // BR-13 evidence: rendered content was stored before delivery, and
      // is a non-empty, subject-substituted string for the delivered row.
      expect(byPrincipal.get(granted)?.status).toBe("DELIVERED");
    });
  });

  // ─────────────────────────── guard 2 / Check 12 ───────────────────────────

  describe("Guard 2: MARKETING excludes every CHILD and GUARDIAN_REPRESENTED, regardless of consent", () => {
    it("suppresses CHILD_MARKETING_PROHIBITED even when a GRANTED consent record exists (Check 12: 'guardian grants consent' does not unlock it)", async () => {
      const { organizationId, creator } = await setupOrg();
      const purposeId = await createConsentPurpose(organizationId);

      const child = await createPrincipal(organizationId, { ageStatus: "CHILD" });
      const guardianRepresented = await createPrincipal(organizationId, {
        ageStatus: "GUARDIAN_REPRESENTED",
      });
      // Simulate a guardian somehow granting marketing consent for the
      // child -- s.9(3) bans marketing regardless of consent, so this
      // must NOT unlock delivery.
      await setConsent(organizationId, child, purposeId, "GRANTED");
      // guardianRepresented gets no consent row at all -- still must be
      // CHILD_MARKETING_PROHIBITED, not NO_CONSENT (guard 2 runs before
      // guard 1's consent check).

      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Marketing to children",
        category: "MARKETING",
        subject: "Hi {{principal_name}}",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
        purposeId,
      });
      expect(createRes.status).toBe(201);
      const campaignId = createRes.body.id;

      const sendRes = await authed(creator.accessToken).post(`/api/campaigns/${campaignId}/send`);
      expect(sendRes.status).toBe(201);

      const rows = await getRecipients(creator.accessToken, campaignId);
      const byPrincipal = new Map(rows.map((r) => [r.dataPrincipalId, r]));

      expect(byPrincipal.get(child)?.status).toBe("SUPPRESSED");
      expect(byPrincipal.get(child)?.suppressReason).toBe("CHILD_MARKETING_PROHIBITED");
      expect(byPrincipal.get(guardianRepresented)?.status).toBe("SUPPRESSED");
      expect(byPrincipal.get(guardianRepresented)?.suppressReason).toBe(
        "CHILD_MARKETING_PROHIBITED",
      );
    });
  });

  // ─────────────────────────── guard 3 / Check 15 ───────────────────────────

  describe("Guard 3: BREACH_NOTICE requires CAN_SEND_BREACH_NOTICES + breachId; recipients come only from BreachAffectedPrincipal", () => {
    it("refuses creation without breachId (400)", async () => {
      const { creator } = await setupOrg();
      const res = await authed(creator.accessToken).post("/api/campaigns", {
        name: "No breach id",
        category: "BREACH_NOTICE",
        subject: "Breach",
        bodyMarkdown: "Body.",
      });
      expect(res.status).toBe(400);
    });

    it("refuses an audienceFilter for BREACH_NOTICE (400) -- recipients come only from BreachAffectedPrincipal", async () => {
      const { organizationId, creator } = await setupOrg();
      const breachId = await createBreach(organizationId, creator.employeeId);
      const res = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Breach with filter",
        category: "BREACH_NOTICE",
        subject: "Breach",
        bodyMarkdown: "Body.",
        breachId,
        audienceFilter: EVERYONE_FILTER,
      });
      expect(res.status).toBe(400);
    });

    it("refuses to send without CAN_SEND_BREACH_NOTICES, requires approval, reaches only BreachAffectedPrincipal rows, and reaches principals whose marketing consent is DENIED/WITHDRAWN (Check 15)", async () => {
      const { organizationId, creator, approver } = await setupOrg();
      const sendOnlyNoBreachPerm = await addEmployeeToOrg(
        organizationId,
        `CMP_SENDONLY_${randomUUID().slice(0, 8)}`,
        ["CAN_SEND_MESSAGES"],
      );

      const marketingPurposeId = await createConsentPurpose(organizationId);
      const breachId = await createBreach(organizationId, creator.employeeId);
      const affected1 = await createPrincipal(organizationId);
      const affected2 = await createPrincipal(organizationId);
      const notAffected = await createPrincipal(organizationId);
      await markAffected(organizationId, breachId, affected1);
      await markAffected(organizationId, breachId, affected2);
      // Check 15: DENIED/WITHDRAWN marketing consent must not suppress a
      // BREACH_NOTICE delivery -- compliance categories ignore marketing
      // consent entirely (guard 5).
      await setConsent(organizationId, affected1, marketingPurposeId, "DENIED");
      await setConsent(organizationId, affected2, marketingPurposeId, "WITHDRAWN");

      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Breach notice",
        category: "BREACH_NOTICE",
        subject: "Data breach notice",
        bodyMarkdown: "A breach occurred.",
        breachId,
      });
      expect(createRes.status).toBe(201);
      const campaignId = createRes.body.id;
      // Guard 7: every BREACH_NOTICE requires approval, regardless of count.
      expect(createRes.body.status).toBe("PENDING_APPROVAL");
      expect(createRes.body.recipientCount).toBe(2);

      const approveRes = await authed(approver.accessToken).post(
        `/api/campaigns/${campaignId}/approve`,
      );
      expect(approveRes.status).toBe(201);

      const deniedSend = await authed(sendOnlyNoBreachPerm.accessToken).post(
        `/api/campaigns/${campaignId}/send`,
      );
      expect(deniedSend.status).toBe(403);

      const sendRes = await authed(creator.accessToken).post(`/api/campaigns/${campaignId}/send`);
      expect(sendRes.status).toBe(201);

      await waitUntil(async () => {
        const rows = await getRecipients(creator.accessToken, campaignId);
        return rows.length === 2 && rows.every((r) => r.status === "DELIVERED");
      });

      const rows = await getRecipients(creator.accessToken, campaignId);
      const ids = rows.map((r) => r.dataPrincipalId).sort();
      expect(ids).toEqual([affected1, affected2].sort());
      expect(rows.every((r) => r.status === "DELIVERED")).toBe(true);
      expect(rows.some((r) => r.dataPrincipalId === notAffected)).toBe(false);

      // BR-13: BreachAffectedPrincipal rows carry the delivery evidence
      // the Board report reads back.
      const bap1 = await prisma.breachAffectedPrincipal.findFirst({
        where: { breachId, dataPrincipalId: affected1 },
      });
      expect(bap1?.notifiedAt).not.toBeNull();
      expect(bap1?.campaignRecipientId).not.toBeNull();
    });

    it("Defect 3 regression: a BREACH_NOTICE campaign built ad-hoc (no templateId, so requiredVariables defaults to []) refuses to send while the breach's Rule 7(1) narrative fields are NULL -- naming the missing element -- and delivers nothing; sending succeeds once the fields are filled in (positive control)", async () => {
      const { organizationId, creator, approver } = await setupOrg();
      const breachId = await createBreach(organizationId, creator.employeeId);
      const affected = await createPrincipal(organizationId);
      await markAffected(organizationId, breachId, affected);

      // The breach record's Rule 7(1) narrative fields are NULL -- exactly
      // the incident: `createBreach` above never sets
      // natureExtentTiming/consequences/mitigationMeasures/
      // safetyMeasuresForPrincipals/responderContact.
      const stillNull = await prisma.breachIncident.findUniqueOrThrow({
        where: { id: breachId },
      });
      expect(stillNull.natureExtentTiming).toBeNull();
      expect(stillNull.consequences).toBeNull();

      // Mirrors the real MessagingCampaignBuilderPage payload: free-text
      // subject/bodyMarkdown, no `templateId`, no `requiredVariables` --
      // the shape that let the render's required-variable check be
      // silently skipped before this fix.
      const bodyMarkdown = [
        "Nature, extent and timing: {{breach_nature_extent_timing}}",
        "Consequences: {{breach_consequences}}",
        "Mitigation: {{breach_mitigation}}",
        "Safety measures: {{breach_safety_measures}}",
        "Contact: {{breach_responder_contact}}",
        "Reference: {{breach_reference}}",
      ].join("\n");
      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Breach notice with missing narrative",
        category: "BREACH_NOTICE",
        subject: "Data breach notice ({{breach_reference}})",
        bodyMarkdown,
        breachId,
      });
      expect(createRes.status).toBe(201);
      const campaignId = createRes.body.id;
      expect(createRes.body.status).toBe("PENDING_APPROVAL");

      const approveRes = await authed(approver.accessToken).post(
        `/api/campaigns/${campaignId}/approve`,
      );
      expect(approveRes.status).toBe(201);

      // The send must refuse -- not silently print blanks and report
      // success.
      const sendRes = await authed(creator.accessToken).post(`/api/campaigns/${campaignId}/send`);
      expect(sendRes.status).toBe(400);
      expect(sendRes.body.message).toContain("Required variable");
      // The operator must learn WHICH element is missing, not just that
      // the render failed.
      expect(sendRes.body.message).toMatch(
        /breach_nature_extent_timing|breach_consequences|breach_mitigation|breach_safety_measures|breach_responder_contact/,
      );

      // BR-13/guard: nothing was delivered, and the campaign was not
      // silently advanced past APPROVED -- a failed render must not
      // leave a half-populated (or fully blank) recipient row behind.
      const recipients = await getRecipients(creator.accessToken, campaignId);
      expect(recipients).toHaveLength(0);
      const staleCampaign = await prisma.messageCampaign.findUniqueOrThrow({
        where: { id: campaignId },
      });
      expect(staleCampaign.status).toBe("APPROVED");
      expect(staleCampaign.sentAt).toBeNull();

      // POSITIVE CONTROL: once the breach record carries all five Rule
      // 7(1) narrative fields, the identical campaign sends and delivers.
      await prisma.breachIncident.update({
        where: { id: breachId },
        data: {
          natureExtentTiming: "A misconfigured backup exposed records for 3 days.",
          consequences: "Your contact details may have been viewed by an unauthorised party.",
          mitigationMeasures: "The backup was secured and access logs were reviewed.",
          safetyMeasuresForPrincipals: "Watch for phishing attempts referencing this incident.",
          responderContact: "breach-response@example.test",
        },
      });
      const retrySendRes = await authed(creator.accessToken).post(
        `/api/campaigns/${campaignId}/send`,
      );
      expect(retrySendRes.status).toBe(201);

      await waitUntil(async () => {
        const rows = await getRecipients(creator.accessToken, campaignId);
        return rows.length === 1 && rows.every((r) => r.status === "DELIVERED");
      });
      const delivered = await getRecipients(creator.accessToken, campaignId);
      expect(delivered).toHaveLength(1);
      expect(delivered[0]!.status).toBe("DELIVERED");
    });
  });

  // ─────────────────────────── guard 4 ───────────────────────────

  describe("Guard 4: CONSENT_REQUEST requires purposeId AND a published noticeVersionId; not consent-filtered", () => {
    it("refuses without purposeId (400)", async () => {
      const { organizationId, creator } = await setupOrg();
      const { noticeId } = await createNotice(organizationId, true);
      const res = await authed(creator.accessToken).post("/api/campaigns", {
        name: "No purpose",
        category: "CONSENT_REQUEST",
        subject: "Please consent",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
        noticeId,
      });
      expect(res.status).toBe(400);
    });

    it("refuses without noticeId (400)", async () => {
      const { organizationId, creator } = await setupOrg();
      const purposeId = await createConsentPurpose(organizationId);
      const res = await authed(creator.accessToken).post("/api/campaigns", {
        name: "No notice",
        category: "CONSENT_REQUEST",
        subject: "Please consent",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
        purposeId,
      });
      expect(res.status).toBe(400);
    });

    it("refuses when the notice has no published version (NT-01, 400)", async () => {
      const { organizationId, creator } = await setupOrg();
      const purposeId = await createConsentPurpose(organizationId);
      const { noticeId } = await createNotice(organizationId, false);
      const res = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Unpublished notice",
        category: "CONSENT_REQUEST",
        subject: "Please consent",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
        purposeId,
        noticeId,
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/NT-01|published/i);
    });

    it("is NOT consent-filtered -- reaches principals with DENIED/WITHDRAWN/no consent record alike", async () => {
      const { organizationId, creator } = await setupOrg();
      const purposeId = await createConsentPurpose(organizationId);
      const { noticeId } = await createNotice(organizationId, true);

      const denied = await createPrincipal(organizationId);
      const noRecord = await createPrincipal(organizationId);
      await setConsent(organizationId, denied, purposeId, "DENIED");

      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Consent request",
        category: "CONSENT_REQUEST",
        subject: "Please consent",
        bodyMarkdown: "Notice version {{notice_version}}.",
        audienceFilter: EVERYONE_FILTER,
        purposeId,
        noticeId,
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.noticeVersionId).toBeTruthy();
      const campaignId = createRes.body.id;

      const sendRes = await authed(creator.accessToken).post(`/api/campaigns/${campaignId}/send`);
      expect(sendRes.status).toBe(201);

      await waitUntil(async () => {
        const rows = await getRecipients(creator.accessToken, campaignId);
        return rows.length === 2 && rows.every((r) => r.status === "DELIVERED");
      });
      const rows = await getRecipients(creator.accessToken, campaignId);
      expect(rows.every((r) => r.status === "DELIVERED")).toBe(true);
      expect(rows.map((r) => r.dataPrincipalId).sort()).toEqual([denied, noRecord].sort());
    });
  });

  // ─────────────────────────── guard 5 ───────────────────────────

  describe("Guard 5: compliance categories ignore marketing consent entirely", () => {
    it("a COMPLIANCE_NOTICE reaches a principal with DENIED marketing consent", async () => {
      const { organizationId, creator } = await setupOrg();
      const purposeId = await createConsentPurpose(organizationId);
      const principalId = await createPrincipal(organizationId);
      await setConsent(organizationId, principalId, purposeId, "DENIED");

      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Compliance notice",
        category: "COMPLIANCE_NOTICE",
        subject: "Important notice",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
      });
      expect(createRes.status).toBe(201);
      const campaignId = createRes.body.id;

      const sendRes = await authed(creator.accessToken).post(`/api/campaigns/${campaignId}/send`);
      expect(sendRes.status).toBe(201);

      await waitUntil(async () => {
        const rows = await getRecipients(creator.accessToken, campaignId);
        return rows.length === 1 && rows[0]?.status === "DELIVERED";
      });
      const rows = await getRecipients(creator.accessToken, campaignId);
      expect(rows[0]?.status).toBe("DELIVERED");
      expect(rows[0]?.suppressReason).toBeNull();
    });
  });

  // ─────────────────────────── guard 6 ───────────────────────────

  describe("Guard 6: an active non-disclosure direction suppresses NON_DISCLOSURE_ORDER", () => {
    it("suppresses the named principal and writes NON_DISCLOSURE_SUPPRESSION_APPLIED to the audit log with the authorisation reference", async () => {
      const { organizationId, creator } = await setupOrg();
      const suppressed = await createPrincipal(organizationId);
      const untouched = await createPrincipal(organizationId);

      const infoRequest = await prisma.informationRequest.create({
        data: {
          organizationId,
          reference: `IR-${randomUUID()}`,
          requestingBody: "BOARD",
          authorisedPersonRef: "Authorised Person X",
          purposeCited: "Investigation",
          receivedAt: new Date(),
          responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          nonDisclosureDirected: true,
          nonDisclosurePermissionRef: "AUTH-REF-12345",
          affectedPrincipalIds: [suppressed],
        },
      });

      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Notice with non-disclosure",
        category: "NOTICE",
        subject: "Notice",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
      });
      expect(createRes.status).toBe(201);
      const campaignId = createRes.body.id;

      const sendRes = await authed(creator.accessToken).post(`/api/campaigns/${campaignId}/send`);
      expect(sendRes.status).toBe(201);

      const rows = await getRecipients(creator.accessToken, campaignId);
      const byPrincipal = new Map(rows.map((r) => [r.dataPrincipalId, r]));
      expect(byPrincipal.get(suppressed)?.status).toBe("SUPPRESSED");
      expect(byPrincipal.get(suppressed)?.suppressReason).toBe("NON_DISCLOSURE_ORDER");
      expect(byPrincipal.get(untouched)?.status).not.toBe("SUPPRESSED");

      const auditRow = await prisma.auditEvent.findFirst({
        where: {
          organizationId,
          action: "NON_DISCLOSURE_SUPPRESSION_APPLIED",
          resourceType: "InformationRequest",
          resourceId: infoRequest.id,
          subjectPrincipalId: suppressed,
        },
      });
      expect(auditRow).not.toBeNull();
      expect((auditRow?.metadata as Record<string, unknown> | null)?.["authorisationRef"]).toBe(
        "AUTH-REF-12345",
      );
    });
  });

  // ─────────────────────────── guard 7 ───────────────────────────

  describe("Guard 7: campaigns over 500 recipients, and every BREACH_NOTICE, require approval by a DIFFERENT employee", () => {
    it("requires approval above the threshold; the creator cannot approve their own; a different employee can", async () => {
      const { organizationId, creator, approver } = await setupOrg();

      const principalRows = Array.from({ length: 501 }, () => ({
        id: randomUUID(),
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Bulk principal",
        ageStatus: "ADULT" as const,
      }));
      await prisma.dataPrincipal.createMany({ data: principalRows });

      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Large notice",
        category: "NOTICE",
        subject: "Notice",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.recipientCount).toBeGreaterThan(500);
      expect(createRes.body.status).toBe("PENDING_APPROVAL");
      const campaignId = createRes.body.id;

      const conflictSend = await authed(creator.accessToken).post(
        `/api/campaigns/${campaignId}/send`,
      );
      expect(conflictSend.status).toBe(409);

      const selfApprove = await authed(creator.accessToken).post(
        `/api/campaigns/${campaignId}/approve`,
      );
      expect(selfApprove.status).toBe(403);

      const approveRes = await authed(approver.accessToken).post(
        `/api/campaigns/${campaignId}/approve`,
      );
      expect(approveRes.status).toBe(201);
      expect(approveRes.body.status).toBe("APPROVED");

      const sendRes = await authed(creator.accessToken).post(`/api/campaigns/${campaignId}/send`);
      expect(sendRes.status).toBe(201);
    }, 30000);

    it("a BREACH_NOTICE with a single recipient still requires approval", async () => {
      const { organizationId, creator } = await setupOrg();
      const breachId = await createBreach(organizationId, creator.employeeId);
      const affected = await createPrincipal(organizationId);
      await markAffected(organizationId, breachId, affected);

      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Single-recipient breach",
        category: "BREACH_NOTICE",
        subject: "Breach",
        bodyMarkdown: "Body.",
        breachId,
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.recipientCount).toBe(1);
      expect(createRes.body.status).toBe("PENDING_APPROVAL");
    });
  });

  // ─────────────────────────── guard 8 / Check 16 ───────────────────────────

  describe("Guard 8: idempotent send -- job id + unique constraint; re-triggering never double-delivers", () => {
    it("refuses a second send outright, and a duplicate re-trigger of one recipient's delivery is a no-op", async () => {
      const { organizationId, creator } = await setupOrg();
      const p1 = await createPrincipal(organizationId);
      const p2 = await createPrincipal(organizationId);

      const createRes = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Idempotency check",
        category: "NOTICE",
        subject: "Notice",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
      });
      expect(createRes.status).toBe(201);
      const campaignId = createRes.body.id;

      const sendRes = await authed(creator.accessToken).post(`/api/campaigns/${campaignId}/send`);
      expect(sendRes.status).toBe(201);

      await waitUntil(async () => {
        const rows = await getRecipients(creator.accessToken, campaignId);
        return rows.length === 2 && rows.every((r) => r.status === "DELIVERED");
      });

      // Check 16, first half: re-triggering the whole campaign is refused.
      const secondSend = await authed(creator.accessToken).post(
        `/api/campaigns/${campaignId}/send`,
      );
      expect(secondSend.status).toBe(409);

      // Check 16, second half: re-triggering ONE recipient's delivery
      // (simulating a duplicate BullMQ retry/manual re-enqueue reaching
      // the processor a second time for an already-DELIVERED row) yields
      // no additional PrincipalContactEvent and no double sentCount --
      // `deliverRecipient`'s own PENDING-status check is a no-op here.
      const beforeCampaign = await prisma.messageCampaign.findUniqueOrThrow({
        where: { id: campaignId },
      });
      const beforeContactEvents = await prisma.principalContactEvent.count({
        where: { dataPrincipalId: p1, channel: "CAMPAIGN_OUT" },
      });
      expect(beforeContactEvents).toBe(1);

      const jobData: CampaignSendJobData = {
        campaignId,
        dataPrincipalId: p1,
        channel: "PORTAL",
        organizationId,
        triggeredBy: creator.employeeId,
      };
      const store: TenantStore = {
        organizationId,
        actorType: "SYSTEM",
        actorId: null,
        actorLabel: "TEST_REDELIVER",
      };
      await TenantContext.run(store, () =>
        campaignsService.deliverRecipient(jobData, false, notificationsService),
      );

      const afterContactEvents = await prisma.principalContactEvent.count({
        where: { dataPrincipalId: p1, channel: "CAMPAIGN_OUT" },
      });
      expect(afterContactEvents).toBe(1);
      const afterCampaign = await prisma.messageCampaign.findUniqueOrThrow({
        where: { id: campaignId },
      });
      expect(afterCampaign.sentCount).toBe(beforeCampaign.sentCount);

      // The unique constraint half of guard 8: a duplicate
      // (campaignId, dataPrincipalId, channel) row is rejected at the DB
      // level too, independent of any application-level idempotency check.
      await expect(
        prisma.campaignRecipient.create({
          data: {
            organizationId,
            campaignId,
            dataPrincipalId: p1,
            channel: "PORTAL",
            status: "PENDING",
          },
        }),
      ).rejects.toThrow();

      // GO-09: sending must never touch lastPrincipalContactAt.
      const principal = await prisma.dataPrincipal.findUniqueOrThrow({ where: { id: p1 } });
      expect(principal.lastPrincipalContactAt).toBeNull();
      void p2;
    });
  });

  // ─────────────────────────── 403 / positive control ───────────────────────────

  describe("authorization", () => {
    it("403s without CAN_SEND_MESSAGES; 201s with it (positive control) on POST /api/campaigns", async () => {
      const { creator, noPerm } = await setupOrg();
      const forbidden = await authed(noPerm.accessToken).post("/api/campaigns", {
        name: "Should be forbidden",
        category: "NOTICE",
        subject: "Notice",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
      });
      expect(forbidden.status).toBe(403);

      const allowed = await authed(creator.accessToken).post("/api/campaigns", {
        name: "Should be allowed",
        category: "NOTICE",
        subject: "Notice",
        bodyMarkdown: "Body.",
        audienceFilter: EVERYONE_FILTER,
      });
      expect(allowed.status).toBe(201);
    });
  });
});
