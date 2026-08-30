import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CanonicalField, DataCategory } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  TenantContext,
  type TenantStore,
} from "../src/common/tenant/tenant-context";
import { AgeService } from "../src/modules/identity/age.service";
import { AssemblyService } from "../src/modules/identity/assembly.service";
import { LinkingService } from "../src/modules/identity/linking.service";

describe("profile assembly and DOB-only age derivation (e2e)", () => {
  let app: INestApplication;
  let assembly: AssemblyService;
  let age: AgeService;
  let linking: LinkingService;
  const prisma = new PrismaService();
  const organizationIds: string[] = [];

  function tenant(organizationId: string): TenantStore {
    return {
      organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: "assembly-e2e",
    };
  }

  async function organization(): Promise<string> {
    const id = randomUUID();
    organizationIds.push(id);
    await prisma.organization.create({
      data: { id, name: `Assembly ${id}`, country: "IN" },
    });
    return id;
  }

  async function source(
    organizationId: string,
    name: string,
    fields: Array<{
      sourceField: string;
      canonicalField: CanonicalField;
      dataCategory: DataCategory;
    }>,
    lastSeenAt: Date,
  ) {
    return TenantContext.run(tenant(organizationId), async () => {
      const dataSource = await prisma.scoped.dataSource.create({
        data: {
          name,
          systemType: "ASSEMBLY_TEST",
          baseUrl: "https://assembly.example.test",
          recordsPath: "data",
          externalIdField: "id",
        } as never,
      });
      await Promise.all(
        fields.map((field) =>
          prisma.scoped.sourceFieldMapping.create({
            data: { dataSourceId: dataSource.id, ...field } as never,
          }),
        ),
      );
      const sourceRecord = await prisma.scoped.sourceRecord.create({
        data: {
          dataSourceId: dataSource.id,
          sourceRecordKey: randomUUID(),
          rawPayload: {},
          payloadHash: randomUUID(),
          lastSeenAt,
        } as never,
      });
      return { dataSource, sourceRecord };
    });
  }

  async function normalized(
    organizationId: string,
    sourceRecordId: string,
    values: Record<string, unknown>,
  ) {
    return TenantContext.run(tenant(organizationId), () =>
      prisma.scoped.normalizedRecord.create({
        data: { sourceRecordId, ...values } as never,
      }),
    );
  }

  async function principal(
    organizationId: string,
    displayName = "Existing person",
  ) {
    return TenantContext.run(tenant(organizationId), () =>
      prisma.scoped.dataPrincipal.create({
        data: { reference: `DP-${randomUUID()}`, displayName } as never,
      }),
    );
  }

  async function link(
    organizationId: string,
    dataPrincipalId: string,
    normalizedRecordId: string,
  ) {
    return TenantContext.run(tenant(organizationId), () =>
      prisma.scoped.identityLink.create({
        data: {
          dataPrincipalId,
          normalizedRecordId,
          confidence: "EXACT",
          matchedOn: { rule: "test" },
        } as never,
      }),
    );
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    assembly = app.get(AssemblyService);
    age = app.get(AgeService);
    linking = app.get(LinkingService);
    await prisma.$connect();
  });

  afterAll(async () => {
    if (organizationIds.length) {
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

  it("unions three-source lineage, preserves city conflicts, and removes detached values on rebuild", async () => {
    const org = await organization();
    const mappings = [
      {
        sourceField: "email",
        canonicalField: "EMAIL" as const,
        dataCategory: "CONTACT" as const,
      },
      {
        sourceField: "city",
        canonicalField: "CITY" as const,
        dataCategory: "LOCATION" as const,
      },
    ];
    const marketing = await source(
      org,
      `marketing-${randomUUID()}`,
      mappings,
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const sales = await source(
      org,
      `sales-${randomUUID()}`,
      mappings,
      new Date("2026-02-01T00:00:00.000Z"),
    );
    const support = await source(
      org,
      `support-${randomUUID()}`,
      mappings,
      new Date("2026-03-01T00:00:00.000Z"),
    );
    const principalRow = await principal(org);
    const marketingRecord = await normalized(org, marketing.sourceRecord.id, {
      emailNormalized: "aman@example.test",
      city: "Pune",
    });
    const salesRecord = await normalized(org, sales.sourceRecord.id, {
      emailNormalized: "aman@example.test",
      city: "Mumbai",
    });
    const supportRecord = await normalized(org, support.sourceRecord.id, {
      emailNormalized: "aman@example.test",
      city: "Pune",
    });
    await link(org, principalRow.id, marketingRecord.id);
    const salesLink = await link(org, principalRow.id, salesRecord.id);
    await link(org, principalRow.id, supportRecord.id);

    await TenantContext.run(tenant(org), () =>
      prisma.scoped.$transaction((tx) => assembly.rebuild(tx, principalRow.id)),
    );
    const beforeDetach = await TenantContext.run(tenant(org), () =>
      prisma.scoped.principalDataField.findMany({
        where: { dataPrincipalId: principalRow.id },
        orderBy: [{ canonicalField: "asc" }, { value: "asc" }],
      }),
    );
    const email = beforeDetach.find(
      (field) => field.canonicalField === "EMAIL",
    );
    expect(email?.sourceIds.sort()).toEqual(
      [
        marketing.dataSource.id,
        sales.dataSource.id,
        support.dataSource.id,
      ].sort(),
    );
    expect(
      beforeDetach.filter((field) => field.canonicalField === "CITY"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "Mumbai",
          conflict: true,
          isPrimary: false,
        }),
        expect.objectContaining({
          value: "Pune",
          conflict: true,
          isPrimary: true,
        }),
      ]),
    );
    expect(beforeDetach.every((field) => field.sourceIds.length > 0)).toBe(
      true,
    );

    await TenantContext.run(tenant(org), () =>
      prisma.scoped.identityLink.update({
        where: { id: salesLink.id },
        data: {
          status: "DETACHED",
          detachedAt: new Date(),
          detachReason: "test",
        },
      }),
    );
    await TenantContext.run(tenant(org), () =>
      prisma.scoped.$transaction((tx) => assembly.rebuild(tx, principalRow.id)),
    );
    const afterDetach = await TenantContext.run(tenant(org), () =>
      prisma.scoped.principalDataField.findMany({
        where: { dataPrincipalId: principalRow.id },
      }),
    );
    expect(
      afterDetach.every(
        (field) => !field.sourceIds.includes(sales.dataSource.id),
      ),
    ).toBe(true);
    const puneAfterDetach = afterDetach.find(
      (field) => field.canonicalField === "CITY" && field.value === "Pune",
    );
    expect(puneAfterDetach).toEqual(
      expect.objectContaining({ value: "Pune", conflict: false }),
    );
    // sourceIds is persisted sorted for rebuild determinism (see
    // assembly.service.ts), so compare sorted rather than insertion order.
    expect(puneAfterDetach?.sourceIds.slice().sort()).toEqual(
      [marketing.dataSource.id, support.dataSource.id].sort(),
    );
  });

  it("derives mapped DOB age once, crosses adult status, and leaves unmapped DOB unknown", async () => {
    const org = await organization();
    const dobSource = await source(
      org,
      `dob-${randomUUID()}`,
      [
        {
          sourceField: "dob",
          canonicalField: "DATE_OF_BIRTH",
          dataCategory: "DEMOGRAPHIC",
        },
      ],
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const minor = await principal(org);
    const minorRecord = await normalized(org, dobSource.sourceRecord.id, {
      dateOfBirth: new Date("2010-01-02T00:00:00.000Z"),
    });
    await link(org, minor.id, minorRecord.id);
    const now = new Date("2026-01-01T00:00:00.000Z");
    await TenantContext.run(tenant(org), () =>
      prisma.scoped.$transaction((tx) => age.derive(tx, minor.id, now)),
    );
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.dataPrincipal.findFirst({
          where: { id: minor.id },
          select: { ageStatus: true, ageStatusSource: true },
        }),
      ),
    ).resolves.toEqual({ ageStatus: "CHILD", ageStatusSource: "DOB_DERIVED" });
    const ageAudits = await TenantContext.run(tenant(org), () =>
      prisma.scoped.auditEvent.count({
        where: { subjectPrincipalId: minor.id, action: "AGE_STATUS_SET" },
      }),
    );
    await TenantContext.run(tenant(org), () =>
      prisma.scoped.$transaction((tx) => age.derive(tx, minor.id, now)),
    );
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.auditEvent.count({
          where: { subjectPrincipalId: minor.id, action: "AGE_STATUS_SET" },
        }),
      ),
    ).resolves.toBe(ageAudits);

    const adult = await principal(org);
    const adultSource = await source(
      org,
      `adult-${randomUUID()}`,
      [
        {
          sourceField: "dob",
          canonicalField: "DATE_OF_BIRTH",
          dataCategory: "DEMOGRAPHIC",
        },
      ],
      now,
    );
    const adultRecord = await normalized(org, adultSource.sourceRecord.id, {
      dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
    });
    await link(org, adult.id, adultRecord.id);
    await TenantContext.run(tenant(org), () =>
      prisma.scoped.$transaction((tx) => age.derive(tx, adult.id, now)),
    );
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.dataPrincipal.findFirst({
          where: { id: adult.id },
          select: { ageStatus: true, ageStatusSource: true },
        }),
      ),
    ).resolves.toEqual({ ageStatus: "ADULT", ageStatusSource: "DOB_DERIVED" });

    const unmappedSource = await source(
      org,
      `unmapped-${randomUUID()}`,
      [
        {
          sourceField: "email",
          canonicalField: "EMAIL",
          dataCategory: "CONTACT",
        },
      ],
      now,
    );
    const unknown = await principal(org);
    const unknownRecord = await normalized(
      org,
      unmappedSource.sourceRecord.id,
      { dateOfBirth: new Date("2010-01-02T00:00:00.000Z") },
    );
    await link(org, unknown.id, unknownRecord.id);
    await TenantContext.run(tenant(org), () =>
      prisma.scoped.$transaction((tx) => age.derive(tx, unknown.id, now)),
    );
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.dataPrincipal.findFirst({
          where: { id: unknown.id },
          select: {
            ageStatus: true,
            ageStatusSource: true,
            ageStatusSetAt: true,
          },
        }),
      ),
    ).resolves.toEqual({
      ageStatus: "UNKNOWN",
      ageStatusSource: null,
      ageStatusSetAt: null,
    });
  });

  it("rebuilds fields and derives age automatically for a newly created identity link", async () => {
    const org = await organization();
    const setup = await source(
      org,
      `automatic-${randomUUID()}`,
      [
        {
          sourceField: "email",
          canonicalField: "EMAIL",
          dataCategory: "CONTACT",
        },
        {
          sourceField: "dob",
          canonicalField: "DATE_OF_BIRTH",
          dataCategory: "DEMOGRAPHIC",
        },
      ],
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const record = await normalized(org, setup.sourceRecord.id, {
      emailNormalized: "auto@example.test",
      dateOfBirth: new Date("2010-01-02T00:00:00.000Z"),
    });
    const applied = await TenantContext.run(tenant(org), () =>
      prisma.scoped.$transaction((tx) =>
        linking.applyMatch(tx, record, { kind: "NEW" }),
      ),
    );
    expect(applied.linkCreated).toBe(true);
    const fields = await TenantContext.run(tenant(org), () =>
      prisma.scoped.principalDataField.findMany({
        where: { dataPrincipalId: applied.dataPrincipalId ?? "" },
      }),
    );
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalField: "EMAIL",
          value: "auto@example.test",
          sourceIds: [setup.dataSource.id],
        }),
      ]),
    );
    await expect(
      TenantContext.run(tenant(org), () =>
        prisma.scoped.dataPrincipal.findFirst({
          where: { id: applied.dataPrincipalId ?? "" },
          select: { ageStatus: true, ageStatusSource: true },
        }),
      ),
    ).resolves.toEqual({ ageStatus: "CHILD", ageStatusSource: "DOB_DERIVED" });
  });
});
