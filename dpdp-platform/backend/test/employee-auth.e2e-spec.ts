import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import type { AuditEvent } from "@prisma/client";
import { runSeed } from "../prisma/seed";
import { ROLES } from "../prisma/seed/roles";
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

    const role = await prisma.role.create({
      data: {
        organizationId,
        code: opts.roleCode ?? "TEST_ROLE",
        name: "Test Role",
        permissions: { create: [{ permissionCode }] },
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

  it("creating an employee with another organization's roleId fails", async () => {
    const orgA = await createOrgWithRoleAndEmployee({
      email: `org-a-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
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
      organizations: await prisma.organization.count(),
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
      organizations: await prisma.organization.count(),
    };

    expect(countsAfterSecond).toEqual(countsAfterFirst);
  });

  it("ADMIN holds every permission and AUDITOR holds no write permission of any kind", () => {
    const allCodes = PERMISSIONS.map((p) => p.code);
    const admin = ROLES.find((r) => r.code === "ADMIN");
    const auditor = ROLES.find((r) => r.code === "AUDITOR");
    expect(admin).toBeDefined();
    expect(auditor).toBeDefined();

    expect(new Set(admin?.permissionCodes)).toEqual(new Set(allCodes));

    const writePrefixes = [
      "CAN_MANAGE_",
      "CAN_RUN_",
      "CAN_CHANGE_",
      "CAN_RESOLVE_",
      "CAN_APPROVE_",
      "CAN_SEND_",
    ];
    for (const code of auditor?.permissionCodes ?? []) {
      expect(writePrefixes.some((prefix) => code.startsWith(prefix))).toBe(
        false,
      );
    }
  });
});
