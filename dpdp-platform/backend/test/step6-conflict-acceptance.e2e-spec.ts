import { randomUUID } from "crypto";
import * as http from "node:http";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { CanonicalField, DataCategory, MappingComparisonPolicy } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";
import { MockHttpServer } from "../src/modules/connectors/test-support/mock-http-server";
import { TenantContext, type TenantStore } from "../src/common/tenant/tenant-context";
import { SyncPipelineService } from "../src/modules/sync/sync-pipeline.service";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fixture = require("./fixtures/step6-four-source-dataset.json") as {
  marketing: unknown[];
  sales: unknown[];
  support: unknown[];
  ecommerce: unknown[];
};

/**
 * `step-6-conflict-diagnosis.md` / `step-6-conflict-fix-brief.md`
 * question 3: does the Section 7 Step 6 mapping configuration actually
 * produce `500 / 327 / 4 / 12`, two separate Rahul Vermas, and six CHILD
 * principals, end to end, through the REAL
 * MatchingService/LinkingService/AssemblyService/InventoryService
 * pipeline -- not a unit test of the policy function in isolation?
 *
 * `test/fixtures/step6-four-source-dataset.json` is ONE point-in-time
 * snapshot of `demo-company-server`'s own deterministic generator
 * (`SEED = 20260830`, see `demo-company-server/src/seed/generate.ts`),
 * produced by calling its real `seedDatabase()` once and dumping every
 * row of all four tables verbatim -- it is not hand-authored and not
 * regenerated at test time. This file never imports from or talks to
 * `demo-company-server` at runtime, matching this directory's own rule
 * (`mock-http-server.ts`: "these tests must keep passing even if every
 * sibling directory next to this backend were deleted"); each of the
 * four systems is served over HTTP by a local `MockHttpServer`, exactly
 * like every other sync e2e test.
 *
 * `demo-company-server/test/dataset.test.ts` independently proves the
 * SAME dataset yields exactly 12 city-conflicted principals, 2 separate
 * Rahul Vermas, and 6 CHILD principals using its own pure-JS
 * `simulateMatching` reimplementation of the matching rules. This file is
 * the second, independent proof: the real backend pipeline, exercised
 * through the exact field-mapping table (source field, canonical field,
 * data category, `comparisonPolicy`) an administrator configured on the
 * retained isolated Step 6 runtime's Marketing/Sales/Support/E-commerce
 * data sources (read back with `default_transaction_read_only=on`, never
 * mutated, from `dpdp-step6-pg` -- see the fix report for the exact
 * `SELECT`), agrees.
 */
