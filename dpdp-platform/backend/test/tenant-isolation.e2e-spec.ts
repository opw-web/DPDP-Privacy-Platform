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
 * organizations, Acme and Globex, and exercises the extension against two
 * different model shapes on purpose:
 *   - DataPrincipal: unique key is a compound tenant key
 *     (`organizationId, reference`) -- the case the extension can satisfy
 *     "for free".
 *   - SecurityMeasure: unique key is `id` alone -- the classic hole
 *     (`findUnique({ where: { id } })` cannot carry an extra
 *     `organizationId` in Prisma's typed where) that the findUnique ->
 *     findFirst degrade exists to close.
 *
 * A third block exercises RolePermission, the indirect-scoping decision
 * (no organizationId column of its own; scoped through its parent Role).
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

    await prisma.organization.createMany({
      data: [
        { id: acmeOrgId, name: "Acme" },
        { id: globexOrgId, name: "Globex" },
      ],
    });

    // Seeding happens on the raw (unscoped) PrismaService, deliberately --
    // there is no tenant context yet at seed time, and seeding is exactly
    // the kind of migration/setup code the raw client exists for.
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
  });

  afterAll(async () => {
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
  });

  describe("no tenant context bound", () => {
    it("a scoped query throws rather than silently running unscoped", async () => {
      await expect(prisma.scoped.dataPrincipal.findMany({})).rejects.toThrow(
        /no tenant context bound/,
      );
    });
  });
});
