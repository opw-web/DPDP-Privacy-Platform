import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";

/**
 * Task 7 gate (Check 18, spec lines 1102-1109): `PermissionsGuard`
 * actually enforces `@RequirePermission` server-side, not just as
 * metadata (Task 5 shipped the metadata only). Against the real Postgres
 * database and a fully bootstrapped Nest app (no mocks), matching this
 * codebase's existing e2e style.
 *
 * Every negative (403) assertion in this file has a POSITIVE CONTROL in
 * the SAME test: a fixture holding the permission, on the SAME route with
 * the SAME payload, asserted to succeed. Without that, a 403 would pass
 * just as well if the route did not exist, the guard denied everyone, or
 * a DTO validation rejected first -- the exact failure mode the task
 * brief calls out by name.
 *
 * Each test builds its OWN fresh organization/roles/employees with
 * randomUUID-suffixed names -- no test depends on another having run
 * first, or on the seeded demo org's current shape.
 */
describe("RBAC enforcement (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  const createdOrgIds: string[] = [];

  // Every permission code used below is a REAL catalogue code
  // (CAN_MANAGE_EMPLOYEES / CAN_CHANGE_ORG_SETTINGS) -- global, not
  // org-scoped, and potentially already referenced by other
  // organizations' roles (including the demo seed's). Upserted from the
  // REAL seed catalogue (`prisma/seed/permissions.ts`), never fabricated
  // with a made-up `category: "TEST"` (Task 7 review Minor) -- a
  // fabricated row would silently paper over that code going missing
  // from the real catalogue, and would permanently pollute the global
  // Permission table `GET /api/permissions` serves. NEVER deleted in
  // `afterAll` either way -- deleting a shared catalogue row would break
  // every other role/test that also references it via `RolePermission`.
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

  /**
   * Builds one organization with two employees: one whose role holds
   * exactly `grantedCodes`, and (optionally) a second whose role holds
   * none of them -- the no-permission fixture used as the negative case
   * across every test below.
   */
  async function createOrgWithEmployee(
    roleCode: string,
    permissionCodes: readonly string[],
  ): Promise<{
    organizationId: string;
    roleId: string;
    employeeId: string;
    email: string;
    accessToken: string;
  }> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `RBAC Test Org ${organizationId}` },
    });
    createdOrgIds.push(organizationId);

    for (const code of permissionCodes) {
      await ensurePermission(code);
    }

    const role = await prisma.role.create({
      data: {
        organizationId,
        code: roleCode,
        name: roleCode,
        isSystem: false,
        permissions: {
          create: permissionCodes.map((permissionCode) => ({ permissionCode })),
        },
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
      throw new Error(
        `Fixture login failed for ${email}: ${JSON.stringify(loginRes.body)}`,
      );
    }

    return {
      organizationId,
      roleId: role.id,
      employeeId: employee.id,
      email,
      accessToken: loginRes.body.accessToken as string,
    };
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
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${createdOrgIds})`;
      await prisma.refreshToken.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.employee.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { role: { organizationId: { in: createdOrgIds } } },
      });
      await prisma.role.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("POST /api/employees: CAN_MANAGE_EMPLOYEES succeeds, no permission gets 403 on the identical payload", async () => {
    const withPermission = await createOrgWithEmployee("HAS_PERM", [
      "CAN_MANAGE_EMPLOYEES",
    ]);
    const withoutPermission = await createOrgWithEmployee("NO_PERM", []);

    const payload = (roleId: string) => ({
      email: `created-${randomUUID()}@example.com`,
      fullName: "Created Employee",
      roleId,
      password: "SomePassword123!",
    });

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post("/api/employees")
      .set("Authorization", `Bearer ${withPermission.accessToken}`)
      .send(payload(withPermission.roleId));
    expect(okRes.status).toBe(201);

    // NEGATIVE, same route, same shape of payload, different org's own role.
    const deniedRes = await request(app.getHttpServer())
      .post("/api/employees")
      .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
      .send(payload(withoutPermission.roleId));
    expect(deniedRes.status).toBe(403);
    // Task 7 review Minor: without this, a ForbiddenException thrown by
    // ANY other layer would satisfy a bare status assertion. The message
    // comes verbatim from permissions.guard.ts.
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_EMPLOYEES",
    );
  });

  it("GET /api/employees: CAN_MANAGE_EMPLOYEES succeeds, no permission gets 403", async () => {
    const withPermission = await createOrgWithEmployee("HAS_PERM_LIST", [
      "CAN_MANAGE_EMPLOYEES",
    ]);
    const withoutPermission = await createOrgWithEmployee("NO_PERM_LIST", []);

    const okRes = await request(app.getHttpServer())
      .get("/api/employees")
      .set("Authorization", `Bearer ${withPermission.accessToken}`);
    expect(okRes.status).toBe(200);
    expect(Array.isArray(okRes.body)).toBe(true);

    const deniedRes = await request(app.getHttpServer())
      .get("/api/employees")
      .set("Authorization", `Bearer ${withoutPermission.accessToken}`);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_EMPLOYEES",
    );
  });

  it("PATCH /api/employees/:id: CAN_MANAGE_EMPLOYEES succeeds, no permission gets 403 on the identical target/payload", async () => {
    const withPermission = await createOrgWithEmployee("HAS_PERM_UPDATE", [
      "CAN_MANAGE_EMPLOYEES",
    ]);
    const withoutPermission = await createOrgWithEmployee("NO_PERM_UPDATE", []);

    const okRes = await request(app.getHttpServer())
      .patch(`/api/employees/${withPermission.employeeId}`)
      .set("Authorization", `Bearer ${withPermission.accessToken}`)
      .send({ fullName: "Renamed OK" });
    expect(okRes.status).toBe(200);

    const deniedRes = await request(app.getHttpServer())
      .patch(`/api/employees/${withoutPermission.employeeId}`)
      .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
      .send({ fullName: "Should Not Rename" });
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_EMPLOYEES",
    );
  });

  it("POST /api/employees/:id/reset-password: CAN_MANAGE_EMPLOYEES succeeds, no permission gets 403", async () => {
    const withPermission = await createOrgWithEmployee("HAS_PERM_RESET", [
      "CAN_MANAGE_EMPLOYEES",
    ]);
    const withoutPermission = await createOrgWithEmployee("NO_PERM_RESET", []);

    const okRes = await request(app.getHttpServer())
      .post(`/api/employees/${withPermission.employeeId}/reset-password`)
      .set("Authorization", `Bearer ${withPermission.accessToken}`)
      .send({ newPassword: "BrandNewPassword123!" });
    expect(okRes.status).toBe(201);

    const deniedRes = await request(app.getHttpServer())
      .post(`/api/employees/${withoutPermission.employeeId}/reset-password`)
      .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
      .send({ newPassword: "BrandNewPassword123!" });
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_EMPLOYEES",
    );
  });

  it("PATCH /api/roles/:id/permissions: CAN_MANAGE_EMPLOYEES succeeds, no permission gets 403 on the identical target/payload", async () => {
    const withPermission = await createOrgWithEmployee("HAS_PERM_ROLEPATCH", [
      "CAN_MANAGE_EMPLOYEES",
    ]);
    const withoutPermission = await createOrgWithEmployee(
      "NO_PERM_ROLEPATCH",
      [],
    );
    // Non-system target roles, one per org, so each caller patches a role
    // in ITS OWN organization (the tenant-scoping check is not what this
    // test is about).
    const targetRoleForOk = await prisma.role.create({
      data: {
        organizationId: withPermission.organizationId,
        code: `TARGET_${randomUUID()}`,
        name: "Target Role",
        isSystem: false,
      },
    });
    const targetRoleForDenied = await prisma.role.create({
      data: {
        organizationId: withoutPermission.organizationId,
        code: `TARGET_${randomUUID()}`,
        name: "Target Role",
        isSystem: false,
      },
    });

    const okRes = await request(app.getHttpServer())
      .patch(`/api/roles/${targetRoleForOk.id}/permissions`)
      .set("Authorization", `Bearer ${withPermission.accessToken}`)
      .send({ permissionCodes: [] });
    expect(okRes.status).toBe(200);

    const deniedRes = await request(app.getHttpServer())
      .patch(`/api/roles/${targetRoleForDenied.id}/permissions`)
      .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
      .send({ permissionCodes: [] });
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_EMPLOYEES",
    );
  });

  it("PATCH /api/organization: CAN_CHANGE_ORG_SETTINGS succeeds, no permission gets 403 on the identical payload", async () => {
    const withPermission = await createOrgWithEmployee("HAS_PERM_ORG", [
      "CAN_CHANGE_ORG_SETTINGS",
    ]);
    const withoutPermission = await createOrgWithEmployee("NO_PERM_ORG", []);

    const okRes = await request(app.getHttpServer())
      .patch("/api/organization")
      .set("Authorization", `Bearer ${withPermission.accessToken}`)
      .send({ legalName: "Renamed Legal Name" });
    expect(okRes.status).toBe(200);

    const deniedRes = await request(app.getHttpServer())
      .patch("/api/organization")
      .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
      .send({ legalName: "Should Not Rename" });
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_CHANGE_ORG_SETTINGS",
    );
  });

  it("enforcement is by permission code, never by role name: a role literally named 'DPO' with no permissions is denied, a role literally named 'AUDITOR' holding CAN_MANAGE_EMPLOYEES is allowed", async () => {
    // Proves PermissionsGuard cannot contain (and did not accidentally
    // regress into) `if (role.code === 'DPO')`-style logic: the role
    // NAMES here are deliberately swapped against what their PERMISSIONS
    // would suggest.
    const fakeDpoNoPerm = await createOrgWithEmployee("DPO", []);
    const fakeAuditorWithPerm = await createOrgWithEmployee("AUDITOR", [
      "CAN_MANAGE_EMPLOYEES",
    ]);

    const payload = (roleId: string) => ({
      email: `namecheck-${randomUUID()}@example.com`,
      fullName: "Name Check Employee",
      roleId,
      password: "SomePassword123!",
    });

    const deniedRes = await request(app.getHttpServer())
      .post("/api/employees")
      .set("Authorization", `Bearer ${fakeDpoNoPerm.accessToken}`)
      .send(payload(fakeDpoNoPerm.roleId));
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_EMPLOYEES",
    );

    const okRes = await request(app.getHttpServer())
      .post("/api/employees")
      .set("Authorization", `Bearer ${fakeAuditorWithPerm.accessToken}`)
      .send(payload(fakeAuditorWithPerm.roleId));
    expect(okRes.status).toBe(201);
  });

  it("a revoked permission takes effect on the very next request, without the actor's still-valid access token changing (proves the guard's per-request resolution is never a stale process-level cache)", async () => {
    const employee = await createOrgWithEmployee("REVOKE_ME", [
      "CAN_MANAGE_EMPLOYEES",
    ]);

    // Before revocation: succeeds.
    const beforeRes = await request(app.getHttpServer())
      .get("/api/employees")
      .set("Authorization", `Bearer ${employee.accessToken}`);
    expect(beforeRes.status).toBe(200);

    // A second admin-shaped actor in the SAME organization, so the
    // revocation itself goes through PermissionsGuard too (not a raw DB
    // write bypassing the guard).
    const adminRole = await prisma.role.create({
      data: {
        organizationId: employee.organizationId,
        code: `REVOKER_ADMIN_${randomUUID()}`,
        name: "Revoker Admin",
        isSystem: false,
        permissions: { create: [{ permissionCode: "CAN_MANAGE_EMPLOYEES" }] },
      },
    });
    const adminPassword = "CorrectHorseBattery9!";
    const adminEmail = `revoker-${randomUUID()}@example.com`;
    await prisma.employee.create({
      data: {
        organizationId: employee.organizationId,
        email: adminEmail,
        fullName: "Revoker Admin",
        roleId: adminRole.id,
        passwordHash: await argon2.hash(adminPassword, {
          type: argon2.argon2id,
        }),
        status: "ACTIVE",
      },
    });
    const adminLoginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: adminEmail, password: adminPassword });
    expect(adminLoginRes.status).toBe(200);
    const adminAccessToken = adminLoginRes.body.accessToken as string;

    const revokeRes = await request(app.getHttpServer())
      .patch(`/api/roles/${employee.roleId}/permissions`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ permissionCodes: [] });
    expect(revokeRes.status).toBe(200);

    // Same, still-unexpired access token as `beforeRes` -- no re-login.
    const afterRes = await request(app.getHttpServer())
      .get("/api/employees")
      .set("Authorization", `Bearer ${employee.accessToken}`);
    expect(afterRes.status).toBe(403);
    expect(afterRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_EMPLOYEES",
    );
  });

  it("a missing/garbage token still gets 401 before any permission check runs", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/employees")
      .set("Authorization", "Bearer garbage-token")
      .send({
        email: `nope-${randomUUID()}@example.com`,
        fullName: "Nope",
        roleId: randomUUID(),
        password: "SomePassword123!",
      });
    expect(res.status).toBe(401);
  });
});