describe("Step 6 conflict-count acceptance (e2e)", () => {
  let app: INestApplication;
  let pipeline: SyncPipelineService;
  const prisma = new PrismaService();
  const createdOrgIds: string[] = [];
  const servers: MockHttpServer[] = [];

  type EmployeeSession = { accessToken: string };

  function tenant(organizationId: string): TenantStore {
    return {
      organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: "step6-acceptance-e2e",
    };
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

  async function organization(): Promise<string> {
    const id = randomUUID();
    createdOrgIds.push(id);
    await prisma.organization.create({
      data: { id, name: `Step6 Acceptance Org ${id}`, country: "IN" },
    });
    return id;
  }

  async function employeeWithPermissions(
    organizationId: string,
    permissionCodes: string[],
  ): Promise<EmployeeSession> {
    for (const code of permissionCodes) {
      await ensurePermission(code);
    }
    const roleName = `STEP6_ROLE_${randomUUID().replace(/-/g, "")}`;
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: roleName,
        name: roleName,
        isSystem: false,
        permissions: {
          create: permissionCodes.map((permissionCode) => ({ permissionCode })),
        },
      },
    });
    const email = `${roleName.toLowerCase()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: roleName,
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
    return { accessToken: loginRes.body.accessToken as string };
  }

  function authenticated(session: EmployeeSession): [string, string] {
    return ["Authorization", `Bearer ${session.accessToken}`];
  }

  /** Same envelope shape (`{ data: [...] }`) every other sync e2e test uses. */
  function pagedHandler(records: readonly unknown[]): http.RequestListener {
    return (req, res) => {
      const url = new URL(req.url ?? "", "http://127.0.0.1");
      const page = Number(url.searchParams.get("page") ?? "1");
      const limit = Number(url.searchParams.get("limit") ?? "1000");
      const start = (page - 1) * limit;
      const slice = records.slice(start, start + limit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: slice }));
    };
  }

  async function startServer(
    records: readonly unknown[],
  ): Promise<{ baseUrl: string }> {
    const server = new MockHttpServer(pagedHandler(records));
    servers.push(server);
    const port = await server.listen();
    return { baseUrl: `http://127.0.0.1:${port}/records` };
  }

  type FieldMapping = {
    sourceField: string;
    canonicalField: CanonicalField;
    dataCategory: DataCategory;
    comparisonPolicy: MappingComparisonPolicy;
  };

  async function createDataSource(
    organizationId: string,
    baseUrl: string,
    externalIdField: string,
    mappings: readonly FieldMapping[],
  ): Promise<string> {
    return TenantContext.run(tenant(organizationId), async () => {
      const dataSource = await prisma.scoped.dataSource.create({
        data: {
          name: `Step6 source ${randomUUID()}`,
          systemType: "STEP6_ACCEPTANCE_TEST",
          baseUrl,
          recordsPath: "data",
          externalIdField,
          pageSize: 1000,
        } as never,
      });
      await Promise.all(
        mappings.map((mapping) =>
          prisma.scoped.sourceFieldMapping.create({
            data: { dataSourceId: dataSource.id, ...mapping } as never,
          }),
        ),
      );
      return dataSource.id;
    });
  }

  // ------------------------------------------------------------------
  // The exact mapping table (source field -> canonical field -> data
  // category) an administrator configured on the retained isolated Step
  // 6 runtime (`dpdp-step6-pg`, Acme org `3cbf6d8c-...`), read back
  // read-only. `comparisonPolicy` is this fix's addition: CITY (the one
  // deliberately seeded same-fact comparison) is ACCURACY_COMPARABLE;
  // EMAIL/PHONE (legitimate multi-value contact points) are MULTI_VALUE;
  // everything else -- per-system identifiers, the Sales/E-commerce
  // postal and total pairs, and the two independently-styled full-name
  // fields -- stays at the conservative NOT_COMPARABLE default an
  // administrator has not (yet) reviewed and confirmed as the same fact.
  // ------------------------------------------------------------------
  const marketingMappings: FieldMapping[] = [
    { sourceField: "id", canonicalField: "EXTERNAL_ID", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "customer_email", canonicalField: "EMAIL", dataCategory: "CONTACT", comparisonPolicy: "MULTI_VALUE" },
    { sourceField: "mobile_number", canonicalField: "PHONE", dataCategory: "CONTACT", comparisonPolicy: "MULTI_VALUE" },
    { sourceField: "first_name", canonicalField: "FIRST_NAME", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "surname", canonicalField: "LAST_NAME", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "city", canonicalField: "CITY", dataCategory: "LOCATION", comparisonPolicy: "ACCURACY_COMPARABLE" },
    { sourceField: "subscribed_on", canonicalField: "IGNORE", dataCategory: "OTHER", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "campaign_source", canonicalField: "IGNORE", dataCategory: "OTHER", comparisonPolicy: "NOT_COMPARABLE" },
  ];
  const salesMappings: FieldMapping[] = [
    { sourceField: "crm_id", canonicalField: "EXTERNAL_ID", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "primary_email", canonicalField: "EMAIL", dataCategory: "CONTACT", comparisonPolicy: "MULTI_VALUE" },
    { sourceField: "contact_no", canonicalField: "PHONE", dataCategory: "CONTACT", comparisonPolicy: "MULTI_VALUE" },
    { sourceField: "full_name", canonicalField: "FULL_NAME", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "billing_pincode", canonicalField: "POSTAL_CODE", dataCategory: "LOCATION", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "account_status", canonicalField: "ACCOUNT_STATUS", dataCategory: "TRANSACTIONAL", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "lifetime_value", canonicalField: "PURCHASE_TOTAL", dataCategory: "FINANCIAL", comparisonPolicy: "NOT_COMPARABLE" },
  ];
  const supportMappings: FieldMapping[] = [
    { sourceField: "user_ref", canonicalField: "EXTERNAL_ID", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "email_address", canonicalField: "EMAIL", dataCategory: "CONTACT", comparisonPolicy: "MULTI_VALUE" },
    { sourceField: "phone", canonicalField: "PHONE", dataCategory: "CONTACT", comparisonPolicy: "MULTI_VALUE" },
    { sourceField: "name", canonicalField: "FULL_NAME", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "last_ticket_at", canonicalField: "LAST_ACTIVITY_AT", dataCategory: "BEHAVIOURAL", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "tickets_count", canonicalField: "IGNORE", dataCategory: "OTHER", comparisonPolicy: "NOT_COMPARABLE" },
  ];
  const ecommerceMappings: FieldMapping[] = [
    { sourceField: "customer_code", canonicalField: "EXTERNAL_ID", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "email", canonicalField: "EMAIL", dataCategory: "CONTACT", comparisonPolicy: "MULTI_VALUE" },
    { sourceField: "phone_number", canonicalField: "PHONE", dataCategory: "CONTACT", comparisonPolicy: "MULTI_VALUE" },
    { sourceField: "first_name", canonicalField: "FIRST_NAME", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "last_name", canonicalField: "LAST_NAME", dataCategory: "IDENTITY", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "dob", canonicalField: "DATE_OF_BIRTH", dataCategory: "DEMOGRAPHIC", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "address_line_1", canonicalField: "ADDRESS_LINE1", dataCategory: "LOCATION", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "city", canonicalField: "CITY", dataCategory: "LOCATION", comparisonPolicy: "ACCURACY_COMPARABLE" },
    { sourceField: "state", canonicalField: "STATE", dataCategory: "LOCATION", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "pincode", canonicalField: "POSTAL_CODE", dataCategory: "LOCATION", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "total_orders", canonicalField: "IGNORE", dataCategory: "OTHER", comparisonPolicy: "NOT_COMPARABLE" },
    { sourceField: "total_spent", canonicalField: "PURCHASE_TOTAL", dataCategory: "FINANCIAL", comparisonPolicy: "NOT_COMPARABLE" },
  ];

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
    pipeline = app.get(SyncPipelineService);
  });

  afterAll(async () => {
    await Promise.all(servers.map((s) => s.close()));
    await app.close();
    if (createdOrgIds.length > 0) {
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${createdOrgIds})`;
      await prisma.refreshToken.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.principalDataField.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.matchCandidate.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.identityLink.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.principalIdentifier.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.dataPrincipal.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.normalizedRecord.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.sourceRecord.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.syncJob.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.sourceFieldMapping.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.dataSource.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.employee.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.role.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    }
    await prisma.$disconnect();
  }, 30000);

  it(
    "four deterministic Acme Retail sources sync to exactly 500 records / " +
      "327 principals / 4 pending candidates / 12 accuracy-eligible " +
      "conflicts, with two separate Rahul Vermas and six CHILD principals",
    async () => {
      const org = await organization();
      const viewer = await employeeWithPermissions(org, [
        "CAN_VIEW_PRINCIPALS",
        "CAN_VIEW_ALL_PERSONAL_DATA",
      ]);

      const marketing = await startServer(fixture.marketing);
      const sales = await startServer(fixture.sales);
      const support = await startServer(fixture.support);
      const ecommerce = await startServer(fixture.ecommerce);

      const marketingId = await createDataSource(org, marketing.baseUrl, "id", marketingMappings);
      const salesId = await createDataSource(org, sales.baseUrl, "crm_id", salesMappings);
      const supportId = await createDataSource(org, support.baseUrl, "user_ref", supportMappings);
      const ecommerceId = await createDataSource(org, ecommerce.baseUrl, "customer_code", ecommerceMappings);

      // Same order as the retained Step 6 browser walkthrough network log:
      // Marketing, Sales, Support, E-commerce.
      const marketingResult = await pipeline.run(marketingId, "step6-acceptance");
      const salesResult = await pipeline.run(salesId, "step6-acceptance");
      const supportResult = await pipeline.run(supportId, "step6-acceptance");
      const ecommerceResult = await pipeline.run(ecommerceId, "step6-acceptance");

      for (const result of [marketingResult, salesResult, supportResult, ecommerceResult]) {
        expect(result.status).toBe("SUCCESS");
      }

      const totalRead =
        marketingResult.recordsRead +
        salesResult.recordsRead +
        supportResult.recordsRead +
        ecommerceResult.recordsRead;
      expect(totalRead).toBe(500);
      expect(marketingResult.recordsRead).toBe(fixture.marketing.length);
      expect(salesResult.recordsRead).toBe(fixture.sales.length);
      expect(supportResult.recordsRead).toBe(fixture.support.length);
      expect(ecommerceResult.recordsRead).toBe(fixture.ecommerce.length);

      const summaryResponse = await request(app.getHttpServer())
        .get("/api/inventory/summary")
        .set(...authenticated(viewer));
      expect(summaryResponse.status).toBe(200);
      expect(summaryResponse.body).toMatchObject({
        sourceCount: 4,
        rawRecordCount: 500,
        uniquePrincipalCount: 327,
        matchedPrincipalCount: 327,
        pendingReviewCount: 4,
        conflictCount: 12,
      });

      // The two hand-authored Rahul Vermas (Marketing + Support, no shared
      // identifier) must remain two separate search results, never merged.
      const rahulResponse = await request(app.getHttpServer())
        .get("/api/principals")
        .query({ q: "Rahul Verma" })
        .set(...authenticated(viewer));
      expect(rahulResponse.status).toBe(200);
      // Marketing has no FULL_NAME mapping (only FIRST_NAME/LAST_NAME), so
      // that Rahul's search row legitimately has no primary FULL_NAME
      // field to show as `displayName` -- matching the retained Step 6
      // browser evidence exactly ("the former as Principal DP-000002 (no
      // display name/source present) and the latter as Rahul Verma from
      // Support"). The proof that matters here is two SEPARATE search
      // results (never merged into one principal), not that both carry a
      // resolved display name.
      const rahulItems = rahulResponse.body.items as Array<{
        id: string;
        displayName: string | null;
      }>;
      const rahulIds = new Set(rahulItems.map((item) => item.id));
      expect(rahulIds.size).toBe(2);
      expect(
        rahulItems.filter((item) => item.displayName === "Rahul Verma"),
      ).toHaveLength(1);
      expect(
        rahulItems.filter((item) => item.displayName === null),
      ).toHaveLength(1);

      // Six distinct principals must derive CHILD from the mapped
      // e-commerce DOBs.
      const childResponse = await request(app.getHttpServer())
        .get("/api/principals")
        .query({ ageStatus: "CHILD" })
        .set(...authenticated(viewer));
      expect(childResponse.status).toBe(200);
      expect((childResponse.body.items as unknown[]).length).toBe(6);
    },
    60000,
  );

  it(
    "the demo mapping configuration AS SCRIPTED TODAY -- canonicalField/" +
      "dataCategory set via PUT /mappings, comparisonPolicy left unset by " +
      "the caller, exactly what an operator following the existing Step 6 " +
      "walkthrough (which predates comparisonPolicy and never mentions it) " +
      "would submit -- leaves conflictCount at 0, NOT 12. An administrator " +
      "must additionally choose 'Accuracy-comparable' for City on the " +
      "Marketing and E-commerce mappings (Step3Mapping's new column) " +
      "before Step 6's 500/327/4/12 is reachable; this is a real, " +
      "currently-undocumented manual step, not an automatic consequence " +
      "of syncing the demo data.",
    async () => {
      const org = await organization();
      const operator = await employeeWithPermissions(org, [
        "CAN_MANAGE_DATA_SOURCES",
        "CAN_VIEW_PRINCIPALS",
        "CAN_VIEW_ALL_PERSONAL_DATA",
      ]);

      const marketing = await startServer(fixture.marketing);
      const sales = await startServer(fixture.sales);
      const support = await startServer(fixture.support);
      const ecommerce = await startServer(fixture.ecommerce);

      // Bare data sources with NO mappings yet -- mirrors Step 1/2 of the
      // wizard (connect + discover), before Step 3 (map).
      async function bareDataSource(
        baseUrl: string,
        externalIdField: string,
      ): Promise<string> {
        return TenantContext.run(tenant(org), async () => {
          const dataSource = await prisma.scoped.dataSource.create({
            data: {
              name: `Step6 legacy-mapping source ${randomUUID()}`,
              systemType: "STEP6_ACCEPTANCE_TEST",
              baseUrl,
              recordsPath: "data",
              externalIdField,
              pageSize: 1000,
            } as never,
          });
          return dataSource.id;
        });
      }
      const marketingId = await bareDataSource(marketing.baseUrl, "id");
      const salesId = await bareDataSource(sales.baseUrl, "crm_id");
      const supportId = await bareDataSource(support.baseUrl, "user_ref");
      const ecommerceId = await bareDataSource(ecommerce.baseUrl, "customer_code");

      // The SAME source-field -> canonicalField -> dataCategory table as
      // the passing test above, but WITHOUT `comparisonPolicy` in the
      // request body at all -- exactly the shape the existing wizard/API
      // contract required before this fix, and exactly what the Step 6
      // walkthrough script (written before `MappingComparisonPolicy`
      // existed) still tells an operator to submit today.
      function stripComparisonPolicy(
        mappings: readonly FieldMapping[],
      ): Array<Omit<FieldMapping, "comparisonPolicy">> {
        return mappings.map(({ comparisonPolicy: _drop, ...rest }) => rest);
      }
      async function putLegacyMappings(
        dataSourceId: string,
        mappings: readonly FieldMapping[],
      ): Promise<void> {
        const response = await request(app.getHttpServer())
          .put(`/api/data-sources/${dataSourceId}/mappings`)
          .set(...authenticated(operator))
          .send({ mappings: stripComparisonPolicy(mappings) });
        expect(response.status).toBe(200);
      }
      await putLegacyMappings(marketingId, marketingMappings);
      await putLegacyMappings(salesId, salesMappings);
      await putLegacyMappings(supportId, supportMappings);
      await putLegacyMappings(ecommerceId, ecommerceMappings);

      // Every mapping persisted with the conservative, un-reviewed
      // default -- never inferred from canonicalField.
      const persistedPolicies = await TenantContext.run(tenant(org), () =>
        prisma.scoped.sourceFieldMapping.findMany({
          where: { dataSourceId: { in: [marketingId, salesId, supportId, ecommerceId] } },
          select: { comparisonPolicy: true },
        }),
      );
      expect(persistedPolicies.length).toBeGreaterThan(0);
      expect(
        persistedPolicies.every((row) => row.comparisonPolicy === "NOT_COMPARABLE"),
      ).toBe(true);

      const results = await Promise.all(
        [marketingId, salesId, supportId, ecommerceId].map((id) =>
          pipeline.run(id, "step6-legacy-mapping-acceptance"),
        ),
      );
      for (const result of results) {
        expect(result.status).toBe("SUCCESS");
      }
      expect(results.reduce((sum, r) => sum + r.recordsRead, 0)).toBe(500);

      const summaryResponse = await request(app.getHttpServer())
        .get("/api/inventory/summary")
        .set(...authenticated(operator));
      expect(summaryResponse.status).toBe(200);
      // The identity pipeline still resolves 327/4 correctly -- matching
      // is untouched by this fix -- but the accuracy-eligible conflict
      // count is 0, NEVER the pre-fix 150, because no mapping has been
      // reviewed as ACCURACY_COMPARABLE. Neither number is the required
      // Step 6 "12" until an administrator takes the new, additional
      // Step3Mapping action.
      expect(summaryResponse.body).toMatchObject({
        rawRecordCount: 500,
        uniquePrincipalCount: 327,
        matchedPrincipalCount: 327,
        pendingReviewCount: 4,
        conflictCount: 0,
      });
    },
    60000,
  );
});
