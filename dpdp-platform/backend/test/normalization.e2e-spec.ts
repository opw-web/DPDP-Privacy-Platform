import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  TenantContext,
  type TenantStore,
} from "../src/common/tenant/tenant-context";
import {
  NormalizationService,
  type NormalizationMapping,
} from "../src/modules/normalization/normalization.service";

/**
 * Task 15: a pure mapping result can be persisted independently, keyed only
 * by sourceRecordId. The database write below goes through the real tenant
 * extension: no application service supplies organizationId by hand.
 */
describe("Normalization (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  const normalizer = new NormalizationService();
  const createdOrgIds: string[] = [];

  function tenant(organizationId: string): TenantStore {
    return {
      organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: "normalization-e2e",
    };
  }

  async function createSourceRecord(
    organizationId: string,
    rawPayload: Record<string, unknown>,
  ) {
    return TenantContext.run(tenant(organizationId), async () => {
      const dataSource = await prisma.scoped.dataSource.create({
        data: {
          name: `Normalization source ${randomUUID()}`,
          systemType: "NORMALIZATION_TEST",
          baseUrl: "https://normalization.example.test",
          recordsPath: "data",
          externalIdField: "id",
        } as never,
      });

      return prisma.scoped.sourceRecord.create({
        data: {
          dataSourceId: dataSource.id,
          sourceRecordKey: randomUUID(),
          rawPayload,
          payloadHash: randomUUID(),
        } as never,
      });
    });
  }

  async function persist(
    organizationId: string,
    input: ReturnType<NormalizationService["normalize"]>,
  ) {
    const { sourceRecordId, ...update } = input;
    return TenantContext.run(tenant(organizationId), () =>
      prisma.scoped.normalizedRecord.upsert({
        where: { sourceRecordId },
        create: input as never,
        update,
      }),
    );
  }

  async function persistMappings(
    organizationId: string,
    dataSourceId: string,
    mappings: readonly NormalizationMapping[],
  ): Promise<NormalizationMapping[]> {
    return TenantContext.run(tenant(organizationId), async () =>
      Promise.all(
        mappings.map((mapping) =>
          prisma.scoped.sourceFieldMapping.create({
            data: { dataSourceId, ...mapping } as never,
          }),
        ),
      ),
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
  });

  afterAll(async () => {
    await app.close();
    if (createdOrgIds.length > 0) {
      await prisma.normalizedRecord.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.sourceRecord.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.sourceFieldMapping.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataSource.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("maps every canonical field, preserves carried values, and is idempotent", async () => {
    const organizationId = randomUUID();
    createdOrgIds.push(organizationId);
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: `Normalization Test Org ${organizationId}`,
        country: "IN",
      },
    });

    const rawPayload = {
      full: "  sharma   aman ",
      first: "aman",
      last: "sharma",
      email: "  AMAN@EXAMPLE.COM ",
      emailDuplicate: "duplicate@example.com",
      phone: "09876543210",
      phoneDuplicate: "9999999999",
      dob: "1990-05-12",
      gender: "NON_BINARY",
      address1: "  1 Market Street ",
      address2: "Suite 7",
      city: " Pune ",
      state: " Maharashtra ",
      postal: "411001",
      country: "IN",
      customer: "CUST-42",
      account: "ACTIVE",
      lastActivity: "2026-08-30T00:00:00.000Z",
      total: 12500,
      external: "crm-42",
      ignored: "must not survive",
      unmapped: { retained: true },
    };
    const sourceRecord = await createSourceRecord(organizationId, rawPayload);

    const mappingPairs: Array<
      [string, NormalizationMapping["canonicalField"]]
    > = [
      ["full", "FULL_NAME"],
      ["first", "FIRST_NAME"],
      ["last", "LAST_NAME"],
      ["email", "EMAIL"],
      ["emailDuplicate", "EMAIL"],
      ["phone", "PHONE"],
      ["phoneDuplicate", "PHONE"],
      ["dob", "DATE_OF_BIRTH"],
      ["gender", "GENDER"],
      ["address1", "ADDRESS_LINE1"],
      ["address2", "ADDRESS_LINE2"],
      ["city", "CITY"],
      ["state", "STATE"],
      ["postal", "POSTAL_CODE"],
      ["country", "COUNTRY"],
      ["customer", "CUSTOMER_ID"],
      ["account", "ACCOUNT_STATUS"],
      ["lastActivity", "LAST_ACTIVITY_AT"],
      ["total", "PURCHASE_TOTAL"],
      ["external", "EXTERNAL_ID"],
      ["ignored", "IGNORE"],
    ];
    const mappings: NormalizationMapping[] = mappingPairs.map(
      ([sourceField, canonicalField]) => ({
        sourceField,
        canonicalField,
        dataCategory: "OTHER",
        containsPersonalData: true,
        isVerifiedCustomerId: canonicalField === "CUSTOMER_ID",
      }),
    );
    const rawSnapshot = structuredClone(rawPayload);
    const mappingSnapshot = structuredClone(mappings);
    const persistedMappings = await persistMappings(
      organizationId,
      sourceRecord.dataSourceId,
      mappings,
    );

    const input = normalizer.normalize(
      { ...sourceRecord, organizationCountry: "IN" },
      persistedMappings,
    );

    expect(rawPayload).toEqual(rawSnapshot);
    expect(mappings).toEqual(mappingSnapshot);
    expect(input).toMatchObject({
      sourceRecordId: sourceRecord.id,
      fullName: "Sharma Aman",
      firstName: "Aman",
      lastName: "Sharma",
      emailRaw: "  AMAN@EXAMPLE.COM ",
      emailNormalized: "aman@example.com",
      phoneRaw: "09876543210",
      phoneNormalized: "+919876543210",
      customerId: "CUST-42",
      addressLine1: "1 Market Street",
      city: "Pune",
      state: "Maharashtra",
      postalCode: "411001",
      country: "IN",
      nameKey: "aman sharma",
      extras: {
        account: "ACTIVE",
        address2: "Suite 7",
        emailDuplicate: "duplicate@example.com",
        external: "crm-42",
        gender: "NON_BINARY",
        lastActivity: "2026-08-30T00:00:00.000Z",
        phoneDuplicate: "9999999999",
        total: 12500,
        unmapped: { retained: true },
      },
    });
    expect(input.dateOfBirth?.toISOString()).toBe("1990-05-12T00:00:00.000Z");
    expect(input.extras).not.toHaveProperty("ignored");

    const firstWrite = await persist(organizationId, input);
    const secondInput = normalizer.normalize(
      { ...sourceRecord, organizationCountry: "IN" },
      persistedMappings,
    );
    const secondWrite = await persist(organizationId, secondInput);

    expect(secondInput).toEqual(input);
    expect(secondWrite.id).toBe(firstWrite.id);
    expect(
      await TenantContext.run(tenant(organizationId), () =>
        prisma.scoped.normalizedRecord.count({
          where: { sourceRecordId: sourceRecord.id },
        }),
      ),
    ).toBe(1);
  });

  it("keeps invalid email and phone raw values while normalized columns are null", async () => {
    const organizationId = randomUUID();
    createdOrgIds.push(organizationId);
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: `Invalid Normalization Test Org ${organizationId}`,
      },
    });
    const sourceRecord = await createSourceRecord(organizationId, {
      email: "not an email",
      phone: "123",
    });
    const input = normalizer.normalize(
      { ...sourceRecord, organizationCountry: "IN" },
      [
        {
          sourceField: "email",
          canonicalField: "EMAIL",
          dataCategory: "CONTACT",
          containsPersonalData: true,
          isVerifiedCustomerId: false,
        },
        {
          sourceField: "phone",
          canonicalField: "PHONE",
          dataCategory: "CONTACT",
          containsPersonalData: true,
          isVerifiedCustomerId: false,
        },
      ],
    );

    const persisted = await persist(organizationId, input);
    expect(persisted).toMatchObject({
      emailRaw: "not an email",
      emailNormalized: null,
      phoneRaw: "123",
      phoneNormalized: null,
    });
  });
});
