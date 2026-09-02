import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TenantContext } from "../src/common/tenant/tenant-context";
import type { TenantStore } from "../src/common/tenant/tenant-context";
import { BreachService } from "../src/modules/breaches/breach.service";
import { renderBoardDetailedPdf } from "../src/modules/breaches/breach-render";
import {
  bootstrapTestApp,
  cleanupOrgs,
  waitUntil,
} from "./support/e2e-harness";

jest.setTimeout(120000);

describe("Breach workflow (BR-01…BR-15)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: BreachService;
  const orgIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
    service = app.get(BreachService);
  });
  afterAll(async () => {
    if (orgIds.length) {
      await prisma.campaignRecipient.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.notification.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.messageCampaign.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.breachAffectedPrincipal.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.breachObligation.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.breachIncident.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.complianceRule.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.dataPrincipal.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  async function fixture() {
    const organizationId = randomUUID();
    orgIds.push(organizationId);
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Breach Test Org",
        dpoName: "Breach DPO",
        dpoEmail: "breach-dpo@example.test",
      },
    });
    await prisma.complianceRule.create({
      data: {
        organizationId,
        ruleCode: "BREACH_BOARD_DETAIL",
        version: 1,
        name: "Board detail",
        legalSource: "Rule 7(2)(b)",
        basis: "STATUTORY",
        appliesTo: "BREACH:BOARD_DETAIL",
        deadlineValue: 72,
        deadlineUnit: "HOURS",
        warningLead: 12,
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    const principalIds = await Promise.all(
      ["Affected One", "Affected Two"].map((displayName) =>
        prisma.dataPrincipal
          .create({
            data: {
              organizationId,
              reference: `DP-${randomUUID()}`,
              displayName,
              ageStatus: "ADULT",
            },
          })
          .then((row) => row.id),
      ),
    );
    const store: TenantStore = {
      organizationId,
      actorType: "EMPLOYEE",
      actorId: "employee-1",
      actorLabel: "Breach test employee",
    };
    const actor = {
      sub: "employee-1",
      organizationId,
      actorLabel: "Breach test employee",
      aud: "employee",
      iat: 0,
      exp: 0,
    } as const;
    return { organizationId, principalIds, store, actor };
  }

  it("Check 18: BOARD_DETAIL starts at becameAwareAt, not occurredAt or createdAt", async () => {
    const f = await fixture();
    const occurredAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const becameAwareAt = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const breach = await TenantContext.run(f.store, () =>
      service.create(
        {
          title: "Test breach",
          description: "A test incident",
          occurredAt: occurredAt.toISOString(),
          becameAwareAt: becameAwareAt.toISOString(),
          affectedSourceIds: ["source-1"],
          dataCategories: ["IDENTITY"],
          affectedPrincipalIds: f.principalIds,
        },
        f.actor,
      ),
    );
    const detail = breach.obligations.find(
      (obligation) => obligation.code === "BOARD_DETAIL",
    );
    expect(detail).toBeDefined();
    expect(detail?.dueAt.getTime()).toBe(
      becameAwareAt.getTime() + 72 * 60 * 60 * 1000,
    );
    expect(detail?.legalSourceSnapshot).toBe("Rule 7(2)(b)");
    expect(detail?.basisSnapshot).toBe("STATUTORY");
  });

  it("Check 20: affected-principal count is exactly the selected campaign recipient count", async () => {
    const f = await fixture();
    const breach = await TenantContext.run(f.store, () =>
      service.create(
        {
          title: "Affected-only breach",
          description: "A test incident",
          occurredAt: new Date().toISOString(),
          becameAwareAt: new Date().toISOString(),
          affectedSourceIds: ["source-1"],
          dataCategories: ["CONTACT"],
          affectedPrincipalIds: f.principalIds,
        },
        f.actor,
      ),
    );
    const campaign = await prisma.messageCampaign.create({
      data: {
        organizationId: f.organizationId,
        reference: `CMP-${randomUUID()}`,
        name: "Breach notice",
        category: "BREACH_NOTICE",
        subject: "Breach",
        bodyMarkdown: "Breach",
        audienceFilter: {},
        breachId: breach.id,
        status: "SENT",
        createdByEmployeeId: "employee-1",
        recipientCount: f.principalIds.length,
      },
    });
    await prisma.campaignRecipient.createMany({
      data: f.principalIds.map((dataPrincipalId) => ({
        organizationId: f.organizationId,
        campaignId: campaign.id,
        dataPrincipalId,
        channel: "PORTAL",
        status: "DELIVERED",
      })),
    });
    expect(
      await prisma.breachAffectedPrincipal.count({
        where: { organizationId: f.organizationId, breachId: breach.id },
      }),
    ).toBe(
      await prisma.campaignRecipient.count({
        where: { organizationId: f.organizationId, campaignId: campaign.id },
      }),
    );
  });

  it("rejects principal notification before the breach reaches CONTAINED", async () => {
    const f = await fixture();
    const breach = await TenantContext.run(f.store, () =>
      service.create(
        {
          title: "Not-yet-contained breach",
          description: "A test incident",
          occurredAt: new Date().toISOString(),
          becameAwareAt: new Date().toISOString(),
          affectedSourceIds: ["source-1"],
          dataCategories: ["IDENTITY"],
          affectedPrincipalIds: f.principalIds,
        },
        f.actor,
      ),
    );

    await expect(
      TenantContext.run(f.store, () =>
        service.notifyPrincipals(breach.id, f.actor),
      ),
    ).rejects.toThrow(/move it to CONTAINED first/);

    const unchanged = await prisma.breachIncident.findUniqueOrThrow({
      where: { id: breach.id },
      select: { status: true },
    });
    expect(unchanged.status).toBe("DETECTED");
  });

  it("records a durable dispatch intent before queue delivery, then stages an approved campaign exactly once", async () => {
    const f = await fixture();
    const breach = await TenantContext.run(f.store, () =>
      service.create(
        {
          title: "Durable dispatch breach",
          description: "A breach whose notice must survive queue recovery",
          occurredAt: new Date().toISOString(),
          becameAwareAt: new Date().toISOString(),
          affectedSourceIds: ["source-1"],
          dataCategories: ["CONTACT"],
          affectedPrincipalIds: f.principalIds,
        },
        f.actor,
      ),
    );
    await prisma.breachIncident.update({
      where: { id: breach.id },
      data: { status: "CONTAINED" },
    });
    const campaign = await prisma.messageCampaign.create({
      data: {
        organizationId: f.organizationId,
        reference: `CMP-${randomUUID()}`,
        name: "Approved durable breach notice",
        category: "BREACH_NOTICE",
        subject: "Breach notice",
        bodyMarkdown: "A breach occurred.",
        audienceFilter: {},
        breachId: breach.id,
        status: "APPROVED",
        createdByEmployeeId: f.actor.sub,
        approvedByEmployeeId: "another-employee",
        approvedAt: new Date(),
      },
    });

    const notified = await TenantContext.run(f.store, () =>
      service.notifyPrincipals(breach.id, f.actor),
    );
    expect(notified.status).toBe("PRINCIPALS_NOTIFIED");

    const lifecycleAudit = await prisma.auditEvent.findFirst({
      where: {
        organizationId: f.organizationId,
        action: "BREACH_PRINCIPALS_NOTIFIED",
        resourceId: breach.id,
      },
      orderBy: { sequence: "desc" },
    });
    expect(
      (lifecycleAudit?.metadata as Record<string, unknown>)?.delivery,
    ).toBe("DISPATCH_QUEUED");
    expect(
      (lifecycleAudit?.metadata as Record<string, unknown>)?.campaignId,
    ).toBe(campaign.id);

    await expect(
      TenantContext.run(f.store, () =>
        service.dispatchPrincipalNoticeCampaign(campaign.id),
      ),
    ).resolves.toMatch(/SENDING|SENT/);

    await waitUntil(async () => {
      const current = await prisma.messageCampaign.findUniqueOrThrow({
        where: { id: campaign.id },
        select: { status: true },
      });
      return current.status === "SENT";
    });
    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id },
      select: { status: true },
    });
    expect(recipients).toHaveLength(f.principalIds.length);
    expect(
      recipients.every((recipient) => recipient.status === "DELIVERED"),
    ).toBe(true);

    // A recovery retry sees SENT durable evidence and cannot re-stage or
    // double-deliver the campaign.
    await expect(
      TenantContext.run(f.store, () =>
        service.dispatchPrincipalNoticeCampaign(campaign.id),
      ),
    ).resolves.toBe("SENT");
    expect(
      await prisma.campaignRecipient.count({
        where: { campaignId: campaign.id },
      }),
    ).toBe(f.principalIds.length);
  });

  it("Defect 3 regression: notifyPrincipals surfaces a render failure (missing Rule 7(1) narrative field) to the caller instead of swallowing it and reporting success, and delivers nothing", async () => {
    const f = await fixture();
    const breach = await TenantContext.run(f.store, () =>
      service.create(
        {
          title: "Breach with missing narrative",
          description: "A test incident",
          occurredAt: new Date().toISOString(),
          becameAwareAt: new Date().toISOString(),
          affectedSourceIds: ["source-1"],
          dataCategories: ["IDENTITY"],
          affectedPrincipalIds: f.principalIds,
        },
        f.actor,
      ),
    );
    await prisma.breachIncident.update({
      where: { id: breach.id },
      data: { status: "CONTAINED" },
    });
    // The campaign body declares the Rule 7(1) placeholders (as the real
    // BREACH_NOTIFICATION template does), but the breach record's
    // narrative fields are NULL -- `service.create` above never set them.
    const campaign = await prisma.messageCampaign.create({
      data: {
        organizationId: f.organizationId,
        reference: `CMP-${randomUUID()}`,
        name: "Breach notice with missing narrative",
        category: "BREACH_NOTICE",
        subject: "Data breach notice ({{breach_reference}})",
        bodyMarkdown: [
          "Nature, extent and timing: {{breach_nature_extent_timing}}",
          "Consequences: {{breach_consequences}}",
          "Mitigation: {{breach_mitigation}}",
          "Safety measures: {{breach_safety_measures}}",
          "Contact: {{breach_responder_contact}}",
        ].join("\n"),
        audienceFilter: {},
        breachId: breach.id,
        status: "APPROVED",
        createdByEmployeeId: f.actor.sub,
        approvedByEmployeeId: "another-employee",
        approvedAt: new Date(),
      },
    });

    // The failure must reach the caller -- not be swallowed into the
    // "best-effort, the clock will retry" catch, which would report 200
    // PRINCIPALS_NOTIFIED while nothing was ever queued for delivery.
    await expect(
      TenantContext.run(f.store, () =>
        service.notifyPrincipals(breach.id, f.actor),
      ),
    ).rejects.toThrow(/Required variable/);

    // Nothing was delivered.
    expect(
      await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } }),
    ).toBe(0);
    const staleCampaign = await prisma.messageCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(staleCampaign.status).toBe("APPROVED");
  });

  it("Check 21: detailed Board report exposes CampaignRecipient delivery status counts and filing boundary", async () => {
    const f = await fixture();
    const breach = await TenantContext.run(f.store, () =>
      service.create(
        {
          title: "Delivery-evidenced breach",
          description: "A test incident",
          occurredAt: new Date().toISOString(),
          becameAwareAt: new Date().toISOString(),
          affectedSourceIds: ["source-1"],
          dataCategories: ["CONTACT"],
          affectedPrincipalIds: f.principalIds,
        },
        f.actor,
      ),
    );
    const campaign = await prisma.messageCampaign.create({
      data: {
        organizationId: f.organizationId,
        reference: `CMP-${randomUUID()}`,
        name: "Breach notice",
        category: "BREACH_NOTICE",
        subject: "Breach",
        bodyMarkdown: "Breach",
        audienceFilter: {},
        breachId: breach.id,
        status: "SENT",
        createdByEmployeeId: "employee-1",
        recipientCount: 2,
      },
    });
    await prisma.campaignRecipient.createMany({
      data: [
        {
          organizationId: f.organizationId,
          campaignId: campaign.id,
          dataPrincipalId: f.principalIds[0]!,
          channel: "PORTAL",
          status: "DELIVERED",
        },
        {
          organizationId: f.organizationId,
          campaignId: campaign.id,
          dataPrincipalId: f.principalIds[1]!,
          channel: "PORTAL",
          status: "FAILED",
        },
      ],
    });
    const report = await TenantContext.run(f.store, () =>
      service.boardReport(breach.id),
    );
    expect(report.deliveryStatusCounts).toEqual({ DELIVERED: 1, FAILED: 1 });
    const pdf = await renderBoardDetailedPdf(report);
    expect(pdf.length).toBeGreaterThan(100);
    expect(report.breach.reference).toMatch(/^BR-/);
  });
});
