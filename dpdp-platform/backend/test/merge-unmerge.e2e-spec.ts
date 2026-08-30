import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { AccessTokenPayload } from "../src/modules/auth/token.service";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";
import {
  TenantContext,
  type TenantStore,
} from "../src/common/tenant/tenant-context";
import { AssemblyService } from "../src/modules/identity/assembly.service";
import { LinkingService } from "../src/modules/identity/linking.service";
import { MatchingService } from "../src/modules/identity/matching.service";
import { MergeService } from "../src/modules/identity/merge.service";

/**
 * Task 19: reversible unmerge, the merge (candidate-confirm) path, and the
 * match-candidate review queue -- plus the controller's own load-bearing
 * ruling: a DETACHED link must never be silently reversed by deterministic
 * matching. Spec: line 779 (merge/unmerge), 827-829 (endpoints), 978,
 * Check 9 (lines 1045-1048).
 */
describe("Merge, unmerge and the match-candidate review queue (e2e)", () => {
  let app: INestApplication;
  let matching: MatchingService;
  let linking: LinkingService;
  let assembly: AssemblyService;
  let mergeService: MergeService;
  const prisma = new PrismaService();
  const organizationIds: string[] = [];

  function tenant(organizationId: string): TenantStore {
    return {
      organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: "merge-unmerge-e2e",
    };
  }

  async function organization(): Promise<string> {
    const id = randomUUID();
    organizationIds.push(id);
    await prisma.organization.create({
      data: { id, name: `Merge/unmerge ${id}`, country: "IN" },
    });
    return id;
  }

  async function ensurePermission(code: string): Promise<void> {
    const catalogueEntry = PERMISSIONS.find((p) => p.code === code);
    if (!catalogueEntry) {
      throw new Error(
        `Test requested permission code "${code}" which is not in the ` +
          "real seed catalogue (prisma/seed/permissions.ts).",
      );
    }
    await prisma.permission.upsert({
      where: { code },
      create: catalogueEntry,
      update: {},
    });
  }

  /** One employee whose role holds CAN_RESOLVE_IDENTITIES, logged in for real. */
  async function reviewerFor(
    organizationId: string,
  ): Promise<{ employeeId: string; accessToken: string }> {
    await ensurePermission("CAN_RESOLVE_IDENTITIES");
    const roleName = `REVIEWER_${randomUUID().replace(/-/g, "")}`;
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: roleName,
        name: roleName,
        isSystem: false,
        permissions: { create: [{ permissionCode: "CAN_RESOLVE_IDENTITIES" }] },
      },
    });
    const email = `${roleName.toLowerCase()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: "Reviewer",
        roleId: role.id,
        passwordHash,
        status: "ACTIVE",
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });
    if (loginRes.status !== 200) {
      throw new Error(
        `Fixture login failed for ${email}: ${JSON.stringify(loginRes.body)}`,
      );
    }
    return {
      employeeId: loginRes.body.employee.id as string,
      accessToken: loginRes.body.accessToken as string,
    };
  }

  function actorFor(
    organizationId: string,
    employeeId: string,
  ): AccessTokenPayload {
    return {
      sub: employeeId,
      organizationId,
      actorLabel: "test-reviewer",
      aud: "employee",
      iat: 0,
      exp: 0,
    };
  }

  const scalarMappings = [
    {
      sourceField: "name",
      canonicalField: "FULL_NAME" as const,
      dataCategory: "IDENTITY" as const,
    },
    {
      sourceField: "email",
      canonicalField: "EMAIL" as const,
      dataCategory: "CONTACT" as const,
    },
    {
      sourceField: "phone",
      canonicalField: "PHONE" as const,
      dataCategory: "CONTACT" as const,
    },
  ];

  async function dataSource(
    organizationId: string,
    name: string,
    baseUrl = "https://merge-unmerge.example.test",
  ): Promise<string> {
    return TenantContext.run(tenant(organizationId), async () => {
      const created = await prisma.scoped.dataSource.create({
        data: {
          name,
          systemType: "MERGE_UNMERGE_TEST",
          baseUrl,
          recordsPath: "data",
          externalIdField: "id",
        } as never,
      });
      for (const mapping of scalarMappings) {
        await prisma.scoped.sourceFieldMapping.create({
          data: { dataSourceId: created.id, ...mapping } as never,
        });
      }
      return created.id;
    });
  }

  async function sourceRecordAndNormalized(
    organizationId: string,
    dataSourceId: string,
    values: {
      fullName?: string | null;
      emailNormalized?: string | null;
      phoneNormalized?: string | null;
    },
    lastSeenAt = new Date(),
  ) {
    return TenantContext.run(tenant(organizationId), async () => {
      const sourceRecord = await prisma.scoped.sourceRecord.create({
        data: {
          dataSourceId,
          sourceRecordKey: randomUUID(),
          rawPayload: { immutable: "source payload", ...values },
          payloadHash: randomUUID(),
          lastSeenAt,
        } as never,
      });
      const normalizedRecord = await prisma.scoped.normalizedRecord.create({
        data: {
          sourceRecordId: sourceRecord.id,
          fullName: values.fullName ?? null,
          emailNormalized: values.emailNormalized ?? null,
          phoneNormalized: values.phoneNormalized ?? null,
        } as never,
      });
      return { sourceRecord, normalizedRecord };
    });
  }

  async function principal(organizationId: string, displayName = "Fixture") {
    return TenantContext.run(tenant(organizationId), () =>
      prisma.scoped.dataPrincipal.create({
        data: { reference: `DP-${randomUUID()}`, displayName } as never,
      }),
    );
  }

  async function activeLink(
    organizationId: string,
    dataPrincipalId: string,
    normalizedRecordId: string,
    confidence: "EXACT" | "HIGH" | "POSSIBLE" | "UNMATCHED" = "EXACT",
  ) {
    return TenantContext.run(tenant(organizationId), () =>
      prisma.scoped.identityLink.create({
        data: {
          dataPrincipalId,
          normalizedRecordId,
          confidence,
          matchedOn: { rule: "test" },
        } as never,
      }),
    );
  }

  async function attachIdentifier(
    organizationId: string,
    dataPrincipalId: string,
    type: "EMAIL" | "PHONE" | "CUSTOMER_ID",
    value: string,
  ) {
    return TenantContext.run(tenant(organizationId), () =>
      prisma.scoped.principalIdentifier.create({
        data: { dataPrincipalId, type, value } as never,
      }),
    );
  }

  async function rebuild(organizationId: string, dataPrincipalId: string) {
    await TenantContext.run(tenant(organizationId), () =>
      prisma.scoped.$transaction((tx) => assembly.rebuild(tx, dataPrincipalId)),
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
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
    matching = app.get(MatchingService);
    linking = app.get(LinkingService);
    assembly = app.get(AssemblyService);
    mergeService = app.get(MergeService);
  });

  afterAll(async () => {
    await app.close();
    if (organizationIds.length > 0) {
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${organizationIds})`;
      await prisma.refreshToken.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.matchCandidate.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.principalDataField.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.identityLink.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.principalIdentifier.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataPrincipal.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.normalizedRecord.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.sourceRecord.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.sourceFieldMapping.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataSource.deleteMany({
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
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    await prisma.$disconnect();
  });

  it(
    "unmerges Aman's support record into a new principal, leaves Aman with two, " +
      "leaves SourceRecord untouched, writes both audit events, and updates the " +
      "phone value's sourceIds",
    async () => {
      const org = await organization();
      const { accessToken } = await reviewerFor(org);

      const marketing = await dataSource(org, `marketing-${randomUUID()}`);
      const sales = await dataSource(org, `sales-${randomUUID()}`);
      const support = await dataSource(org, `support-${randomUUID()}`);

      const values = {
        fullName: "Aman Sharma",
        emailNormalized: "aman@example.test",
        phoneNormalized: "+919876543210",
      };
      const marketingRow = await sourceRecordAndNormalized(
        org,
        marketing,
        values,
      );
      const salesRow = await sourceRecordAndNormalized(org, sales, values);
      const supportRow = await sourceRecordAndNormalized(org, support, values);

      const aman = await principal(org, "Aman Sharma");
      await activeLink(org, aman.id, marketingRow.normalizedRecord.id);
      await activeLink(org, aman.id, salesRow.normalizedRecord.id);
      const supportLink = await activeLink(
        org,
        aman.id,
        supportRow.normalizedRecord.id,
      );
      await rebuild(org, aman.id);

      const sourceRecordCountBefore = await TenantContext.run(tenant(org), () =>
        prisma.scoped.sourceRecord.count(),
      );
      expect(sourceRecordCountBefore).toBe(3);

      const phoneBefore = await TenantContext.run(tenant(org), () =>
        prisma.scoped.principalDataField.findFirst({
          where: { dataPrincipalId: aman.id, canonicalField: "PHONE" },
        }),
      );
      expect(phoneBefore?.sourceIds.sort()).toEqual(
        [marketing, sales, support].sort(),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/principals/${aman.id}/unmerge`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          normalizedRecordId: supportRow.normalizedRecord.id,
          reason: "test",
        });

      expect(res.status).toBe(201);
      const newPrincipalId = res.body.newDataPrincipalId as string;
      expect(newPrincipalId).toBeTruthy();
      expect(newPrincipalId).not.toBe(aman.id);

      // Aman now has exactly two ACTIVE links (marketing, sales).
      const amanActiveLinks = await TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.findMany({
          where: { dataPrincipalId: aman.id, status: "ACTIVE" },
        }),
      );
      expect(amanActiveLinks).toHaveLength(2);
      expect(
        amanActiveLinks.map((link) => link.normalizedRecordId).sort(),
      ).toEqual(
        [marketingRow.normalizedRecord.id, salesRow.normalizedRecord.id].sort(),
      );

      // The new principal holds ONLY the detached support record.
      const newPrincipalActiveLinks = await TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.findMany({
          where: { dataPrincipalId: newPrincipalId, status: "ACTIVE" },
        }),
      );
      expect(newPrincipalActiveLinks).toHaveLength(1);
      expect(newPrincipalActiveLinks[0]?.normalizedRecordId).toBe(
        supportRow.normalizedRecord.id,
      );

      // The old link row is DETACHED with the reason, not deleted.
      const detached = await TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.findFirst({ where: { id: supportLink.id } }),
      );
      expect(detached).toMatchObject({
        status: "DETACHED",
        detachReason: "test",
      });
      expect(detached?.detachedAt).not.toBeNull();

      // SourceRecord is never touched by unmerge -- same count, same payload.
      const sourceRecordCountAfter = await TenantContext.run(tenant(org), () =>
        prisma.scoped.sourceRecord.count(),
      );
      expect(sourceRecordCountAfter).toBe(3);
      const supportSourceAfter = await TenantContext.run(tenant(org), () =>
        prisma.scoped.sourceRecord.findFirst({
          where: { id: supportRow.sourceRecord.id },
        }),
      );
      expect(supportSourceAfter?.rawPayload).toEqual(
        supportRow.sourceRecord.rawPayload,
      );

      // Both audit events, in the same organization's log.
      const detachedAudit = await TenantContext.run(tenant(org), () =>
        prisma.scoped.auditEvent.findFirst({
          where: { resourceId: supportLink.id, action: "IDENTITY_DETACHED" },
        }),
      );
      expect(detachedAudit).not.toBeNull();
      const createdAudit = await TenantContext.run(tenant(org), () =>
        prisma.scoped.auditEvent.findFirst({
          where: { resourceId: newPrincipalId, action: "PRINCIPAL_CREATED" },
        }),
      );
      expect(createdAudit).not.toBeNull();
      expect(
        (detachedAudit?.metadata as Record<string, unknown>)[
          "normalizedRecordId"
        ],
      ).toBe(supportRow.normalizedRecord.id);

      // The phone value's sourceIds on Aman's rebuilt profile no longer name
      // the detached (support) source.
      const phoneAfter = await TenantContext.run(tenant(org), () =>
        prisma.scoped.principalDataField.findFirst({
          where: { dataPrincipalId: aman.id, canonicalField: "PHONE" },
        }),
      );
      expect(phoneAfter?.sourceIds.sort()).toEqual([marketing, sales].sort());
      expect(phoneAfter?.sourceIds).not.toContain(support);

      // The new principal's own profile has that phone value, sourced only
      // from support.
      const newPhone = await TenantContext.run(tenant(org), () =>
        prisma.scoped.principalDataField.findFirst({
          where: { dataPrincipalId: newPrincipalId, canonicalField: "PHONE" },
        }),
      );
      expect(newPhone?.sourceIds).toEqual([support]);
    },
  );

  it("rejects unmerging the only linked record of a principal, naming only the id", async () => {
    const org = await organization();
    const { accessToken } = await reviewerFor(org);
    const source = await dataSource(org, `only-source-${randomUUID()}`);
    const row = await sourceRecordAndNormalized(org, source, {
      fullName: "Solo Person",
      emailNormalized: "solo@example.test",
      phoneNormalized: "+919000000000",
    });
    const solo = await principal(org, "Solo Person");
    await activeLink(org, solo.id, row.normalizedRecord.id);
    await rebuild(org, solo.id);

    const res = await request(app.getHttpServer())
      .post(`/api/principals/${solo.id}/unmerge`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ normalizedRecordId: row.normalizedRecord.id, reason: "test" });

    expect(res.status).toBe(400);
    const message = JSON.stringify(res.body);
    expect(message).toContain(solo.id);
    // No personal data (name, email, phone) leaks into the error response.
    expect(message).not.toContain("Solo Person");
    expect(message).not.toContain("solo@example.test");
    expect(message).not.toContain("+919000000000");

    // Nothing changed: still exactly one ACTIVE link, no new principal.
    const activeLinks = await TenantContext.run(tenant(org), () =>
      prisma.scoped.identityLink.count({
        where: { dataPrincipalId: solo.id, status: "ACTIVE" },
      }),
    );
    expect(activeLinks).toBe(1);
    const principalCount = await TenantContext.run(tenant(org), () =>
      prisma.scoped.dataPrincipal.count(),
    );
    expect(principalCount).toBe(1);
  });

  it("confirming a candidate creates exactly one ACTIVE link and rebuilds the principal", async () => {
    const org = await organization();
    const { employeeId, accessToken } = await reviewerFor(org);
    const source = await dataSource(org, `candidate-source-${randomUUID()}`);
    const target = await principal(org, "Vikram Nair");
    const candidateRow = await sourceRecordAndNormalized(org, source, {
      fullName: "Vikram Nair",
      emailNormalized: null,
      phoneNormalized: null,
    });

    const candidate = await TenantContext.run(tenant(org), () =>
      prisma.scoped.matchCandidate.create({
        data: {
          normalizedRecordId: candidateRow.normalizedRecord.id,
          dataPrincipalId: target.id,
          confidence: "POSSIBLE",
          score: 0.6,
          evidence: { rule: "SUPPORTING_SIGNAL", signals: ["POSTAL_CODE"] },
        } as never,
      }),
    );

    // Positive control: before confirming, the record has no active link.
    const beforeLinks = await TenantContext.run(tenant(org), () =>
      prisma.scoped.identityLink.count({
        where: { normalizedRecordId: candidateRow.normalizedRecord.id },
      }),
    );
    expect(beforeLinks).toBe(0);

    const res = await request(app.getHttpServer())
      .post(`/api/match-candidates/${candidate.id}/confirm`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send();
    expect(res.status).toBe(201);

    const links = await TenantContext.run(tenant(org), () =>
      prisma.scoped.identityLink.findMany({
        where: { normalizedRecordId: candidateRow.normalizedRecord.id },
      }),
    );
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      status: "ACTIVE",
      dataPrincipalId: target.id,
      confidence: "POSSIBLE",
      linkedByEmployeeId: employeeId,
    });

    const updatedCandidate = await TenantContext.run(tenant(org), () =>
      prisma.scoped.matchCandidate.findFirst({ where: { id: candidate.id } }),
    );
    expect(updatedCandidate).toMatchObject({
      status: "CONFIRMED",
    });
    expect(updatedCandidate?.decidedByEmployeeId).not.toBeNull();
    expect(updatedCandidate?.decidedAt).not.toBeNull();

    // Rebuilt: the principal's profile now carries the record's FULL_NAME.
    const fullNameField = await TenantContext.run(tenant(org), () =>
      prisma.scoped.principalDataField.findFirst({
        where: { dataPrincipalId: target.id, canonicalField: "FULL_NAME" },
      }),
    );
    expect(fullNameField).toMatchObject({
      value: "Vikram Nair",
      sourceIds: [source],
    });

    const audit = await TenantContext.run(tenant(org), () =>
      prisma.scoped.auditEvent.findFirst({
        where: {
          resourceId: candidate.id,
          action: "MATCH_CANDIDATE_CONFIRMED",
        },
      }),
    );
    expect(audit).not.toBeNull();
  });

  it(
    "confirming a candidate re-parents its existing ACTIVE link and rebuilds " +
      "both affected profiles",
    async () => {
      const org = await organization();
      const { accessToken } = await reviewerFor(org);
      const source = await dataSource(org, `reparent-source-${randomUUID()}`);
      const oldPrincipal = await principal(org, "Old Owner");
      const targetPrincipal = await principal(org, "Correct Owner");
      const row = await sourceRecordAndNormalized(org, source, {
        fullName: "Correct Owner",
        emailNormalized: "correct@example.test",
        phoneNormalized: "+919333333333",
      });
      const oldLink = await activeLink(
        org,
        oldPrincipal.id,
        row.normalizedRecord.id,
      );
      await rebuild(org, oldPrincipal.id);
      const candidate = await TenantContext.run(tenant(org), () =>
        prisma.scoped.matchCandidate.create({
          data: {
            normalizedRecordId: row.normalizedRecord.id,
            dataPrincipalId: targetPrincipal.id,
            confidence: "EXACT",
            score: 0.8,
            evidence: { conflict: "EMAIL→correct principal" },
          } as never,
        }),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/match-candidates/${candidate.id}/confirm`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send();
      expect(res.status).toBe(201);

      // A merge changes the existing link's parent; it never creates a
      // second ACTIVE link for the same normalized record.
      const links = await TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.findMany({
          where: { normalizedRecordId: row.normalizedRecord.id },
        }),
      );
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        id: oldLink.id,
        status: "ACTIVE",
        dataPrincipalId: targetPrincipal.id,
        confidence: "EXACT",
      });

      // Both sides are rebuilt in the confirmation transaction: the old
      // profile loses its only assembled field and the target gains it.
      const [oldFields, targetField] = await TenantContext.run(
        tenant(org),
        () =>
          Promise.all([
            prisma.scoped.principalDataField.findMany({
              where: { dataPrincipalId: oldPrincipal.id },
            }),
            prisma.scoped.principalDataField.findFirst({
              where: {
                dataPrincipalId: targetPrincipal.id,
                canonicalField: "EMAIL",
              },
            }),
          ]),
      );
      expect(oldFields).toHaveLength(0);
      expect(targetField).toMatchObject({
        value: "correct@example.test",
        sourceIds: [source],
      });
    },
  );

  it("lists pending candidates with side-by-side agreeing and conflicting signals", async () => {
    const org = await organization();
    const { accessToken } = await reviewerFor(org);
    const source = await dataSource(org, `queue-source-${randomUUID()}`);
    const target = await principal(org, "Queue Principal");
    const targetRow = await sourceRecordAndNormalized(org, source, {
      fullName: "Queue Principal",
      emailNormalized: "shared@example.test",
      phoneNormalized: "+919444444444",
    });
    await activeLink(org, target.id, targetRow.normalizedRecord.id);
    await rebuild(org, target.id);

    const candidateRow = await sourceRecordAndNormalized(org, source, {
      fullName: "Queue Principal",
      emailNormalized: "shared@example.test",
      phoneNormalized: "+919555555555",
    });
    const pending = await TenantContext.run(tenant(org), () =>
      prisma.scoped.matchCandidate.create({
        data: {
          normalizedRecordId: candidateRow.normalizedRecord.id,
          dataPrincipalId: target.id,
          confidence: "POSSIBLE",
          score: 0.7,
          evidence: { rule: "SUPPORTING_SIGNAL" },
        } as never,
      }),
    );
    const rejectedRow = await sourceRecordAndNormalized(org, source, {
      fullName: "History Only",
    });
    await TenantContext.run(tenant(org), () =>
      prisma.scoped.matchCandidate.create({
        data: {
          normalizedRecordId: rejectedRow.normalizedRecord.id,
          dataPrincipalId: target.id,
          confidence: "POSSIBLE",
          score: 0.5,
          evidence: { rule: "SUPPORTING_SIGNAL" },
          status: "REJECTED",
          decidedByEmployeeId: "historic-decider",
          decidedAt: new Date(),
        } as never,
      }),
    );

    const pendingRes = await request(app.getHttpServer())
      .get("/api/match-candidates")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body).toHaveLength(1);
    expect(pendingRes.body[0]).toMatchObject({
      id: pending.id,
      status: "PENDING",
      record: {
        normalizedRecordId: candidateRow.normalizedRecord.id,
        sourceRecordId: candidateRow.sourceRecord.id,
        dataSourceId: source,
        fullName: "Queue Principal",
        emailNormalized: "shared@example.test",
        phoneNormalized: "+919555555555",
      },
      principal: {
        dataPrincipalId: target.id,
        reference: target.reference,
        displayName: "Queue Principal",
      },
    });
    const signals = pendingRes.body[0].signals as Array<{
      canonicalField: string;
      recordValue: string | null;
      principalValue: string | null;
      agreement: string;
    }>;
    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalField: "EMAIL",
          recordValue: "shared@example.test",
          principalValue: "shared@example.test",
          agreement: "AGREE",
        }),
        expect.objectContaining({
          canonicalField: "PHONE",
          recordValue: "+919555555555",
          principalValue: "+919444444444",
          agreement: "CONFLICT",
        }),
      ]),
    );

    const historyRes = await request(app.getHttpServer())
      .get("/api/match-candidates?status=REJECTED")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body).toHaveLength(1);
    expect(historyRes.body[0]).toMatchObject({ status: "REJECTED" });
  });

  it("rejecting a candidate prevents it from being re-raised on a later sync", async () => {
    const org = await organization();
    const { accessToken } = await reviewerFor(org);
    const source = await dataSource(org, `reject-source-${randomUUID()}`);
    const target = await principal(org, "Some Principal");
    const row = await sourceRecordAndNormalized(org, source, {
      fullName: "Duplicate Name",
      emailNormalized: null,
      phoneNormalized: null,
    });

    const candidate = await TenantContext.run(tenant(org), () =>
      prisma.scoped.matchCandidate.create({
        data: {
          normalizedRecordId: row.normalizedRecord.id,
          dataPrincipalId: target.id,
          confidence: "POSSIBLE",
          score: 0.5,
          evidence: { rule: "SUPPORTING_SIGNAL", signals: ["POSTAL_CODE"] },
        } as never,
      }),
    );

    const res = await request(app.getHttpServer())
      .post(`/api/match-candidates/${candidate.id}/reject`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send();
    expect(res.status).toBe(201);

    const rejected = await TenantContext.run(tenant(org), () =>
      prisma.scoped.matchCandidate.findFirst({ where: { id: candidate.id } }),
    );
    expect(rejected).toMatchObject({ status: "REJECTED" });
    expect(rejected?.decidedByEmployeeId).not.toBeNull();

    const rejectAudit = await TenantContext.run(tenant(org), () =>
      prisma.scoped.auditEvent.findFirst({
        where: { resourceId: candidate.id, action: "MATCH_CANDIDATE_REJECTED" },
      }),
    );
    expect(rejectAudit).not.toBeNull();

    // Simulate the exact same candidate being raised again on a later sync
    // (matching would independently re-derive the same evidence): this is
    // the "already covered by existing code" property from the brief --
    // LinkingService.createCandidate's pre-check is unconditional on
    // status, and the schema's unique constraint backs it, so no new
    // PENDING row is created and the REJECTED one is left exactly as is.
    const applied = await TenantContext.run(tenant(org), () =>
      prisma.scoped.$transaction((tx) =>
        linking.applyMatch(
          tx,
          {
            id: row.normalizedRecord.id,
            fullName: row.normalizedRecord.fullName,
            firstName: null,
            lastName: null,
            emailNormalized: null,
            phoneNormalized: null,
            customerId: null,
          },
          {
            kind: "CANDIDATE",
            dataPrincipalId: target.id,
            confidence: "POSSIBLE",
            score: 0.5,
            evidence: { rule: "SUPPORTING_SIGNAL", signals: ["POSTAL_CODE"] },
          },
        ),
      ),
    );
    expect(applied.candidatesCreated).toBe(0);

    const candidatesForPair = await TenantContext.run(tenant(org), () =>
      prisma.scoped.matchCandidate.findMany({
        where: {
          normalizedRecordId: row.normalizedRecord.id,
          dataPrincipalId: target.id,
        },
      }),
    );
    expect(candidatesForPair).toHaveLength(1);
    expect(candidatesForPair[0]).toMatchObject({ status: "REJECTED" });
  });

  it(
    "suppresses auto-linking onto a DETACHED pair and raises a candidate instead " +
      "(LinkingService.applyMatch, the exact mechanism the controller ruled on)",
    async () => {
      const org = await organization();
      const source = await dataSource(org, `detached-suppress-${randomUUID()}`);
      const original = await principal(org, "Original Owner");
      await TenantContext.run(tenant(org), () =>
        prisma.scoped.principalIdentifier.create({
          data: {
            dataPrincipalId: original.id,
            type: "PHONE",
            value: "+919111111111",
          } as never,
        }),
      );
      const row = await sourceRecordAndNormalized(org, source, {
        fullName: "Whoever",
        phoneNormalized: "+919111111111",
      });

      // A DETACHED link on this exact (record, principal) pair, with NO
      // active link at all for the record -- the state that would exist
      // right after an unmerge if a future change ever let this record end
      // up momentarily unlinked (e.g. a naive "just re-run matching"
      // implementation of the new-principal link, which this test's very
      // next assertion proves would otherwise walk straight back to
      // `original`).
      await TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.create({
          data: {
            dataPrincipalId: original.id,
            normalizedRecordId: row.normalizedRecord.id,
            confidence: "HIGH",
            matchedOn: { rule: "test" },
            status: "DETACHED",
            detachedAt: new Date(),
            detachReason: "test unmerge",
          } as never,
        }),
      );

      const matchResult = await TenantContext.run(tenant(org), () =>
        matching.match(
          prisma.scoped,
          {
            id: row.normalizedRecord.id,
            customerId: null,
            emailNormalized: null,
            phoneNormalized: "+919111111111",
            nameKey: null,
            postalCode: null,
            dateOfBirth: null,
          },
          [],
        ),
      );
      // The identifier genuinely still resolves to `original` -- the
      // matcher has no idea a human ever detached this pair.
      expect(matchResult).toMatchObject({
        kind: "LINK",
        dataPrincipalId: original.id,
        confidence: "HIGH",
      });

      const applied = await TenantContext.run(tenant(org), () =>
        prisma.scoped.$transaction((tx) =>
          linking.applyMatch(
            tx,
            {
              id: row.normalizedRecord.id,
              fullName: "Whoever",
              firstName: null,
              lastName: null,
              emailNormalized: null,
              phoneNormalized: "+919111111111",
              customerId: null,
            },
            matchResult,
          ),
        ),
      );

      expect(applied.linkCreated).toBe(false);
      expect(applied.dataPrincipalId).toBeNull();
      expect(applied.candidatesCreated).toBe(1);

      // No ACTIVE link was created -- the detach was NOT silently reversed.
      const activeLinkCount = await TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.count({
          where: {
            normalizedRecordId: row.normalizedRecord.id,
            status: "ACTIVE",
          },
        }),
      );
      expect(activeLinkCount).toBe(0);

      const candidate = await TenantContext.run(tenant(org), () =>
        prisma.scoped.matchCandidate.findFirst({
          where: {
            normalizedRecordId: row.normalizedRecord.id,
            dataPrincipalId: original.id,
          },
        }),
      );
      expect(candidate).toMatchObject({
        status: "PENDING",
        confidence: "HIGH",
      });
      expect(candidate?.evidence).toMatchObject({
        rule: "DETACHED_LINK_SUPPRESSED",
      });

      const candidateAudit = await TenantContext.run(tenant(org), () =>
        prisma.scoped.auditEvent.findFirst({
          where: {
            resourceId: candidate?.id ?? "",
            action: "MATCH_CANDIDATE_CREATED",
          },
        }),
      );
      expect(candidateAudit).not.toBeNull();
    },
  );

  it(
    "keeps an unmerged record with its new principal across a resync whose payload " +
      "changed, instead of reverting it to the original principal",
    async () => {
      const org = await organization();
      const { employeeId } = await reviewerFor(org);
      const source = await dataSource(org, `resync-${randomUUID()}`);

      const marketingRow = await sourceRecordAndNormalized(org, source, {
        fullName: "Resync Person",
        emailNormalized: "resync@example.test",
        phoneNormalized: "+919222222222",
      });
      const supportRow = await sourceRecordAndNormalized(org, source, {
        fullName: "Resync Person",
        emailNormalized: "resync@example.test",
        phoneNormalized: "+919222222222",
      });

      const original = await principal(org, "Resync Person");
      await attachIdentifier(org, original.id, "EMAIL", "resync@example.test");
      await attachIdentifier(org, original.id, "PHONE", "+919222222222");
      await activeLink(org, original.id, marketingRow.normalizedRecord.id);
      const supportLink = await activeLink(
        org,
        original.id,
        supportRow.normalizedRecord.id,
      );
      await rebuild(org, original.id);

      const unmergeResult = await TenantContext.run(tenant(org), () =>
        mergeService.unmerge(
          original.id,
          supportRow.normalizedRecord.id,
          "test",
          actorFor(org, employeeId),
        ),
      );
      const newPrincipalId = unmergeResult.newDataPrincipalId;

      // Simulate a later resync that genuinely re-evaluates this exact
      // record: change its payload hash and re-run the pipeline's own
      // MATCH -> LINK stage (`MatchingService.match` +
      // `LinkingService.applyMatch`, called with the exact same signature
      // `SyncPipelineService.processRecord` uses for a changed record).
      const rawPayload = {
        immutable: "source payload",
        fullName: "Resync Person",
        emailNormalized: "resync@example.test",
        phoneNormalized: "+919222222222",
        ticketCount: 2,
      };
      await TenantContext.run(tenant(org), () =>
        prisma.scoped.sourceRecord.update({
          where: { id: supportRow.sourceRecord.id },
          data: { rawPayload: rawPayload as never, payloadHash: randomUUID() },
        }),
      );
      const mappings = await TenantContext.run(tenant(org), () =>
        prisma.scoped.sourceFieldMapping.findMany({
          where: { dataSourceId: source },
        }),
      );
      const matchResult = await TenantContext.run(tenant(org), () =>
        matching.match(
          prisma.scoped,
          {
            id: supportRow.normalizedRecord.id,
            customerId: null,
            emailNormalized: "resync@example.test",
            phoneNormalized: "+919222222222",
            nameKey: null,
            postalCode: null,
            dateOfBirth: null,
          },
          mappings,
        ),
      );
      // Deterministic evidence still points at the ORIGINAL principal --
      // the identifier ownership never moved.
      expect(matchResult).toMatchObject({
        kind: "LINK",
        dataPrincipalId: original.id,
      });

      await TenantContext.run(tenant(org), () =>
        prisma.scoped.$transaction((tx) =>
          linking.applyMatch(
            tx,
            {
              id: supportRow.normalizedRecord.id,
              fullName: "Resync Person",
              firstName: null,
              lastName: null,
              emailNormalized: "resync@example.test",
              phoneNormalized: "+919222222222",
              customerId: null,
            },
            matchResult,
            mappings,
          ),
        ),
      );

      // The record's ACTIVE link still points at the NEW principal --
      // matching never got a chance to overrule an already-active link,
      // and if it ever momentarily could, the DETACHED-pair check above
      // stops it from landing back on `original`.
      const activeLinkAfter = await TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.findFirst({
          where: {
            normalizedRecordId: supportRow.normalizedRecord.id,
            status: "ACTIVE",
          },
        }),
      );
      expect(activeLinkAfter?.dataPrincipalId).toBe(newPrincipalId);
      expect(activeLinkAfter?.dataPrincipalId).not.toBe(original.id);

      const detachedStillDetached = await TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.findFirst({
          where: { id: supportLink.id },
        }),
      );
      expect(detachedStillDetached?.status).toBe("DETACHED");

      const originalActiveLinks = await TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.count({
          where: { dataPrincipalId: original.id, status: "ACTIVE" },
        }),
      );
      expect(originalActiveLinks).toBe(1);

      const sourceRecordCount = await TenantContext.run(tenant(org), () =>
        prisma.scoped.sourceRecord.count(),
      );
      expect(sourceRecordCount).toBe(2);
    },
  );
});
