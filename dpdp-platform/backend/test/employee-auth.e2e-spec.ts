import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import type { AuditEvent } from "@prisma/client";
import { runSeed } from "../prisma/seed";
import { PERMISSIONS } from "../prisma/seed/permissions";

/**
 * Task 5 gate: employee login/refresh/logout, refresh-token rotation and
 * reuse-family revocation, the caller-supplied-roleId tenant check, and
 * the seed's idempotency and role/permission fidelity -- all against the
 * real Postgres database and a fully bootstrapped Nest app (no mocks),
 * matching this codebase's existing e2e style (see
 * tenant-isolation.e2e-spec.ts, audit.e2e-spec.ts).
 */
describe("Employee auth (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();

  const createdOrgIds: string[] = [];

  async function createOrgWithRoleAndEmployee(opts: {
    email: string;
    password: string;
    roleCode?: string;
    // Task 7: PermissionsGuard now enforces @RequirePermission for real,
    // so a test whose employee needs to reach a permission-gated route
    // must ask for the exact real permission code(s) here -- a throwaway
    // permission (below) is no longer enough on its own. Real catalogue
    // codes are upserted (never re-created) since `Permission` is a
    // global, not org-scoped, table.
    permissionCodes?: string[];
  }): Promise<{ organizationId: string; roleId: string; employeeId: string }> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `Test Org ${organizationId}` },
    });
    createdOrgIds.push(organizationId);

    // Permission rows are global -- reuse if already seeded, otherwise
    // create a throwaway one so Role -> RolePermission has something to
    // point at.
    const permissionCode = `test.employee-auth.${randomUUID()}`;
    await prisma.permission.create({
      data: {
        code: permissionCode,
        description: "throwaway test permission",
        category: "TEST",
      },
    });

    const extraPermissionCodes = opts.permissionCodes ?? [];
    for (const code of extraPermissionCodes) {
      // Task 7 review Minor: source the row from the REAL seed catalogue
      // instead of fabricating one with `category: "TEST"`. Fabricating
      // it would (a) permanently pollute the global Permission table
      // GET /api/permissions serves with a fake category, and (b) mask a
      // real failure -- if this code were ever removed from
      // prisma/seed/permissions.ts, a fabricated upsert would keep
      // silently recreating it and every test using it would stay green
      // for the wrong reason. Asserting membership first makes that
      // failure loud instead.
      const catalogueEntry = PERMISSIONS.find((p) => p.code === code);
      if (!catalogueEntry) {
        throw new Error(
          `Fixture requested permission code "${code}" which is not in ` +
            "the real seed catalogue (prisma/seed/permissions.ts).",
        );
      }
      await prisma.permission.upsert({
        where: { code },
        create: catalogueEntry,
        update: {},
      });
    }

    const role = await prisma.role.create({
      data: {
        organizationId,
        code: opts.roleCode ?? "TEST_ROLE",
        name: "Test Role",
        permissions: {
          create: [
            { permissionCode },
            ...extraPermissionCodes.map((code) => ({ permissionCode: code })),
          ],
        },
      },
    });

    const passwordHash = await argon2.hash(opts.password, {
      type: argon2.argon2id,
    });
    const employee = await prisma.employee.create({
      data: {
        organizationId,
        email: opts.email,
        fullName: "Test Employee",
        roleId: role.id,
        passwordHash,
        status: "ACTIVE",
      },
    });

    return { organizationId, roleId: role.id, employeeId: employee.id };
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
      await Promise.all(
        createdOrgIds.map(
          (id) =>
            prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ${id}`,
        ),
      );
      // AuditEvent has no FK to Organization and is append-only (deleting
      // it is rejected by the DB triggers) -- left in place deliberately,
      // same convention as audit.e2e-spec.ts.
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

  function decodeJwtPayload(token: string): Record<string, unknown> {
    const [, payload] = token.split(".");
    return JSON.parse(
      Buffer.from(payload as string, "base64url").toString("utf8"),
    );
  }

  function extractRefreshCookie(res: request.Response): string {
    const setCookie = res.headers["set-cookie"] as unknown as
      string[] | undefined;
    const cookie = setCookie?.find((c) =>
      c.startsWith("employee_refresh_token="),
    );
    if (!cookie) {
      throw new Error("No employee_refresh_token cookie in response");
    }
    return cookie.split(";")[0] as string;
  }

  it("login succeeds and returns an access token with aud: employee", async () => {
    const { organizationId } = await createOrgWithRoleAndEmployee({
      email: `login-ok-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId },
    });

    const res = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: employee.email, password: "CorrectHorseBattery9!" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    const payload = decodeJwtPayload(res.body.accessToken);
    expect(payload["aud"]).toBe("employee");
    expect(payload["organizationId"]).toBe(organizationId);
    expect(extractRefreshCookie(res)).toMatch(/^employee_refresh_token=/);
  });

  it("wrong password returns 401 and writes EMPLOYEE_LOGIN_FAILED, identical to an unknown email", async () => {
    const { organizationId } = await createOrgWithRoleAndEmployee({
      email: `login-bad-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId },
    });

    const wrongPasswordRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: employee.email, password: "wrong-password" });
    const unknownEmailRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({
        email: `nobody-${randomUUID()}@example.com`,
        password: "anything",
      });

    expect(wrongPasswordRes.status).toBe(401);
    expect(unknownEmailRes.status).toBe(401);
    // "Must not reveal whether the email exists": identical response body.
    expect(wrongPasswordRes.body).toEqual(unknownEmailRes.body);

    const events = await prisma.auditEvent.findMany({
      where: { organizationId, action: "EMPLOYEE_LOGIN_FAILED" },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events[0] as AuditEvent;
    expect(event.resourceId).toBe(employee.id);
  });

  it("refresh rotates the token and the old one then fails", async () => {
    const { organizationId } = await createOrgWithRoleAndEmployee({
      email: `refresh-ok-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: employee.email, password: "CorrectHorseBattery9!" });
    const oldCookie = extractRefreshCookie(loginRes);

    const refreshRes = await request(app.getHttpServer())
      .post("/api/auth/employee/refresh")
      .set("Cookie", oldCookie);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toEqual(expect.any(String));
    const newCookie = extractRefreshCookie(refreshRes);
    expect(newCookie).not.toBe(oldCookie);

    // The OLD refresh token was rotated away -- replaying it now fails.
    // (This IS a reuse of an already-revoked token, so per spec it also
    // revokes the whole family -- covered on its own in the next test.
    // Not asserted again here to keep this test's scope to "rotation
    // happened and the old token is now dead".)
    const replayOldRes = await request(app.getHttpServer())
      .post("/api/auth/employee/refresh")
      .set("Cookie", oldCookie);
    expect(replayOldRes.status).toBe(401);
  });

  it("replaying a revoked refresh token revokes the family and writes TOKEN_REUSE_DETECTED", async () => {
    const { organizationId } = await createOrgWithRoleAndEmployee({
      email: `reuse-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: employee.email, password: "CorrectHorseBattery9!" });
    const firstCookie = extractRefreshCookie(loginRes);

    // Rotate once -- firstCookie is now revoked, secondCookie is active.
    const rotateRes = await request(app.getHttpServer())
      .post("/api/auth/employee/refresh")
      .set("Cookie", firstCookie);
    expect(rotateRes.status).toBe(200);
    const secondCookie = extractRefreshCookie(rotateRes);

    // Replay the already-revoked firstCookie: this is the attack this
    // mechanism exists to catch.
    const replayRes = await request(app.getHttpServer())
      .post("/api/auth/employee/refresh")
      .set("Cookie", firstCookie);
    expect(replayRes.status).toBe(401);

    const reuseEvents = await prisma.auditEvent.findMany({
      where: { organizationId, action: "TOKEN_REUSE_DETECTED" },
    });
    expect(reuseEvents.length).toBeGreaterThanOrEqual(1);

    // The family is now fully revoked -- even the still-unexpired
    // secondCookie (never itself replayed) must now fail too.
    const secondCookieAfterReuseRes = await request(app.getHttpServer())
      .post("/api/auth/employee/refresh")
      .set("Cookie", secondCookie);
    expect(secondCookieAfterReuseRes.status).toBe(401);

    const activeTokens = await prisma.refreshToken.findMany({
      where: {
        organizationId,
        actorType: "EMPLOYEE",
        actorId: employee.id,
        revokedAt: null,
      },
    });
    expect(activeTokens).toHaveLength(0);
  });

  it("logout revokes the refresh token", async () => {
    const { organizationId } = await createOrgWithRoleAndEmployee({
      email: `logout-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: employee.email, password: "CorrectHorseBattery9!" });
    const cookie = extractRefreshCookie(loginRes);

    const logoutRes = await request(app.getHttpServer())
      .post("/api/auth/employee/logout")
      .set("Cookie", cookie);
    expect(logoutRes.status).toBe(200);

    const afterLogoutRefreshRes = await request(app.getHttpServer())
      .post("/api/auth/employee/refresh")
      .set("Cookie", cookie);
    expect(afterLogoutRefreshRes.status).toBe(401);
  });

  it("GET /api/auth/employee/me requires a valid access token and rejects a missing/garbage one", async () => {
    const { organizationId } = await createOrgWithRoleAndEmployee({
      email: `me-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId },
    });

    const noTokenRes = await request(app.getHttpServer()).get(
      "/api/auth/employee/me",
    );
    expect(noTokenRes.status).toBe(401);

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: employee.email, password: "CorrectHorseBattery9!" });

    const meRes = await request(app.getHttpServer())
      .get("/api/auth/employee/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(employee.email);
  });

  it("GET /api/auth/employee/me's permissions field is exactly what PermissionsGuard resolves -- a higher-privileged role is let through a CAN_VIEW_AUDIT_LOG route the response says it holds, a lower-privileged role is rejected by the SAME guard for a code the response correctly omits", async () => {
    // Task 5 gap this test closes: EmployeeAuthController.me() returned
    // `role` but no resolved `permissions` array, so the frontend's
    // `<PermissionGate permission="CAN_X">` had nothing to gate on except
    // comparing role names -- forbidden project-wide. The fix reuses
    // PermissionsGuard's own relation (`employee.role.permissions`)
    // instead of a second, hand-maintained mapping; this test proves that
    // reuse by checking the response against the REAL guard's decision on
    // a real `@RequirePermission('CAN_VIEW_AUDIT_LOG')` route
    // (`GET /api/audit-events`), not just against the DB row in isolation
    // -- so a future change that lets the two resolutions drift apart
    // fails here.
    const higherEmail = `me-perms-higher-${randomUUID()}@example.com`;
    const higherPassword = "CorrectHorseBattery9!";
    const { organizationId: higherOrgId } = await createOrgWithRoleAndEmployee(
      {
        email: higherEmail,
        password: higherPassword,
        permissionCodes: ["CAN_VIEW_AUDIT_LOG"],
      },
    );

    const lowerEmail = `me-perms-lower-${randomUUID()}@example.com`;
    const lowerPassword = "CorrectHorseBattery9!";
    // No extra permissionCodes: this role holds only the fixture's own
    // throwaway permission, i.e. strictly fewer real catalogue codes than
    // the "higher" role above -- in particular, no CAN_VIEW_AUDIT_LOG.
    const { organizationId: lowerOrgId } = await createOrgWithRoleAndEmployee({
      email: lowerEmail,
      password: lowerPassword,
    });

    async function loginAndFetchMe(
      email: string,
      password: string,
      organizationId: string,
    ): Promise<{ accessToken: string; permissions: string[] }> {
      const loginRes = await request(app.getHttpServer())
        .post("/api/auth/employee/login")
        .send({ email, password });
      expect(loginRes.status).toBe(200);
      const accessToken = loginRes.body.accessToken as string;

      const meRes = await request(app.getHttpServer())
        .get("/api/auth/employee/me")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(meRes.status).toBe(200);
      expect(Array.isArray(meRes.body.permissions)).toBe(true);

      // Exactness against the database row PermissionsGuard itself reads
      // (Employee -> Role -> RolePermission): the response must contain
      // every code the role holds and nothing it doesn't.
      const dbEmployee = await prisma.employee.findFirstOrThrow({
        where: { organizationId },
        include: { role: { include: { permissions: true } } },
      });
      const dbCodes = dbEmployee.role.permissions.map((p) => p.permissionCode);
      expect(new Set(meRes.body.permissions)).toEqual(new Set(dbCodes));
      expect(meRes.body.permissions).toHaveLength(dbCodes.length);

      return {
        accessToken,
        permissions: meRes.body.permissions as string[],
      };
    }

    const higher = await loginAndFetchMe(
      higherEmail,
      higherPassword,
      higherOrgId,
    );
    const lower = await loginAndFetchMe(lowerEmail, lowerPassword, lowerOrgId);

    expect(higher.permissions).toContain("CAN_VIEW_AUDIT_LOG");
    expect(lower.permissions).not.toContain("CAN_VIEW_AUDIT_LOG");

    // Now prove it against the ACTUAL guard, not just the DB row: the
    // higher-privileged employee's token must be let through
    // `@RequirePermission('CAN_VIEW_AUDIT_LOG')` on a real route, and the
    // lower-privileged employee's token -- which the /me response above
    // correctly said lacks that code -- must be rejected by the SAME
    // guard.
    const higherAuditRes = await request(app.getHttpServer())
      .get("/api/audit-events")
      .set("Authorization", `Bearer ${higher.accessToken}`);
    expect(higherAuditRes.status).toBe(200);

    const lowerAuditRes = await request(app.getHttpServer())
      .get("/api/audit-events")
      .set("Authorization", `Bearer ${lower.accessToken}`);
    expect(lowerAuditRes.status).toBe(403);
  });

  it("creating an employee with another organization's roleId fails (with a positive control proving the endpoint itself works)", async () => {
    const orgA = await createOrgWithRoleAndEmployee({
      email: `org-a-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
      // POST /api/employees is @RequirePermission("CAN_MANAGE_EMPLOYEES")
      // (Task 7) -- orgA's employee is the one calling it below.
      permissionCodes: ["CAN_MANAGE_EMPLOYEES"],
    });
    const orgB = await createOrgWithRoleAndEmployee({
      email: `org-b-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({
        email: (
          await prisma.employee.findFirstOrThrow({
            where: { organizationId: orgA.organizationId },
          })
        ).email,
        password: "CorrectHorseBattery9!",
      });
    const accessToken = loginRes.body.accessToken as string;

    // POSITIVE CONTROL (task 5 review, Important 2): without this, a
    // dead/mis-wired endpoint would make the negative assertion below
    // pass for the wrong reason -- >=400 and "no row created" both hold
    // if POST /api/employees is simply broken. Proving orgA's OWN roleId
    // succeeds first attributes the negative case specifically to the
    // tenant check, not to endpoint breakage.
    const ownRoleRes = await request(app.getHttpServer())
      .post("/api/employees")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: `same-org-${randomUUID()}@example.com`,
        fullName: "Should Be Created",
        roleId: orgA.roleId,
        password: "SomePassword123!",
      });
    expect(ownRoleRes.status).toBe(201);
    expect(ownRoleRes.body.id).toEqual(expect.any(String));
    expect(ownRoleRes.body.roleId).toBe(orgA.roleId);

    // orgB.roleId belongs to a DIFFERENT organization than the caller's
    // (orgA) -- this must fail (P2025-shaped 4xx/5xx), never silently
    // attach a cross-tenant role.
    const res = await request(app.getHttpServer())
      .post("/api/employees")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: `cross-tenant-${randomUUID()}@example.com`,
        fullName: "Should Not Be Created",
        roleId: orgB.roleId,
        password: "SomePassword123!",
      });

    expect(res.status).toBeGreaterThanOrEqual(400);

    const created = await prisma.employee.findFirst({
      where: { roleId: orgB.roleId, organizationId: orgA.organizationId },
    });
    expect(created).toBeNull();
  });

  it("employee API responses never contain passwordHash, on both the list and single-get paths", async () => {
    // Task 5 review CRITICAL fix: list()/get()/create()/update() used to
    // return the full Prisma Employee row (no `select`), so
    // GET /api/employees serialized every employee's argon2id hash to
    // any authenticated caller -- worse, to ANY authenticated employee
    // today, since @RequirePermission is metadata-only until Task 7.
    const org = await createOrgWithRoleAndEmployee({
      email: `no-hash-leak-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
      // Every /api/employees route this test exercises is
      // @RequirePermission("CAN_MANAGE_EMPLOYEES") (Task 7).
      permissionCodes: ["CAN_MANAGE_EMPLOYEES"],
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId: org.organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: employee.email, password: "CorrectHorseBattery9!" });
    const accessToken = loginRes.body.accessToken as string;

    const listRes = await request(app.getHttpServer())
      .get("/api/employees")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThan(0);
    for (const row of listRes.body) {
      expect(row).not.toHaveProperty("passwordHash");
    }

    const getRes = await request(app.getHttpServer())
      .get(`/api/employees/${employee.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).not.toHaveProperty("passwordHash");
    expect(getRes.body.id).toBe(employee.id);

    const createRes = await request(app.getHttpServer())
      .post("/api/employees")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: `no-hash-leak-created-${randomUUID()}@example.com`,
        fullName: "No Hash Leak",
        roleId: org.roleId,
        password: "SomePassword123!",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body).not.toHaveProperty("passwordHash");

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/employees/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ fullName: "No Hash Leak Renamed" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body).not.toHaveProperty("passwordHash");
  });

  it("disabling an employee revokes their existing refresh tokens AND the refresh path itself refuses a non-ACTIVE employee (C-1)", async () => {
    // Final whole-branch review, C-1 (Critical): before this fix, neither
    // half held -- the refresh path's `findFirstOrThrow` had no `status`
    // filter, and `update()`'s DISABLED branch never touched
    // `RefreshToken` rows. Either half alone leaves a hole: fixing only
    // the lookup leaves an already-issued token racing a still-in-flight
    // disable; fixing only revocation leaves the lookup able to mint a
    // BRAND NEW 7-day token for a disabled employee if a refresh lands
    // between the disable's read and its revocation. Both are asserted
    // below.
    const adminEmail = `disable-admin-${randomUUID()}@example.com`;
    const admin = await createOrgWithRoleAndEmployee({
      email: adminEmail,
      password: "CorrectHorseBattery9!",
      permissionCodes: ["CAN_MANAGE_EMPLOYEES"],
    });
    const targetPassword = "CorrectHorseBattery9!";
    const targetEmail = `disable-target-${randomUUID()}@example.com`;
    await prisma.employee.create({
      data: {
        organizationId: admin.organizationId,
        email: targetEmail,
        fullName: "Soon Disabled",
        roleId: admin.roleId,
        passwordHash: await argon2.hash(targetPassword, {
          type: argon2.argon2id,
        }),
        status: "ACTIVE",
      },
    });
    const target = await prisma.employee.findFirstOrThrow({
      where: { organizationId: admin.organizationId, email: targetEmail },
    });

    const adminLoginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: adminEmail, password: "CorrectHorseBattery9!" });
    const adminAccessToken = adminLoginRes.body.accessToken as string;

    const targetLoginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: targetEmail, password: targetPassword });
    expect(targetLoginRes.status).toBe(200);
    const targetCookie = extractRefreshCookie(targetLoginRes);

    // Positive control: the still-ACTIVE target's refresh token works
    // before the disable, so the 401 asserted below is attributable to
    // the disable and not to a broken refresh endpoint.
    const preDisableRefreshRes = await request(app.getHttpServer())
      .post("/api/auth/employee/refresh")
      .set("Cookie", targetCookie);
    expect(preDisableRefreshRes.status).toBe(200);
    const rotatedTargetCookie = extractRefreshCookie(preDisableRefreshRes);

    const disableRes = await request(app.getHttpServer())
      .patch(`/api/employees/${target.id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ status: "DISABLED" });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.status).toBe("DISABLED");

    // Half 1: revocation. The token rotated just before the disable must
    // now be dead in the database, not merely "would fail a future status
    // check" -- proves `update()` actively revoked it rather than relying
    // solely on the refresh-path filter.
    const activeTokens = await prisma.refreshToken.findMany({
      where: {
        organizationId: admin.organizationId,
        actorType: "EMPLOYEE",
        actorId: target.id,
        revokedAt: null,
      },
    });
    expect(activeTokens).toHaveLength(0);

    // Half 2: the refresh path itself refuses a non-ACTIVE employee, with
    // the SAME "Invalid refresh token" 401 as an unknown/expired token --
    // no distinguishable error path that would leak account state.
    const postDisableRefreshRes = await request(app.getHttpServer())
      .post("/api/auth/employee/refresh")
      .set("Cookie", rotatedTargetCookie);
    expect(postDisableRefreshRes.status).toBe(401);
    // Same "Invalid refresh token" message as the ordinary
    // rotated-away-old-token 401 asserted elsewhere in this file (see
    // "refresh rotates the token and the old one then fails") -- no new,
    // distinguishable error path that would leak "this account exists but
    // is disabled" to the caller.
    expect(postDisableRefreshRes.body.message).toBe("Invalid refresh token");
  });

  it("ambiguous login (same email in two organizations) fails loudly instead of silently picking one", async () => {
    // Task 5 review Important 1.
    const sharedEmail = `ambiguous-${randomUUID()}@example.com`;
    await createOrgWithRoleAndEmployee({
      email: sharedEmail,
      password: "CorrectHorseBattery9!",
    });
    await createOrgWithRoleAndEmployee({
      email: sharedEmail,
      password: "CorrectHorseBattery9!",
    });

    const res = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: sharedEmail, password: "CorrectHorseBattery9!" });

    // Not a normal 401 "invalid credentials" -- this is a data-integrity
    // condition the service refuses to paper over by picking a row.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(200);
  });

  it("PATCH /api/roles/:id/permissions rejects an unknown permission code and refuses to edit a system role", async () => {
    // Task 5 review Minor fixes.
    const org = await createOrgWithRoleAndEmployee({
      email: `roles-minor-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
      // PATCH /api/roles/:id/permissions is
      // @RequirePermission("CAN_MANAGE_EMPLOYEES") (Task 7).
      permissionCodes: ["CAN_MANAGE_EMPLOYEES"],
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId: org.organizationId },
    });
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: employee.email, password: "CorrectHorseBattery9!" });
    const accessToken = loginRes.body.accessToken as string;

    const unknownCodeRes = await request(app.getHttpServer())
      .patch(`/api/roles/${org.roleId}/permissions`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ permissionCodes: [`does-not-exist-${randomUUID()}`] });
    expect(unknownCodeRes.status).toBe(400);

    const { organizationId: seededOrgId } = await runSeed(prisma);
    const seededAdminRole = await prisma.role.findFirstOrThrow({
      where: { organizationId: seededOrgId, code: "ADMIN" },
    });
    const seededAdminEmployee = await prisma.employee.findFirstOrThrow({
      where: { organizationId: seededOrgId, roleId: seededAdminRole.id },
    });
    const adminLoginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: seededAdminEmployee.email, password: "Password123!" });
    const adminAccessToken = adminLoginRes.body.accessToken as string;

    const systemRoleRes = await request(app.getHttpServer())
      .patch(`/api/roles/${seededAdminRole.id}/permissions`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ permissionCodes: [] });
    expect(systemRoleRes.status).toBe(400);

    const stillIntact = await prisma.rolePermission.count({
      where: { roleId: seededAdminRole.id },
    });
    expect(stillIntact).toBeGreaterThan(0);
  });

  it("seed is idempotent -- running it twice leaves row counts unchanged", async () => {
    const first = await runSeed(prisma);

    const countsAfterFirst = {
      permissions: await prisma.permission.count(),
      roles: await prisma.role.count({
        where: { organizationId: first.organizationId },
      }),
      rolePermissions: await prisma.rolePermission.count({
        where: { role: { organizationId: first.organizationId } },
      }),
      employees: await prisma.employee.count({
        where: { organizationId: first.organizationId },
      }),
      // Scoped to the seed's own organization, like every other count
      // above -- NOT a bare `prisma.organization.count()`. This suite
      // runs concurrently with every other e2e suite against one shared
      // Postgres database (the default, non-runInBand jest invocation),
      // and every other suite creates its own Organization fixture, so a
      // global count is never stable regardless of whether THIS seed is
      // idempotent -- it was failing on contention alone (observed:
      // 150 -> 151 between the two `runSeed` calls, from an unrelated
      // suite's fixture landing in that window), not on a real bug. The
      // actual claim this test makes -- "the SAME org row is not
      // duplicated by a second seed run" -- is fully captured by this
      // count staying 1 both times.
      organizations: await prisma.organization.count({
        where: { id: first.organizationId },
      }),
    };

    const second = await runSeed(prisma);
    expect(second.organizationId).toBe(first.organizationId);

    const countsAfterSecond = {
      permissions: await prisma.permission.count(),
      roles: await prisma.role.count({
        where: { organizationId: first.organizationId },
      }),
      rolePermissions: await prisma.rolePermission.count({
        where: { role: { organizationId: first.organizationId } },
      }),
      employees: await prisma.employee.count({
        where: { organizationId: first.organizationId },
      }),
      organizations: await prisma.organization.count({
        where: { id: first.organizationId },
      }),
    };

    expect(countsAfterSecond).toEqual(countsAfterFirst);
  });

  it("ADMIN holds every permission and AUDITOR holds no write permission of any kind -- checked against the seeded database, not the seed constants", async () => {
    // Task 5 review ruling (Important 3): the previous version of this
    // test was pure-sync over the ROLES/PERMISSIONS constants imported
    // from prisma/seed/ -- the exact same source of truth as the code
    // under test. It could not have caught a bug in seedRoles()'s upsert
    // loop, a silently skipped RolePermission insert, or stale rows left
    // over from an old catalogue. Runs the real seed and reads the
    // resulting rows back from Postgres instead.
    const { organizationId } = await runSeed(prisma);

    const allCodes = PERMISSIONS.map((p) => p.code);

    const adminRole = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: "ADMIN" },
      include: { permissions: true },
    });
    const auditorRole = await prisma.role.findFirstOrThrow({
      where: { organizationId, code: "AUDITOR" },
      include: { permissions: true },
    });

    const adminCodes = adminRole.permissions.map((p) => p.permissionCode);
    const auditorCodes = auditorRole.permissions.map((p) => p.permissionCode);

    expect(new Set(adminCodes)).toEqual(new Set(allCodes));

    const writePrefixes = [
      "CAN_MANAGE_",
      "CAN_RUN_",
      "CAN_CHANGE_",
      "CAN_RESOLVE_",
      "CAN_APPROVE_",
      "CAN_SEND_",
    ];
    for (const code of auditorCodes) {
      expect(writePrefixes.some((prefix) => code.startsWith(prefix))).toBe(
        false,
      );
    }
  });
});
