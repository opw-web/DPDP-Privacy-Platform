import { randomUUID } from "crypto";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  TenantContext,
  TenantStore,
} from "../src/common/tenant/tenant-context";

/**
 * Check 1 (spec lines 990-994): tenant isolation is structural, not a
 * convention. This is the task 3 gate -- no later task is dispatched until
 * every assertion here passes.
 *
 * Talks to the real Postgres database (no mocks). Seeds two real
 * organizations, Acme and Globex, and exercises the extension against
 * several model shapes on purpose:
 *   - DataPrincipal: unique key is a compound tenant key
 *     (`organizationId, reference`) -- the case the extension can satisfy
 *     "for free".
 *   - SecurityMeasure: unique key is `id` alone -- the classic hole
 *     (`findUnique({ where: { id } })` cannot carry an extra
 *     `organizationId` in Prisma's typed where) that the findUnique ->
 *     findFirst degrade exists to close.
 *   - Organization: self-scoped (fix round 1 / Critical 1) -- it has no
 *     organizationId column because it IS the tenant, filtered by `id`
 *     instead.
 *   - RolePermission / DataSourcePurpose: the indirect-scoping decision
 *     (no organizationId column of their own; scoped through their
 *     parent Role / DataSource), including the create-time foreign-key
 *     check added in fix round 1 / Critical 2.
 *   - IdentityLink: exercises the documented nested-write/nested-read
 *     contract boundary (Critical 3) and the mandated idiom for closing it.
 */
