import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import type { NormalizedRecord } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  TenantContext,
  type TenantStore,
} from "../src/common/tenant/tenant-context";
import { LinkingService } from "../src/modules/identity/linking.service";
import {
  MatchingService,
  type MatchResult,
} from "../src/modules/identity/matching.service";
import type { NormalizationMapping } from "../src/modules/normalization/normalization.service";

describe("Deterministic identity matching (e2e)", () => {
  let app: INestApplication;
  let matching: MatchingService;
  let linking: LinkingService;
  const prisma = new PrismaService();
  const organizationIds: string[] = [];

  const verifiedCustomerMapping: readonly NormalizationMapping[] = [
    {
      sourceField: "customerId",
      canonicalField: "CUSTOMER_ID",
      dataCategory: "IDENTITY",
      containsPersonalData: true,
      isVerifiedCustomerId: true,
    },
  ];
  const unverifiedCustomerMapping: readonly NormalizationMapping[] = [
    {
      sourceField: "customerId",
      canonicalField: "CUSTOMER_ID",
      dataCategory: "IDENTITY",
      containsPersonalData: true,
      isVerifiedCustomerId: false,
    },
  ];

  function tenant(organizationId: string): TenantStore {
    return {
      organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: "identity-e2e",
    };
  }

  async function organization(): Promise<string> {
    const id = randomUUID();
    organizationIds.push(id);
    await prisma.organization.create({
      data: { id, name: `Identity matching ${id}`, country: "IN" },
    });
    return id;
  }

  async function record(
    organizationId: string,
    values: Partial<
      Pick<
        NormalizedRecord,
        | "fullName"
        | "firstName"
        | "lastName"
        | "customerId"
        | "emailNormalized"
        | "phoneNormalized"
        | "nameKey"
        | "postalCode"
        | "dateOfBirth"
      >
    >,
  ): Promise<NormalizedRecord> {
    return TenantContext.run(tenant(organizationId), async () => {
      const dataSource = await prisma.scoped.dataSource.create({
        data: {
          name: `Identity source ${randomUUID()}`,
          systemType: "IDENTITY_TEST",
          baseUrl: "https://identity.example.test",
          recordsPath: "records",
          externalIdField: "id",
        } as never,
      });
      const sourceRecord = await prisma.scoped.sourceRecord.create({
        data: {
          dataSourceId: dataSource.id,
          sourceRecordKey: randomUUID(),
          rawPayload: { immutable: "source payload" },
          payloadHash: randomUUID(),
        } as never,
      });
      return prisma.scoped.normalizedRecord.create({
        data: {
          sourceRecordId: sourceRecord.id,
          fullName: values.fullName ?? null,
          firstName: values.firstName ?? null,
          lastName: values.lastName ?? null,
          customerId: values.customerId ?? null,
          emailNormalized: values.emailNormalized ?? null,
          phoneNormalized: values.phoneNormalized ?? null,
          nameKey: values.nameKey ?? null,
          postalCode: values.postalCode ?? null,
          dateOfBirth: values.dateOfBirth ?? null,
        } as never,
      });
    });
  }

  async function principal(
    organizationId: string,
    reference: string,
    identifiers: Array<{
      type: "CUSTOMER_ID" | "EMAIL" | "PHONE";
      value: string;
    }>,
  ) {
    return TenantContext.run(tenant(organizationId), async () => {
      const created = await prisma.scoped.dataPrincipal.create({
        data: { reference, displayName: `Fixture ${reference}` } as never,
      });
      for (const identifier of identifiers) {
        await prisma.scoped.principalIdentifier.create({
          data: { dataPrincipalId: created.id, ...identifier } as never,
        });
      }
      return created;
    });
  }

  async function apply(
    organizationId: string,
    normalizedRecord: NormalizedRecord,
    result: MatchResult,
    mappings: readonly NormalizationMapping[] = [],
  ) {
    return TenantContext.run(tenant(organizationId), () =>
      prisma.scoped.$transaction((tx) =>
        linking.applyMatch(tx, normalizedRecord, result, mappings),
      ),
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    matching = app.get(MatchingService);
    linking = app.get(LinkingService);
    await prisma.$connect();
  });

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await prisma.matchCandidate.deleteMany({
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
      await prisma.dataSource.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.counter.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    await app.close();
    await prisma.$disconnect();
  });

  it("applies rules 1-3 only through verified customer IDs and exact normalized identifiers", async () => {
    const org = await organization();
    const customer = await principal(org, "DP-CUSTOMER", [
      { type: "CUSTOMER_ID", value: "C-42" },
    ]);
    const email = await principal(org, "DP-EMAIL", [
      { type: "EMAIL", value: "aman@example.test" },
    ]);
    const phone = await principal(org, "DP-PHONE", [
      { type: "PHONE", value: "+919876543210" },
    ]);

    const unverified = await record(org, {
      customerId: "C-42",
      fullName: "Unverified",
    });
    await expect(
      TenantContext.run(tenant(org), () =>
        matching.match(unverified, unverifiedCustomerMapping),
      ),
    ).resolves.toEqual({ kind: "NEW" });

    const customerRecord = await record(org, { customerId: "C-42" });
    const emailRecord = await record(org, {
      emailNormalized: "aman@example.test",
    });
    const phoneRecord = await record(org, { phoneNormalized: "+919876543210" });
    const customerMatch = await TenantContext.run(tenant(org), () =>
      matching.match(customerRecord, verifiedCustomerMapping),
    );
    const emailMatch = await TenantContext.run(tenant(org), () =>
      matching.match(emailRecord, []),
    );
    const phoneMatch = await TenantContext.run(tenant(org), () =>
      matching.match(phoneRecord, []),
    );

    expect(customerMatch).toMatchObject({
      kind: "LINK",
      dataPrincipalId: customer.id,
      confidence: "EXACT",
    });
    expect(emailMatch).toMatchObject({
      kind: "LINK",
      dataPrincipalId: email.id,
      confidence: "EXACT",
    });
    expect(phoneMatch).toMatchObject({
      kind: "LINK",
      dataPrincipalId: phone.id,
      confidence: "HIGH",
    });
  });

  it("raises only a POSSIBLE supporting candidate and preserves both Rahul Vermas as separate principals", async () => {
    const org = await organization();
    const firstRahul = await record(org, {
      fullName: "Rahul Verma",
      nameKey: "rahul verma",
      postalCode: "411001",
    });
    const firstResult = await TenantContext.run(tenant(org), () =>
      matching.match(firstRahul, []),
    );
    const firstApplied = await apply(org, firstRahul, firstResult);
    expect(firstApplied.linkCreated).toBe(true);
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.sourceRecord.findFirst({
          where: { id: firstRahul.sourceRecordId },
          select: { rawPayload: true },
        }),
      ),
    ).resolves.toEqual({ rawPayload: { immutable: "source payload" } });

    const supportingRahul = await record(org, {
      fullName: "Rahul Verma",
      nameKey: "rahul verma",
      postalCode: "411001",
    });
    const candidateResult = await TenantContext.run(tenant(org), () =>
      matching.match(supportingRahul, []),
    );
    expect(candidateResult).toMatchObject({
      kind: "CANDIDATE",
      confidence: "POSSIBLE",
    });
    const candidateApplied = await apply(org, supportingRahul, candidateResult);
    expect(candidateApplied.linkCreated).toBe(false);
    expect(candidateApplied.candidatesCreated).toBe(1);
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.identityLink.count({
          where: { normalizedRecordId: supportingRahul.id, status: "ACTIVE" },
        }),
      ),
    ).resolves.toBe(0);

    const secondRahul = await record(org, {
      fullName: "Rahul Verma",
      nameKey: "rahul verma",
      postalCode: "560001",
    });
    const secondResult = await TenantContext.run(tenant(org), () =>
      matching.match(secondRahul, []),
    );
    expect(secondResult).toEqual({ kind: "NEW" });
    await apply(org, secondRahul, secondResult);
    await expect(
      TenantContext.run(tenant(org), () => prisma.scoped.dataPrincipal.count()),
    ).resolves.toBe(2);
  });

  it("links the exact email principal, records the phone conflict candidate, and is idempotent", async () => {
    const org = await organization();
    const emailPrincipal = await principal(org, "A", [
      { type: "EMAIL", value: "aman@example.test" },
    ]);
    const phonePrincipal = await principal(org, "B", [
      { type: "PHONE", value: "+919876543210" },
    ]);
    const normalized = await record(org, {
      emailNormalized: "aman@example.test",
      phoneNormalized: "+919876543210",
    });
    const result = await TenantContext.run(tenant(org), () =>
      matching.match(normalized, []),
    );
    expect(result).toMatchObject({
      kind: "LINK",
      dataPrincipalId: emailPrincipal.id,
      confidence: "EXACT",
      candidates: [
        {
          dataPrincipalId: phonePrincipal.id,
          evidence: { conflict: "EMAIL→A, PHONE→B" },
        },
      ],
    });

    expect(await apply(org, normalized, result)).toMatchObject({
      linkCreated: true,
      candidatesCreated: 1,
    });
    expect(await apply(org, normalized, result)).toMatchObject({
      linkCreated: false,
      candidatesCreated: 0,
    });
    const links = await TenantContext.run(tenant(org), () =>
      prisma.scoped.identityLink.findMany({
        where: { normalizedRecordId: normalized.id, status: "ACTIVE" },
      }),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.dataPrincipalId).toBe(emailPrincipal.id);
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.matchCandidate.count({
          where: {
            normalizedRecordId: normalized.id,
            dataPrincipalId: phonePrincipal.id,
          },
        }),
      ),
    ).resolves.toBe(1);
    const candidate = await TenantContext.run(tenant(org), () =>
      prisma.scoped.matchCandidate.findFirst({
        where: {
          normalizedRecordId: normalized.id,
          dataPrincipalId: phonePrincipal.id,
        },
        select: { id: true },
      }),
    );
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.auditEvent.findFirst({
          where: { resourceId: candidate?.id ?? "" },
          select: { action: true },
        }),
      ),
    ).resolves.toEqual({ action: "MATCH_CANDIDATE_CREATED" });
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.auditEvent.findMany({
          where: { resourceId: { in: [links[0]?.id ?? ""] } },
          select: { action: true },
        }),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "IDENTITY_LINKED" }),
      ]),
    );
  });

  it("keeps identifiers tenant-local and proves Postgres enforces one active link", async () => {
    const orgA = await organization();
    const orgB = await organization();
    await principal(orgA, "DP-A", [
      { type: "EMAIL", value: "foreign@example.test" },
    ]);
    const normalized = await record(orgB, {
      emailNormalized: "foreign@example.test",
    });
    const result = await TenantContext.run(tenant(orgB), () =>
      matching.match(normalized, []),
    );
    expect(result).toEqual({ kind: "NEW" });
    const applied = await apply(orgB, normalized, result);
    const secondPrincipal = await principal(orgB, "DP-SECOND", []);

    await expect(
      prisma.identityLink.create({
        data: {
          organizationId: orgB,
          dataPrincipalId: secondPrincipal.id,
          normalizedRecordId: normalized.id,
          confidence: "EXACT",
          matchedOn: { rule: "test" },
          status: "ACTIVE",
        },
      }),
    ).rejects.toMatchObject({
      code: "P2002",
      meta: { target: ["normalizedRecordId"] },
    });

    const events = await TenantContext.run(tenant(orgB), () =>
      prisma.scoped.auditEvent.findMany({
        where: { subjectPrincipalId: applied.dataPrincipalId ?? undefined },
        select: { action: true },
      }),
    );
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining(["PRINCIPAL_CREATED", "IDENTITY_LINKED"]),
    );
  });
});
