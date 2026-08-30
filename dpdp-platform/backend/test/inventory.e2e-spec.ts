import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";

/**
 * Task 21 gate: `GET /api/inventory/summary`, `GET /api/inventory/gaps`,
 * `GET /api/inventory/ropa.csv` (spec lines 831-835/849, Check 21).
 * Fixtures assembled directly at the persistence layer, same style as
 * `test/principals.e2e-spec.ts`.
 */
describe("Inventory API (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  const organizationIds: string[] = [];

  type EmployeeSession = { accessToken: string };
  type Fixture = {
    organizationId: string;
    otherOrganizationId: string;
    reviewedPurposeId: string;
    unreviewedPurposeId: string;
    processorWithContractId: string;
    processorWithoutContractId: string;
    full: EmployeeSession;
    auditor: EmployeeSession;
  };
  let fixture: Fixture;

  async function ensurePermission(code: string): Promise<void> {
    const permission = PERMISSIONS.find((row) => row.code === code);
    if (!permission) {
      throw new Error(`Missing real seeded permission ${code}`);
    }
    await prisma.permission.upsert({
      where: { code },
      create: permission,
      update: {},
    });
  }

  async function employeeSession(
    organizationId: string,
    permissions: string[],
    label: string,
  ): Promise<EmployeeSession> {
    await Promise.all(
      permissions.map((permission) => ensurePermission(permission)),
    );
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: `${label}-${randomUUID()}`,
        name: label,
        permissions: {
          create: permissions.map((permissionCode) => ({ permissionCode })),
        },
      },
    });
    const password = "CorrectHorseBattery9!";
    const email = `${randomUUID()}@inventory.example.test`;
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: label,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: "ACTIVE",
        roleId: role.id,
      },
    });
    const response = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });
    expect(response.status).toBe(200);
    return { accessToken: response.body.accessToken as string };
  }

  function authenticated(session: EmployeeSession): [string, string] {
    return ["Authorization", `Bearer ${session.accessToken}`];
  }

  async function createFixture(): Promise<Fixture> {
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    organizationIds.push(organizationId, otherOrganizationId);
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: `Inventory ${organizationId}` },
        { id: otherOrganizationId, name: `Other ${otherOrganizationId}` },
      ],
    });

    const source = await prisma.dataSource.create({
      data: {
        organizationId,
        name: "E-commerce",
        systemType: "INVENTORY_TEST",
        baseUrl: "https://inventory.example.test",
        recordsPath: "data",
        externalIdField: "id",
      },
    });
    const otherSource = await prisma.dataSource.create({
      data: {
        organizationId: otherOrganizationId,
        name: "Other org source",
        systemType: "INVENTORY_TEST",
        baseUrl: "https://other.example.test",
        recordsPath: "data",
        externalIdField: "id",
      },
    });

    await prisma.sourceRecord.createMany({
      data: [
        {
          organizationId,
          dataSourceId: source.id,
          sourceRecordKey: "rec-1",
          rawPayload: { email: "a@example.com" },
          payloadHash: randomUUID(),
        },
        {
          organizationId,
          dataSourceId: source.id,
          sourceRecordKey: "rec-2",
          rawPayload: { email: "b@example.com" },
          payloadHash: randomUUID(),
        },
      ],
    });
    await prisma.sourceRecord.create({
      data: {
        organizationId: otherOrganizationId,
        dataSourceId: otherSource.id,
        sourceRecordKey: "other-rec-1",
        rawPayload: { email: "c@example.com" },
        payloadHash: randomUUID(),
      },
    });

    // A matched principal (has an ACTIVE identity link).
    const matchedPrincipal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Matched Principal",
        ageStatus: "ADULT",
      },
    });
    const matchedSourceRecord = await prisma.sourceRecord.create({
      data: {
        organizationId,
        dataSourceId: source.id,
        sourceRecordKey: "matched-rec",
        rawPayload: { email: "matched@example.com" },
        payloadHash: randomUUID(),
      },
    });
    const matchedNormalized = await prisma.normalizedRecord.create({
      data: {
        organizationId,
        sourceRecordId: matchedSourceRecord.id,
        fullName: "Matched Principal",
      },
    });
    await prisma.identityLink.create({
      data: {
        organizationId,
        dataPrincipalId: matchedPrincipal.id,
        normalizedRecordId: matchedNormalized.id,
        confidence: "EXACT",
        matchedOn: { fixture: true },
      },
    });

    // An unknown-age-status principal (CH-01 gap).
    await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Unknown Age Principal",
      },
    });

    // A principal with a conflicting field (GO-03 gap).
    const conflictPrincipal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Conflict Principal",
        ageStatus: "ADULT",
      },
    });
    await prisma.principalDataField.create({
      data: {
        organizationId,
        dataPrincipalId: conflictPrincipal.id,
        canonicalField: "EMAIL",
        value: "conflicting@example.com",
        dataCategory: "CONTACT",
        sourceIds: [source.id],
        conflict: true,
      },
    });

    // A pending match candidate.
    const candidateSourceRecord = await prisma.sourceRecord.create({
      data: {
        organizationId,
        dataSourceId: source.id,
        sourceRecordKey: "candidate-rec",
        rawPayload: { email: "candidate@example.com" },
        payloadHash: randomUUID(),
      },
    });
    const candidateNormalized = await prisma.normalizedRecord.create({
      data: {
        organizationId,
        sourceRecordId: candidateSourceRecord.id,
        fullName: "Candidate Principal",
      },
    });
    await prisma.matchCandidate.create({
      data: {
        organizationId,
        normalizedRecordId: candidateNormalized.id,
        dataPrincipalId: matchedPrincipal.id,
        confidence: "POSSIBLE",
        score: 0.5,
        evidence: { fixture: true },
        status: "PENDING",
      },
    });

    // A processor WITH a contract (not a gap).
    const processorWithContract = await prisma.dataRecipient.create({
      data: {
        organizationId,
        name: "Contracted Processor",
        type: "DATA_PROCESSOR",
        contractExists: true,
      },
    });
    // A processor WITHOUT a contract (GO-02 gap). The DB itself enforces
    // "processor_requires_contract" (migration
    // 20260829183100_constraints_and_triggers): an ACTIVE DATA_PROCESSOR
    // row can never have contractExists = false, so this finding can only
    // ever surface for an inactive engagement -- `active: false` here is
    // not incidental, it is the only state the database allows.
    const processorWithoutContract = await prisma.dataRecipient.create({
      data: {
        organizationId,
        name: "Uncontracted Processor",
        type: "DATA_PROCESSOR",
        contractExists: false,
        active: false,
      },
    });

    // A reviewed purpose, fully populated register (RoPA row with data).
    const reviewedPurpose = await prisma.processingPurpose.create({
      data: {
        organizationId,
        code: `REVIEWED-${randomUUID()}`,
        name: "Order Fulfilment",
        description: "Fulfil customer orders",
        lawfulBasis: "CONSENT",
        basisJustification: "Customer consents at checkout",
        dataCategories: ["IDENTITY", "CONTACT"],
        reviewedByEmployeeId: randomUUID(),
        reviewedAt: new Date(),
      },
    });
    await prisma.dataSourcePurpose.create({
      data: { dataSourceId: source.id, purposeId: reviewedPurpose.id },
    });
    await prisma.sharingActivity.create({
      data: {
        organizationId,
        recipientId: processorWithContract.id,
        purposeId: reviewedPurpose.id,
        dataCategories: ["CONTACT"],
        description: "Order fulfilment sharing",
        sourceIds: [source.id],
        startedAt: new Date(),
      },
    });
    await prisma.crossBorderTransfer.create({
      data: {
        organizationId,
        recipientId: processorWithContract.id,
        destinationCountry: "US",
        dataCategories: ["CONTACT"],
        purposeDescription: "Fulfilment logistics",
      },
    });
    await prisma.retentionPolicy.create({
      data: {
        organizationId,
        purposeId: reviewedPurpose.id,
        name: "Standard retention",
        triggerType: "PURPOSE_SERVED",
        retentionValue: 3,
        retentionUnit: "YEARS",
        legalBasisForRetention: "Company policy",
        legalBasisType: "ORG_POLICY",
      },
    });

    // An UNREVIEWED purpose (LB-02 gap) with an entirely empty register --
    // no sources, no recipients, no retention -- to prove the RoPA still
    // emits its row with blank columns rather than omitting it.
    const unreviewedPurpose = await prisma.processingPurpose.create({
      data: {
        organizationId,
        code: `UNREVIEWED-${randomUUID()}`,
        name: "Marketing Email",
        description: "Send marketing email",
        lawfulBasis: "LEGITIMATE_USE",
        legitimateUseLimb: "VOLUNTARY_PROVISION",
        basisJustification: "Legitimate marketing interest",
        dataCategories: ["CONTACT"],
      },
    });

    // Cross-tenant noise: another org's purpose/recipient must never leak
    // into this org's summary/gaps/RoPA.
    await prisma.processingPurpose.create({
      data: {
        organizationId: otherOrganizationId,
        code: `OTHER-${randomUUID()}`,
        name: "Other org purpose",
        description: "Belongs to a different tenant",
        lawfulBasis: "CONSENT",
        basisJustification: "Other org consent",
      },
    });

    const full = await employeeSession(
      organizationId,
      ["CAN_VIEW_PRINCIPALS", "CAN_EXPORT_EVIDENCE"],
      "Full viewer",
    );
    const auditor = await employeeSession(
      organizationId,
      ["CAN_VIEW_PRINCIPALS", "CAN_VIEW_AUDIT_LOG", "CAN_EXPORT_EVIDENCE"],
      "Auditor",
    );

    return {
      organizationId,
      otherOrganizationId,
      reviewedPurposeId: reviewedPurpose.id,
      unreviewedPurposeId: unreviewedPurpose.id,
      processorWithContractId: processorWithContract.id,
      processorWithoutContractId: processorWithoutContract.id,
      full,
      auditor,
    };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await prisma.$connect();
    fixture = await createFixture();
  });

  afterAll(async () => {
    if (organizationIds.length) {
      await prisma.crossBorderTransfer.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.sharingActivity.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.retentionPolicy.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataSourcePurpose.deleteMany({
        where: {
          purposeId: {
            in: [fixture.reviewedPurposeId, fixture.unreviewedPurposeId],
          },
        },
      });
      await prisma.dataRecipient.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.processingPurpose.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.matchCandidate.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.identityLink.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.principalDataField.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.normalizedRecord.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.sourceRecord.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataPrincipal.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataSourceField.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.sourceFieldMapping.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataSource.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      // AuditEvent has no FK to Organization and is append-only (DB
      // triggers reject DELETE outright) -- left in place deliberately,
      // same convention as access-log.e2e-spec.ts / audit.e2e-spec.ts.
      await prisma.refreshToken.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.employee.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { role: { organizationId: { in: organizationIds } } },
      });
      await prisma.role.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${organizationIds})`;
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    await prisma.$disconnect();
    await app.close();
  });

  describe("GET /api/inventory/summary", () => {
    it("matches directly-queried database counts", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/inventory/summary")
        .set(...authenticated(fixture.full));
      expect(response.status).toBe(200);

      const orgWhere = { organizationId: fixture.organizationId };
      const [
        sourceCount,
        rawRecordCount,
        uniquePrincipalCount,
        matchedPrincipalCount,
        pendingReviewCount,
        conflictCount,
        unknownAgeStatusCount,
        purposesWithoutReviewedLawfulBasisCount,
        processorsWithoutContractCount,
      ] = await Promise.all([
        prisma.dataSource.count({ where: orgWhere }),
        prisma.sourceRecord.count({ where: orgWhere }),
        prisma.dataPrincipal.count({ where: orgWhere }),
        prisma.dataPrincipal.count({
          where: { ...orgWhere, links: { some: { status: "ACTIVE" } } },
        }),
        prisma.matchCandidate.count({
          where: { ...orgWhere, status: "PENDING" },
        }),
        prisma.dataPrincipal.count({
          where: { ...orgWhere, fields: { some: { conflict: true } } },
        }),
        prisma.dataPrincipal.count({
          where: { ...orgWhere, ageStatus: "UNKNOWN" },
        }),
        prisma.processingPurpose.count({
          where: { ...orgWhere, reviewedAt: null },
        }),
        prisma.dataRecipient.count({
          where: { ...orgWhere, type: "DATA_PROCESSOR", contractExists: false },
        }),
      ]);

      expect(response.body).toMatchObject({
        sourceCount,
        rawRecordCount,
        uniquePrincipalCount,
        matchedPrincipalCount,
        pendingReviewCount,
        conflictCount,
        unknownAgeStatusCount,
        purposesWithoutReviewedLawfulBasisCount,
        processorsWithoutContractCount,
      });
      expect(sourceCount).toBe(1);
      expect(matchedPrincipalCount).toBe(1);
      expect(pendingReviewCount).toBe(1);
      expect(conflictCount).toBe(1);
      expect(unknownAgeStatusCount).toBe(1);
      expect(purposesWithoutReviewedLawfulBasisCount).toBe(1);
      expect(processorsWithoutContractCount).toBe(1);
      expect(Array.isArray(response.body.recentAuditEvents)).toBe(true);
    });

    it("never leaks another organization's counts", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/inventory/summary")
        .set(...authenticated(fixture.full));
      expect(response.status).toBe(200);
      // Only this org's single source/purpose is visible, not the other
      // org's source/purpose created in the fixture.
      expect(response.body.sourceCount).toBe(1);
    });

    it("rejects a caller without CAN_VIEW_PRINCIPALS", async () => {
      const noPerms = await employeeSession(
        fixture.organizationId,
        [],
        "No perms",
      );
      const response = await request(app.getHttpServer())
        .get("/api/inventory/summary")
        .set(...authenticated(noPerms));
      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/inventory/gaps", () => {
    it("explains each shortfall without asserting compliance", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/inventory/gaps")
        .set(...authenticated(fixture.full));
      expect(response.status).toBe(200);
      const gaps = response.body as Array<{
        code: string;
        count: number;
        explanation: string;
      }>;
      expect(gaps.map((g) => g.code).sort()).toEqual(
        ["CH-01", "GO-02", "GO-03", "LB-02"].sort(),
      );
      for (const gap of gaps) {
        expect(gap.explanation.toLowerCase()).not.toContain("is compliant");
        expect(gap.explanation.toLowerCase()).not.toContain("we comply");
      }
      const lb02 = gaps.find((g) => g.code === "LB-02");
      expect(lb02?.count).toBe(1);
      const ch01 = gaps.find((g) => g.code === "CH-01");
      expect(ch01?.count).toBe(1);
    });
  });

  describe("GET /api/inventory/ropa.csv", () => {
    it("emits one row per purpose, with a blank register column when unpopulated, and writes EVIDENCE_EXPORTED", async () => {
      const before = await prisma.auditEvent.count({
        where: {
          organizationId: fixture.organizationId,
          action: "EVIDENCE_EXPORTED",
        },
      });

      const response = await request(app.getHttpServer())
        .get("/api/inventory/ropa.csv")
        .set(...authenticated(fixture.full));
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");

      const csvText = response.text as string;
      const lines = csvText.split("\r\n").filter((line) => line.length > 0);
      // Header + exactly this org's two purposes (not the other org's).
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe(
        "Purpose Code,Purpose Name,Lawful Basis,Section 7 Limb," +
          "Data Categories,Source Systems,Recipients," +
          "Cross-Border Destinations,Retention Policy,Review Status",
      );

      const reviewedPurpose = await prisma.processingPurpose.findUniqueOrThrow({
        where: { id: fixture.reviewedPurposeId },
      });
      const unreviewedPurpose =
        await prisma.processingPurpose.findUniqueOrThrow({
          where: { id: fixture.unreviewedPurposeId },
        });

      const dataLines = lines.slice(1);
      const reviewedLine = dataLines.find((line) =>
        line.startsWith(reviewedPurpose.code),
      );
      const unreviewedLine = dataLines.find((line) =>
        line.startsWith(unreviewedPurpose.code),
      );
      expect(reviewedLine).toBeDefined();
      expect(unreviewedLine).toBeDefined();

      // The fully-populated purpose: every register column is non-empty.
      expect(reviewedLine).toContain("Contracted Processor");
      expect(reviewedLine).toContain("US");
      expect(reviewedLine).toContain("REVIEWED");

      // The unreviewed purpose has NO recipients, NO sources, NO cross-
      // border transfer and NO retention policy -- its row must still be
      // present (already asserted above) with those columns blank, never
      // omitted.
      const unreviewedFields = unreviewedLine?.split(",") ?? [];
      // [code, name, lawfulBasis, limb, dataCategories, sources, recipients, crossBorder, retention, reviewStatus]
      expect(unreviewedFields[5]).toBe(""); // Source Systems
      expect(unreviewedFields[6]).toBe(""); // Recipients
      expect(unreviewedFields[7]).toBe(""); // Cross-Border Destinations
      expect(unreviewedFields[8]).toBe(""); // Retention Policy
      expect(unreviewedLine).toContain("UNREVIEWED");
      expect(unreviewedLine).toContain("VOLUNTARY_PROVISION");

      const after = await prisma.auditEvent.count({
        where: {
          organizationId: fixture.organizationId,
          action: "EVIDENCE_EXPORTED",
        },
      });
      expect(after - before).toBe(1);

      const exportEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId: fixture.organizationId,
          action: "EVIDENCE_EXPORTED",
        },
        orderBy: { sequence: "desc" },
      });
      expect(
        (exportEvent?.metadata as Record<string, unknown> | undefined)?.[
          "exportType"
        ],
      ).toBe("ROPA");
    });

    it("lets an AUDITOR export but not mutate a purpose", async () => {
      const exportResponse = await request(app.getHttpServer())
        .get("/api/inventory/ropa.csv")
        .set(...authenticated(fixture.auditor));
      expect(exportResponse.status).toBe(200);

      const mutateResponse = await request(app.getHttpServer())
        .post("/api/purposes")
        .set(...authenticated(fixture.auditor))
        .send({
          code: `AUDITOR-ATTEMPT-${randomUUID()}`,
          name: "Should be forbidden",
          description: "An auditor must not be able to create this",
          lawfulBasis: "CONSENT",
          basisJustification: "Attempted write",
        });
      expect(mutateResponse.status).toBe(403);
    });

    it("rejects a caller without CAN_EXPORT_EVIDENCE", async () => {
      const noExport = await employeeSession(
        fixture.organizationId,
        ["CAN_VIEW_PRINCIPALS"],
        "No export",
      );
      const response = await request(app.getHttpServer())
        .get("/api/inventory/ropa.csv")
        .set(...authenticated(noExport));
      expect(response.status).toBe(403);
    });
  });
});