describe("Tenant isolation (e2e)", () => {
  const prisma = new PrismaService();

  let acmeOrgId: string;
  let globexOrgId: string;
  let acmePrincipalId: string;
  let globexPrincipalId: string;
  let acmeSecurityMeasureId: string;
  let globexSecurityMeasureId: string;
  let acmeRoleId: string;
  let globexRoleId: string;
  let permissionCode: string;
  let acmeDataSourceId: string;
  let globexDataSourceId: string;
  let acmePurposeId: string;
  let globexPurposeId: string;
  let acmeNormalizedRecordId: string;
  // Tracks the Acme principal's current `reference` across the "update
  // survives changing the very field it was looked up by" test, since
  // that test intentionally changes it.
  const acmePrincipalReferenceHolder = { value: "" };

  const acmeCtx: TenantStore = {
    organizationId: "",
    actorType: "EMPLOYEE",
    actorId: "acme-admin",
    actorLabel: "Acme Admin",
  };
  const globexCtx: TenantStore = {
    organizationId: "",
    actorType: "EMPLOYEE",
    actorId: "globex-admin",
    actorLabel: "Globex Admin",
  };

  beforeAll(async () => {
    await prisma.$connect();

    acmeOrgId = randomUUID();
    globexOrgId = randomUUID();
    acmeCtx.organizationId = acmeOrgId;
    globexCtx.organizationId = globexOrgId;

    // Seeding happens on the raw (unscoped) PrismaService, deliberately --
    // there is no tenant context yet at seed time, and seeding is exactly
    // the kind of migration/setup code the raw client exists for.
    await prisma.organization.createMany({
      data: [
        { id: acmeOrgId, name: "Acme" },
        { id: globexOrgId, name: "Globex" },
      ],
    });

    const acmePrincipal = await prisma.dataPrincipal.create({
      data: {
        organizationId: acmeOrgId,
        reference: `DP-${randomUUID()}`,
        displayName: "Acme Principal",
      },
    });
    const globexPrincipal = await prisma.dataPrincipal.create({
      data: {
        organizationId: globexOrgId,
        reference: `DP-${randomUUID()}`,
        displayName: "Globex Principal",
      },
    });
    acmePrincipalId = acmePrincipal.id;
    globexPrincipalId = globexPrincipal.id;
    acmePrincipalReferenceHolder.value = acmePrincipal.reference;

    const acmeSecurityMeasure = await prisma.securityMeasure.create({
      data: {
        organizationId: acmeOrgId,
        ruleReference: "Rule 6(1)(a)",
        measureType: "ENCRYPTION",
        description: "Acme's encryption-at-rest measure",
      },
    });
    const globexSecurityMeasure = await prisma.securityMeasure.create({
      data: {
        organizationId: globexOrgId,
        ruleReference: "Rule 6(1)(a)",
        measureType: "ENCRYPTION",
        description: "Globex's encryption-at-rest measure",
      },
    });
    acmeSecurityMeasureId = acmeSecurityMeasure.id;
    globexSecurityMeasureId = globexSecurityMeasure.id;

    permissionCode = `test.permission.${randomUUID()}`;
    await prisma.permission.create({
      data: {
        code: permissionCode,
        description: "Test-only permission",
        category: "TEST",
      },
    });

    const acmeRole = await prisma.role.create({
      data: { organizationId: acmeOrgId, code: "TEST_ROLE", name: "Test Role" },
    });
    const globexRole = await prisma.role.create({
      data: {
        organizationId: globexOrgId,
        code: "TEST_ROLE",
        name: "Test Role",
      },
    });
    acmeRoleId = acmeRole.id;
    globexRoleId = globexRole.id;

    await prisma.rolePermission.createMany({
      data: [
        { roleId: acmeRoleId, permissionCode },
        { roleId: globexRoleId, permissionCode },
      ],
    });

    const acmeDataSource = await prisma.dataSource.create({
      data: {
        organizationId: acmeOrgId,
        name: `Acme Source ${randomUUID()}`,
        systemType: "TEST",
        baseUrl: "https://acme.example.test",
        recordsPath: "data",
        externalIdField: "id",
      },
    });
    const globexDataSource = await prisma.dataSource.create({
      data: {
        organizationId: globexOrgId,
        name: `Globex Source ${randomUUID()}`,
        systemType: "TEST",
        baseUrl: "https://globex.example.test",
        recordsPath: "data",
        externalIdField: "id",
      },
    });
    acmeDataSourceId = acmeDataSource.id;
    globexDataSourceId = globexDataSource.id;

    const acmePurpose = await prisma.processingPurpose.create({
      data: {
        organizationId: acmeOrgId,
        code: "TEST_PURPOSE",
        name: "Test Purpose",
        description: "Acme's test purpose",
        lawfulBasis: "CONSENT",
        basisJustification: "test",
      },
    });
    const globexPurpose = await prisma.processingPurpose.create({
      data: {
        organizationId: globexOrgId,
        code: "TEST_PURPOSE",
        name: "Test Purpose",
        description: "Globex's test purpose",
        lawfulBasis: "CONSENT",
        basisJustification: "test",
      },
    });
    acmePurposeId = acmePurpose.id;
    globexPurposeId = globexPurpose.id;

    await prisma.dataSourcePurpose.createMany({
      data: [
        { dataSourceId: acmeDataSourceId, purposeId: acmePurposeId },
        { dataSourceId: globexDataSourceId, purposeId: globexPurposeId },
      ],
    });

    const acmeSourceRecord = await prisma.sourceRecord.create({
      data: {
        organizationId: acmeOrgId,
        dataSourceId: acmeDataSourceId,
        sourceRecordKey: randomUUID(),
        rawPayload: {},
        payloadHash: "hash",
      },
    });
    const acmeNormalizedRecord = await prisma.normalizedRecord.create({
      data: {
        organizationId: acmeOrgId,
        sourceRecordId: acmeSourceRecord.id,
      },
    });
    acmeNormalizedRecordId = acmeNormalizedRecord.id;
  });

  afterAll(async () => {
    await prisma.identityLink.deleteMany({
      where: { organizationId: { in: [acmeOrgId, globexOrgId] } },
    });
    await prisma.normalizedRecord.deleteMany({
      where: { organizationId: { in: [acmeOrgId, globexOrgId] } },
    });
    await prisma.sourceRecord.deleteMany({
      where: { organizationId: { in: [acmeOrgId, globexOrgId] } },
    });
    await prisma.dataSourcePurpose.deleteMany({
      where: { dataSourceId: { in: [acmeDataSourceId, globexDataSourceId] } },
    });
    await prisma.processingPurpose.deleteMany({
      where: { id: { in: [acmePurposeId, globexPurposeId] } },
    });
    await prisma.dataSource.deleteMany({
      where: { id: { in: [acmeDataSourceId, globexDataSourceId] } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: [acmeRoleId, globexRoleId] } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: [acmeRoleId, globexRoleId] } },
    });
    await prisma.permission.delete({ where: { code: permissionCode } });
    await prisma.securityMeasure.deleteMany({
      where: { organizationId: { in: [acmeOrgId, globexOrgId] } },
    });
    await prisma.dataPrincipal.deleteMany({
      where: { organizationId: { in: [acmeOrgId, globexOrgId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [acmeOrgId, globexOrgId] } },
    });
    await prisma.$disconnect();
  });

  describe("DataPrincipal (compound unique key includes organizationId)", () => {
    it("findMany never returns Globex rows", async () => {
      const rows = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.dataPrincipal.findMany({}),
      );
      const ids = rows.map((r: { id: string }) => r.id);
      expect(ids).toContain(acmePrincipalId);
      expect(ids).not.toContain(globexPrincipalId);
      expect(
        rows.every(
          (r: { organizationId: string }) => r.organizationId === acmeOrgId,
        ),
      ).toBe(true);
    });

    it("count/aggregate/groupBy are scoped to Acme", async () => {
      const [count, aggregate, grouped] = await TenantContext.run(acmeCtx, () =>
        Promise.all([
          prisma.scoped.dataPrincipal.count({}),
          prisma.scoped.dataPrincipal.aggregate({ _count: { _all: true } }),
          prisma.scoped.dataPrincipal.groupBy({
            by: ["ageStatus"],
            _count: { _all: true },
          }),
        ]),
      );

      expect(count).toBeGreaterThan(0);
      expect(aggregate._count._all).toBe(count);
      expect(grouped.reduce((sum, g) => sum + g._count._all, 0)).toBe(count);

      // Neither number should include Globex's principal: Acme's raw count
      // over both orgs (unscoped) is strictly greater than the scoped count.
      const rawCountBothOrgs = await prisma.dataPrincipal.count({
        where: { organizationId: { in: [acmeOrgId, globexOrgId] } },
      });
      expect(count).toBeLessThan(rawCountBothOrgs);
    });

    it("findFirst by Globex's principal id returns null", async () => {
      const row = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.dataPrincipal.findFirst({
          where: { id: globexPrincipalId },
        }),
      );
      expect(row).toBeNull();
    });

    it("findUnique by Globex's principal id returns null (degrades to findFirst)", async () => {
      const row = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.dataPrincipal.findUnique({
          where: { id: globexPrincipalId },
        }),
      );
      expect(row).toBeNull();
    });

    it("findUniqueOrThrow by Globex's principal id throws (never returns another org's row)", async () => {
      await expect(
        TenantContext.run(acmeCtx, () =>
          prisma.scoped.dataPrincipal.findUniqueOrThrow({
            where: { id: globexPrincipalId },
          }),
        ),
      ).rejects.toThrow();
    });

    it("updateMany targeting Globex's id affects zero rows", async () => {
      const result = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.dataPrincipal.updateMany({
          where: { id: globexPrincipalId },
          data: { displayName: "Hacked via updateMany" },
        }),
      );
      expect(result.count).toBe(0);
    });

    it("update targeting Globex's id throws not-found and never touches the row", async () => {
      await expect(
        TenantContext.run(acmeCtx, () =>
          prisma.scoped.dataPrincipal.update({
            where: { id: globexPrincipalId },
            data: { displayName: "Hacked via update" },
          }),
        ),
      ).rejects.toThrow();

      const stillIntact = await prisma.dataPrincipal.findUnique({
        where: { id: globexPrincipalId },
      });
      expect(stillIntact?.displayName).toBe("Globex Principal");
    });

    it("update of Acme's own row by its compound unique key succeeds, returns the row, and survives changing the very field it was looked up by", async () => {
      // Regression test for fix round 1 / Important 4: the old
      // implementation refetched by the ORIGINAL (now-stale) where after
      // changing `reference`, and threw P2025 for a write that had
      // already committed. It must now refetch by primary key.
      const newReference = `DP-${randomUUID()}`;
      const updated = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.dataPrincipal.update({
          where: {
            organizationId_reference: {
              organizationId: acmeOrgId,
              reference: acmePrincipalReferenceHolder.value,
            },
          },
          data: {
            reference: newReference,
            displayName: "Renamed Acme Principal",
          },
        }),
      );

      expect(updated.id).toBe(acmePrincipalId);
      expect(updated.reference).toBe(newReference);
      expect(updated.displayName).toBe("Renamed Acme Principal");

      acmePrincipalReferenceHolder.value = newReference;
    });

    it("delete targeting Globex's id throws not-found and never deletes the row", async () => {
      await expect(
        TenantContext.run(acmeCtx, () =>
          prisma.scoped.dataPrincipal.delete({
            where: { id: globexPrincipalId },
          }),
        ),
      ).rejects.toThrow();

      const stillThere = await prisma.dataPrincipal.findUnique({
        where: { id: globexPrincipalId },
      });
      expect(stillThere).not.toBeNull();
    });

    it("a create without an explicit organizationId lands in Acme", async () => {
      const created = await TenantContext.run(acmeCtx, () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma.scoped.dataPrincipal.create({
          data: {
            reference: `DP-${randomUUID()}`,
            displayName: "New Acme Principal",
            // organizationId deliberately omitted -- the extension must supply it.
          } as any,
        }),
      );
      expect(created.organizationId).toBe(acmeOrgId);

      await prisma.dataPrincipal.delete({ where: { id: created.id } });
    });

    it("upsert creates in Acme when no match, and updates Acme's own row when one exists", async () => {
      const reference = `DP-${randomUUID()}`;

      const created = await TenantContext.run(acmeCtx, () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma.scoped.dataPrincipal.upsert({
          where: {
            organizationId_reference: { organizationId: acmeOrgId, reference },
          },
          create: { reference, displayName: "Upserted Acme Principal" } as any,
          update: { displayName: "Should not be used" },
        }),
      );
      expect(created.organizationId).toBe(acmeOrgId);
      expect(created.displayName).toBe("Upserted Acme Principal");

      const updated = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.dataPrincipal.upsert({
          where: {
            organizationId_reference: { organizationId: acmeOrgId, reference },
          },
          create: {
            reference,
            displayName: "Should not be used either",
          } as never,
          update: { displayName: "Upserted Again" },
        }),
      );
      expect(updated.id).toBe(created.id);
      expect(updated.displayName).toBe("Upserted Again");

      await prisma.dataPrincipal.delete({ where: { id: created.id } });
    });

    it("upsert against Globex's reference from Acme's context creates a NEW Acme row rather than touching Globex's", async () => {
      // Acme has no row with Globex's reference, so the scoped findFirst
      // inside upsert finds nothing and takes the create branch --
      // exactly like the id-collision case discussed in the task 3 report.
      const globex = await prisma.dataPrincipal.findUniqueOrThrow({
        where: { id: globexPrincipalId },
      });

      const result = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.dataPrincipal.upsert({
          where: {
            organizationId_reference: {
              organizationId: acmeOrgId,
              reference: globex.reference,
            },
          },
          create: {
            reference: globex.reference,
            displayName: "Acme Impostor",
          } as never,
          update: { displayName: "Should not run" },
        }),
      );

      expect(result.organizationId).toBe(acmeOrgId);
      expect(result.id).not.toBe(globexPrincipalId);

      const globexUnchanged = await prisma.dataPrincipal.findUniqueOrThrow({
        where: { id: globexPrincipalId },
      });
      expect(globexUnchanged.displayName).toBe("Globex Principal");

      await prisma.dataPrincipal.delete({ where: { id: result.id } });
    });

    it("a service calling Prisma without passing organizationId at all still gets isolated results", async () => {
      // Stands in for a real service: this function never receives
      // organizationId as an argument and has no idea which tenant it is
      // running for. Isolation must come entirely from the ambient
      // TenantContext + the extension.
      async function listPrincipalsAsAService() {
        return prisma.scoped.dataPrincipal.findMany({});
      }

      const acmeRows = await TenantContext.run(
        acmeCtx,
        listPrincipalsAsAService,
      );
      const globexRows = await TenantContext.run(
        globexCtx,
        listPrincipalsAsAService,
      );

      expect(acmeRows.length).toBeGreaterThan(0);
      expect(globexRows.length).toBeGreaterThan(0);
      expect(
        acmeRows.every(
          (r: { organizationId: string }) => r.organizationId === acmeOrgId,
        ),
      ).toBe(true);
      expect(
        globexRows.every(
          (r: { organizationId: string }) => r.organizationId === globexOrgId,
        ),
      ).toBe(true);
    });
  });

  describe("SecurityMeasure (only unique key is id, not a compound tenant key)", () => {
    it("findUnique by Globex's id returns null under Acme context", async () => {
      const row = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.securityMeasure.findUnique({
          where: { id: globexSecurityMeasureId },
        }),
      );
      expect(row).toBeNull();
    });

    it("findFirst by Globex's id returns null under Acme context", async () => {
      const row = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.securityMeasure.findFirst({
          where: { id: globexSecurityMeasureId },
        }),
      );
      expect(row).toBeNull();
    });

    it("Acme can still findUnique its own row by id", async () => {
      const row = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.securityMeasure.findUnique({
          where: { id: acmeSecurityMeasureId },
        }),
      );
      expect(row?.id).toBe(acmeSecurityMeasureId);
    });

    it("delete targeting Globex's id throws not-found and never deletes the row", async () => {
      await expect(
        TenantContext.run(acmeCtx, () =>
          prisma.scoped.securityMeasure.delete({
            where: { id: globexSecurityMeasureId },
          }),
        ),
      ).rejects.toThrow();

      const stillThere = await prisma.securityMeasure.findUnique({
        where: { id: globexSecurityMeasureId },
      });
      expect(stillThere).not.toBeNull();
    });

    it("createMany without organizationId lands every row in Acme", async () => {
      const marker = `Rule-${randomUUID()}`;
      await TenantContext.run(acmeCtx, () =>
        prisma.scoped.securityMeasure.createMany({
          data: [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {
              ruleReference: marker,
              measureType: "MASKING",
              description: "created via createMany",
            } as any,
          ],
        }),
      );

      const rows = await prisma.securityMeasure.findMany({
        where: { ruleReference: marker },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.organizationId).toBe(acmeOrgId);

      await prisma.securityMeasure.deleteMany({
        where: { ruleReference: marker },
      });
    });
  });

  describe("Organization (self-scoped: fix round 1 / Critical 1)", () => {
    it("findMany returns only Acme's own organization row", async () => {
      const rows = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.organization.findMany({}),
      );
      expect(rows.map((r: { id: string }) => r.id)).toEqual([acmeOrgId]);
    });

    it("findUnique by Globex's org id returns null under Acme's context", async () => {
      const row = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.organization.findUnique({ where: { id: globexOrgId } }),
      );
      expect(row).toBeNull();
    });

    it("findUnique by Acme's own org id succeeds", async () => {
      const row = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.organization.findUnique({ where: { id: acmeOrgId } }),
      );
      expect(row?.id).toBe(acmeOrgId);
    });

    it("update targeting Globex's org id throws not-found and never touches the row", async () => {
      await expect(
        TenantContext.run(acmeCtx, () =>
          prisma.scoped.organization.update({
            where: { id: globexOrgId },
            data: { name: "Hacked" },
          }),
        ),
      ).rejects.toThrow();

      const stillThere = await prisma.organization.findUniqueOrThrow({
        where: { id: globexOrgId },
      });
      expect(stillThere.name).toBe("Globex");
    });

    it("update of Acme's own organization succeeds and returns the row", async () => {
      const updated = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.organization.update({
          where: { id: acmeOrgId },
          data: { legalName: "Acme Legal Name" },
        }),
      );
      expect(updated.id).toBe(acmeOrgId);
      expect(updated.legalName).toBe("Acme Legal Name");
    });

    it("create is blocked on the scoped client -- organizations are created via the raw PrismaService", async () => {
      await expect(
        TenantContext.run(acmeCtx, () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          prisma.scoped.organization.create({
            data: { id: randomUUID(), name: "Should never be created" },
          } as any),
        ),
      ).rejects.toThrow(/not available on the tenant-scoped client/);
    });

    it("createMany is blocked on the scoped client", async () => {
      await expect(
        TenantContext.run(acmeCtx, () =>
          prisma.scoped.organization.createMany({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: [
              { id: randomUUID(), name: "Should never be created" },
            ] as any,
          }),
        ),
      ).rejects.toThrow(/not available on the tenant-scoped client/);
    });
  });

  describe("RolePermission (indirect scoping through its parent Role)", () => {
    it("findMany scoped to Acme's role never returns Globex's grant, even by shared permissionCode", async () => {
      const rows = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.rolePermission.findMany({ where: { permissionCode } }),
      );
      expect(rows.map((r: { roleId: string }) => r.roleId)).toEqual([
        acmeRoleId,
      ]);
    });

    it("findFirst by Globex's roleId returns null under Acme context", async () => {
      const row = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.rolePermission.findFirst({
          where: { roleId: globexRoleId },
        }),
      );
      expect(row).toBeNull();
    });

    it("create with Acme's own roleId succeeds", async () => {
      const otherPermissionCode = `test.permission.other.${randomUUID()}`;
      await prisma.permission.create({
        data: { code: otherPermissionCode, description: "x", category: "TEST" },
      });

      const created = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.rolePermission.create({
          data: { roleId: acmeRoleId, permissionCode: otherPermissionCode },
        }),
      );
      expect(created.roleId).toBe(acmeRoleId);

      await prisma.rolePermission.deleteMany({
        where: { roleId: acmeRoleId, permissionCode: otherPermissionCode },
      });
      await prisma.permission.delete({ where: { code: otherPermissionCode } });
    });

    it("create with Globex's roleId from Acme's context is rejected (fix round 1 / Critical 2)", async () => {
      // Before the fix, this silently attached a grant to another
      // tenant's role: `roleId` has no organizationId of its own, so
      // nothing stopped it. Now the extension resolves `roleId` through
      // the SCOPED `role` delegate before allowing the create.
      await expect(
        TenantContext.run(acmeCtx, () =>
          prisma.scoped.rolePermission.create({
            data: { roleId: globexRoleId, permissionCode },
          }),
        ),
      ).rejects.toThrow();

      const stillNotThere = await prisma.rolePermission.findFirst({
        where: { roleId: globexRoleId, permissionCode },
      });
      // The only grant on Globex's role for this code is the one seeded in
      // beforeAll -- exactly one, not two.
      const allGlobexGrantsForCode = await prisma.rolePermission.findMany({
        where: { roleId: globexRoleId, permissionCode },
      });
      expect(allGlobexGrantsForCode).toHaveLength(1);
      expect(stillNotThere).not.toBeNull();
    });

    it("createMany with a mix of Acme and Globex roleIds from Acme's context is rejected entirely", async () => {
      const otherPermissionCode = `test.permission.createmany.${randomUUID()}`;
      await prisma.permission.create({
        data: { code: otherPermissionCode, description: "x", category: "TEST" },
      });

      await expect(
        TenantContext.run(acmeCtx, () =>
          prisma.scoped.rolePermission.createMany({
            data: [
              { roleId: acmeRoleId, permissionCode: otherPermissionCode },
              { roleId: globexRoleId, permissionCode: otherPermissionCode },
            ],
          }),
        ),
      ).rejects.toThrow();

      const acmeGrant = await prisma.rolePermission.findFirst({
        where: { roleId: acmeRoleId, permissionCode: otherPermissionCode },
      });
      // Verified all-or-nothing at the ownership-check level: the Acme
      // half never got a chance to be written either, since the check
      // runs (and rejects) before `query()` is ever called.
      expect(acmeGrant).toBeNull();

      await prisma.permission.delete({ where: { code: otherPermissionCode } });
    });
  });

  describe("DataSourcePurpose (indirect scoping; write-then-nested-read is Check 1's exact failure mode)", () => {
    it("findMany scoped to Acme's data source never returns Globex's attachment", async () => {
      const rows = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.dataSourcePurpose.findMany({}),
      );
      expect(rows.map((r: { dataSourceId: string }) => r.dataSourceId)).toEqual(
        [acmeDataSourceId],
      );
    });

    it("create attaching Globex's purposeId to Acme's own data source is rejected (fix round 1 / Critical 2)", async () => {
      // This is exactly Task 13's shape: attach-a-purpose, taking
      // `purposeId` from a request body, onto a data source the caller
      // legitimately owns.
      await expect(
        TenantContext.run(acmeCtx, () =>
          prisma.scoped.dataSourcePurpose.create({
            data: {
              dataSourceId: acmeDataSourceId,
              purposeId: globexPurposeId,
            },
          }),
        ),
      ).rejects.toThrow();

      const leaked = await prisma.dataSource.findUnique({
        where: { id: acmeDataSourceId },
        include: { purposes: { include: { purpose: true } } },
      });
      expect(
        leaked?.purposes.some((p) => p.purposeId === globexPurposeId),
      ).toBe(false);
    });

    it("create attaching Acme's own purposeId to Acme's own data source succeeds", async () => {
      const otherPurpose = await prisma.processingPurpose.create({
        data: {
          organizationId: acmeOrgId,
          code: `OTHER_${randomUUID()}`,
          name: "Other purpose",
          description: "x",
          lawfulBasis: "CONSENT",
          basisJustification: "test",
        },
      });

      const created = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.dataSourcePurpose.create({
          data: { dataSourceId: acmeDataSourceId, purposeId: otherPurpose.id },
        }),
      );
      expect(created.purposeId).toBe(otherPurpose.id);

      await prisma.dataSourcePurpose.deleteMany({
        where: { dataSourceId: acmeDataSourceId, purposeId: otherPurpose.id },
      });
      await prisma.processingPurpose.delete({ where: { id: otherPurpose.id } });
    });
  });

  describe("Nested writes/reads: the documented contract boundary (Critical 3)", () => {
    it("the mandated idiom -- resolve a caller-supplied foreign id through the SCOPED delegate before using it -- rejects a cross-tenant connect", async () => {
      async function createIdentityLinkAsAService(
        candidateDataPrincipalId: string,
        normalizedRecordId: string,
      ) {
        // THE RULE from tenant.extension.ts's CONTRACT BOUNDARY note: any
        // service accepting a caller-supplied foreign id for a scoped
        // relation resolves it through the scoped delegate first.
        await prisma.scoped.dataPrincipal.findUniqueOrThrow({
          where: { id: candidateDataPrincipalId },
        });

        return prisma.scoped.identityLink.create({
          data: {
            dataPrincipal: { connect: { id: candidateDataPrincipalId } },
            normalizedRecord: { connect: { id: normalizedRecordId } },
            confidence: "EXACT",
            matchedOn: {},
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        });
      }

      await expect(
        TenantContext.run(acmeCtx, () =>
          createIdentityLinkAsAService(
            globexPrincipalId,
            acmeNormalizedRecordId,
          ),
        ),
      ).rejects.toThrow();

      const leaked = await prisma.identityLink.findFirst({
        where: {
          dataPrincipalId: globexPrincipalId,
          normalizedRecordId: acmeNormalizedRecordId,
        },
      });
      expect(leaked).toBeNull();
    });

    it("the same idiom lets a legitimate same-tenant connect through", async () => {
      async function createIdentityLinkAsAService(
        candidateDataPrincipalId: string,
        normalizedRecordId: string,
      ) {
        await prisma.scoped.dataPrincipal.findUniqueOrThrow({
          where: { id: candidateDataPrincipalId },
        });
        return prisma.scoped.identityLink.create({
          data: {
            dataPrincipal: { connect: { id: candidateDataPrincipalId } },
            normalizedRecord: { connect: { id: normalizedRecordId } },
            confidence: "EXACT",
            matchedOn: {},
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        });
      }

      const created = await TenantContext.run(acmeCtx, () =>
        createIdentityLinkAsAService(acmePrincipalId, acmeNormalizedRecordId),
      );
      expect(created.dataPrincipalId).toBe(acmePrincipalId);

      await prisma.identityLink.delete({ where: { id: created.id } });
    });
  });

  describe("$transaction support for the overridden operations (Important 5, determined empirically)", () => {
    it("the INTERACTIVE form works for overridden findUnique/update", async () => {
      const result = await TenantContext.run(acmeCtx, () =>
        prisma.scoped.$transaction(async (tx) => {
          const found = await tx.dataPrincipal.findUnique({
            where: { id: acmePrincipalId },
          });
          expect(found?.id).toBe(acmePrincipalId);
          return tx.securityMeasure.findUnique({
            where: { id: acmeSecurityMeasureId },
          });
        }),
      );
      expect(result?.id).toBe(acmeSecurityMeasureId);
    });

    it("the ARRAY form rejects an overridden op (documented limitation, not silently wrong)", async () => {
      // $transaction([...]) validates its array SYNCHRONOUSLY and throws
      // immediately rather than returning a rejected promise -- wrap in an
      // async IIFE so `.rejects` has an actual promise to assert on.
      await expect(
        (async () =>
          TenantContext.run(acmeCtx, () => {
            const op = prisma.scoped.dataPrincipal.findUnique({
              where: { id: acmePrincipalId },
            });
            return prisma.scoped.$transaction([op as never]);
          }))(),
      ).rejects.toThrow(/Prisma Client promises/);
    });

    it("the ARRAY form still works for a non-overridden op (findMany)", async () => {
      const [rows] = await TenantContext.run(acmeCtx, () => {
        const op = prisma.scoped.dataPrincipal.findMany({
          where: { id: acmePrincipalId },
        });
        return prisma.scoped.$transaction([op]);
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe("no tenant context bound", () => {
    it("a scoped query throws rather than silently running unscoped", async () => {
      await expect(prisma.scoped.dataPrincipal.findMany({})).rejects.toThrow(
        /no tenant context bound/,
      );
    });
  });
});
