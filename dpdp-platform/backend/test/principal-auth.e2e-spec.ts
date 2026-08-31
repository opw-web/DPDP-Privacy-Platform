import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import type { AuditEvent } from "@prisma/client";

/**
 * Task 6 gate: principal portal login/refresh/logout, refresh-token
 * rotation and reuse-family revocation (shared with employee auth via
 * `rotateRefreshToken`), `PrincipalAccount.status` gating, and -- the crux
 * of this task -- that the `aud` claim on an access token is enforced in
 * BOTH directions: an employee token must fail on a principal route, and
 * a principal token must fail on a fiduciary route (spec line 697,
 * Check 19).
 *
 * Talks to the real Postgres database and a fully bootstrapped Nest app
 * (no mocks), matching this codebase's existing e2e style (see
 * employee-auth.e2e-spec.ts).
 */
describe("Principal auth (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();

  const createdOrgIds: string[] = [];

  async function createOrgWithPrincipalAccount(opts: {
    email: string;
    password?: string;
    status?: "UNCLAIMED" | "ACTIVE" | "LOCKED";
  }): Promise<{
    organizationId: string;
    dataPrincipalId: string;
    principalAccountId: string;
  }> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `Test Org ${organizationId}` },
    });
    createdOrgIds.push(organizationId);

    const dataPrincipal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Test Principal",
      },
    });

    const passwordHash =
      opts.password !== undefined
        ? await argon2.hash(opts.password, { type: argon2.argon2id })
        : null;

    const account = await prisma.principalAccount.create({
      data: {
        organizationId,
        dataPrincipalId: dataPrincipal.id,
        email: opts.email,
        passwordHash,
        status: opts.status ?? "ACTIVE",
      },
    });

    return {
      organizationId,
      dataPrincipalId: dataPrincipal.id,
      principalAccountId: account.id,
    };
  }

  async function createOrgWithRoleAndEmployee(opts: {
    email: string;
    password: string;
  }): Promise<{ organizationId: string; employeeId: string }> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `Test Org ${organizationId}` },
    });
    createdOrgIds.push(organizationId);

    const permissionCode = `test.principal-auth.${randomUUID()}`;
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
        code: "TEST_ROLE",
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
    return { organizationId, employeeId: employee.id };
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
      await prisma.refreshToken.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.principalContactEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.principalAccount.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataPrincipal.deleteMany({
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
      c.startsWith("principal_refresh_token="),
    );
    if (!cookie) {
      throw new Error("No principal_refresh_token cookie in response");
    }
    return cookie.split(";")[0] as string;
  }

  it("login succeeds and returns an access token with aud: principal", async () => {
    const { organizationId, dataPrincipalId } =
      await createOrgWithPrincipalAccount({
        email: `login-ok-${randomUUID()}@example.com`,
        password: "CorrectHorseBattery9!",
      });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const res = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "CorrectHorseBattery9!" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    const payload = decodeJwtPayload(res.body.accessToken);
    expect(payload["aud"]).toBe("principal");
    expect(payload["organizationId"]).toBe(organizationId);
    expect(res.body.account.dataPrincipalId).toBe(dataPrincipalId);
    const rawCookie = extractRefreshCookie(res);
    expect(rawCookie).toMatch(/^principal_refresh_token=/);

    // Spec line 696 names these explicitly. Assert the full attribute
    // string (not just that SOME cookie was set) so a future edit
    // dropping HttpOnly or loosening SameSite ships red, not green.
    const setCookieHeader = (
      res.headers["set-cookie"] as unknown as string[]
    ).find((c) => c.startsWith("principal_refresh_token="));
    expect(setCookieHeader).toMatch(/HttpOnly/i);
    expect(setCookieHeader).toMatch(/SameSite=Lax/i);
    expect(setCookieHeader).toMatch(/Path=\/api\/auth\/principal/);
  });

  it("login writes PRINCIPAL_LOGIN_SUCCEEDED and an INBOUND PORTAL_LOGIN contact event, and updates DataPrincipal contact fields", async () => {
    const { organizationId, dataPrincipalId } =
      await createOrgWithPrincipalAccount({
        email: `login-audit-${randomUUID()}@example.com`,
        password: "CorrectHorseBattery9!",
      });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const res = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "CorrectHorseBattery9!" });
    expect(res.status).toBe(200);

    const events = await prisma.auditEvent.findMany({
      where: { organizationId, action: "PRINCIPAL_LOGIN_SUCCEEDED" },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events[0] as AuditEvent;
    expect(event.resourceId).toBe(account.id);
    expect(event.subjectPrincipalId).toBe(dataPrincipalId);

    const contactEvents = await prisma.principalContactEvent.findMany({
      where: { organizationId, dataPrincipalId },
    });
    expect(contactEvents.length).toBeGreaterThanOrEqual(1);
    expect(contactEvents[0]?.direction).toBe("INBOUND");
    expect(contactEvents[0]?.channel).toBe("PORTAL_LOGIN");

    const dataPrincipal = await prisma.dataPrincipal.findFirstOrThrow({
      where: { id: dataPrincipalId },
    });
    expect(dataPrincipal.lastPrincipalContactAt).not.toBeNull();
    expect(dataPrincipal.lastPrincipalContactSource).toBe("PORTAL_LOGIN");
  });

  it("an UNCLAIMED account cannot log in (with a positive control on the same password proving the credential itself is fine)", async () => {
    const password = "CorrectHorseBattery9!";
    const claimed = await createOrgWithPrincipalAccount({
      email: `unclaimed-control-${randomUUID()}@example.com`,
      password,
      status: "ACTIVE",
    });
    const unclaimed = await createOrgWithPrincipalAccount({
      email: `unclaimed-${randomUUID()}@example.com`,
      password,
      status: "UNCLAIMED",
    });

    // POSITIVE CONTROL: the identical password on an ACTIVE account
    // succeeds -- so the negative assertion below is attributable to the
    // UNCLAIMED status check, not to a broken login endpoint or a bad
    // password fixture.
    const controlAccount = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId: claimed.organizationId },
    });
    const controlRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: controlAccount.email, password });
    expect(controlRes.status).toBe(200);

    const unclaimedAccount = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId: unclaimed.organizationId },
    });
    const res = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: unclaimedAccount.email, password });
    expect(res.status).toBe(401);
  });

  it("a LOCKED account cannot log in (positive control: the same password on an ACTIVE account succeeds)", async () => {
    const password = "CorrectHorseBattery9!";
    const claimed = await createOrgWithPrincipalAccount({
      email: `locked-control-${randomUUID()}@example.com`,
      password,
      status: "ACTIVE",
    });
    const locked = await createOrgWithPrincipalAccount({
      email: `locked-${randomUUID()}@example.com`,
      password,
      status: "LOCKED",
    });

    const controlAccount = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId: claimed.organizationId },
    });
    const controlRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: controlAccount.email, password });
    expect(controlRes.status).toBe(200);

    const lockedAccount = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId: locked.organizationId },
    });
    const res = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: lockedAccount.email, password });
    expect(res.status).toBe(401);
  });

  it("wrong password returns 401, identical to an unknown email", async () => {
    const { organizationId } = await createOrgWithPrincipalAccount({
      email: `wrong-pw-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const wrongPasswordRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "wrong-password" });
    const unknownEmailRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({
        email: `nobody-${randomUUID()}@example.com`,
        password: "anything",
      });

    expect(wrongPasswordRes.status).toBe(401);
    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPasswordRes.body).toEqual(unknownEmailRes.body);
  });

  it("refresh rotates the token and the old one then fails", async () => {
    const { organizationId } = await createOrgWithPrincipalAccount({
      email: `refresh-ok-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "CorrectHorseBattery9!" });
    const oldCookie = extractRefreshCookie(loginRes);

    const refreshRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", oldCookie);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toEqual(expect.any(String));
    const newCookie = extractRefreshCookie(refreshRes);
    expect(newCookie).not.toBe(oldCookie);

    const replayOldRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", oldCookie);
    expect(replayOldRes.status).toBe(401);
  });

  it("replaying a revoked principal refresh token revokes the family and writes TOKEN_REUSE_DETECTED", async () => {
    const { organizationId } = await createOrgWithPrincipalAccount({
      email: `reuse-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "CorrectHorseBattery9!" });
    const firstCookie = extractRefreshCookie(loginRes);

    const rotateRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", firstCookie);
    expect(rotateRes.status).toBe(200);
    const secondCookie = extractRefreshCookie(rotateRes);

    const replayRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", firstCookie);
    expect(replayRes.status).toBe(401);

    const reuseEvents = await prisma.auditEvent.findMany({
      where: { organizationId, action: "TOKEN_REUSE_DETECTED" },
    });
    expect(reuseEvents.length).toBeGreaterThanOrEqual(1);

    const secondCookieAfterReuseRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", secondCookie);
    expect(secondCookieAfterReuseRes.status).toBe(401);

    const activeTokens = await prisma.refreshToken.findMany({
      where: {
        organizationId,
        actorType: "PRINCIPAL",
        actorId: account.id,
        revokedAt: null,
      },
    });
    expect(activeTokens).toHaveLength(0);
  });

  it("logout revokes the refresh token", async () => {
    const { organizationId } = await createOrgWithPrincipalAccount({
      email: `logout-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "CorrectHorseBattery9!" });
    const cookie = extractRefreshCookie(loginRes);

    const logoutRes = await request(app.getHttpServer())
      .post("/api/auth/principal/logout")
      .set("Cookie", cookie);
    expect(logoutRes.status).toBe(200);

    const afterLogoutRefreshRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", cookie);
    expect(afterLogoutRefreshRes.status).toBe(401);
  });

  it("GET /api/auth/principal/me requires a valid principal access token and returns account info without passwordHash", async () => {
    const { organizationId } = await createOrgWithPrincipalAccount({
      email: `me-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const noTokenRes = await request(app.getHttpServer()).get(
      "/api/auth/principal/me",
    );
    expect(noTokenRes.status).toBe(401);

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "CorrectHorseBattery9!" });

    // POSITIVE CONTROL populated before the negative passwordHash check --
    // a `not.toHaveProperty` assertion on a 401 body would pass trivially.
    const meRes = await request(app.getHttpServer())
      .get("/api/auth/principal/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(account.email);
    expect(meRes.body.id).toBe(account.id);
    expect(meRes.body).not.toHaveProperty("passwordHash");
    expect(loginRes.body.account).not.toHaveProperty("passwordHash");
  });

  it("CRUX: an employee access token is rejected on GET /api/auth/principal/me (401), with a positive control proving a real principal token succeeds on the same route", async () => {
    const employeeOrg = await createOrgWithRoleAndEmployee({
      email: `cross-aud-employee-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const { organizationId: principalOrgId } =
      await createOrgWithPrincipalAccount({
        email: `cross-aud-principal-${randomUUID()}@example.com`,
        password: "CorrectHorseBattery9!",
      });
    const principalAccount = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId: principalOrgId },
    });

    const employeeLoginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({
        email: (
          await prisma.employee.findFirstOrThrow({
            where: { organizationId: employeeOrg.organizationId },
          })
        ).email,
        password: "CorrectHorseBattery9!",
      });
    const employeeAccessToken = employeeLoginRes.body.accessToken as string;
    expect(decodeJwtPayload(employeeAccessToken)["aud"]).toBe("employee");

    // NEGATIVE: an employee (aud: "employee") token on a principal route.
    const crossAudRes = await request(app.getHttpServer())
      .get("/api/auth/principal/me")
      .set("Authorization", `Bearer ${employeeAccessToken}`);
    expect(crossAudRes.status).toBe(401);

    // POSITIVE CONTROL: a genuine principal token on the SAME route, same
    // request shape, succeeds -- proving the 401 above is attributable to
    // the audience mismatch and not to the route being broken/missing or
    // the guard being universally deny-all.
    const principalLoginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({
        email: principalAccount.email,
        password: "CorrectHorseBattery9!",
      });
    const principalAccessToken = principalLoginRes.body.accessToken as string;
    const controlRes = await request(app.getHttpServer())
      .get("/api/auth/principal/me")
      .set("Authorization", `Bearer ${principalAccessToken}`);
    expect(controlRes.status).toBe(200);
    expect(controlRes.body.id).toBe(principalAccount.id);
  });

  it("CRUX: a principal access token is rejected on a fiduciary route (GET /api/auth/employee/me), with a positive control proving a real employee token succeeds on the same route", async () => {
    const { organizationId: principalOrgId } =
      await createOrgWithPrincipalAccount({
        email: `cross-aud-2-principal-${randomUUID()}@example.com`,
        password: "CorrectHorseBattery9!",
      });
    const principalAccount = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId: principalOrgId },
    });
    const employeeOrg = await createOrgWithRoleAndEmployee({
      email: `cross-aud-2-employee-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });

    const principalLoginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({
        email: principalAccount.email,
        password: "CorrectHorseBattery9!",
      });
    const principalAccessToken = principalLoginRes.body.accessToken as string;
    expect(decodeJwtPayload(principalAccessToken)["aud"]).toBe("principal");

    // NEGATIVE: a principal (aud: "principal") token on a fiduciary route.
    const crossAudRes = await request(app.getHttpServer())
      .get("/api/auth/employee/me")
      .set("Authorization", `Bearer ${principalAccessToken}`);
    expect(crossAudRes.status).toBe(401);

    // POSITIVE CONTROL: a genuine employee token on the SAME route
    // succeeds.
    const employeeLoginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({
        email: (
          await prisma.employee.findFirstOrThrow({
            where: { organizationId: employeeOrg.organizationId },
          })
        ).email,
        password: "CorrectHorseBattery9!",
      });
    const employeeAccessToken = employeeLoginRes.body.accessToken as string;
    const controlRes = await request(app.getHttpServer())
      .get("/api/auth/employee/me")
      .set("Authorization", `Bearer ${employeeAccessToken}`);
    expect(controlRes.status).toBe(200);
  });

  it("a principal-refresh token presented as an access token fails, and vice versa", async () => {
    const { organizationId } = await createOrgWithPrincipalAccount({
      email: `wrong-token-kind-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "CorrectHorseBattery9!" });
    const accessToken = loginRes.body.accessToken as string;
    const refreshCookie = extractRefreshCookie(loginRes);
    const refreshTokenValue = refreshCookie
      .split(";")[0]
      ?.split("=")
      .slice(1)
      .join("=") as string;

    // POSITIVE CONTROL: the real access token on /me succeeds.
    const controlRes = await request(app.getHttpServer())
      .get("/api/auth/principal/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(controlRes.status).toBe(200);

    // NEGATIVE: the refresh token (aud: "principal-refresh") presented as
    // a Bearer access token on /me must fail -- different aud entirely.
    const refreshAsAccessRes = await request(app.getHttpServer())
      .get("/api/auth/principal/me")
      .set("Authorization", `Bearer ${refreshTokenValue}`);
    expect(refreshAsAccessRes.status).toBe(401);

    // NEGATIVE: the access token (aud: "principal") presented as a
    // refresh-token cookie on /refresh must fail -- different aud entirely.
    const accessAsRefreshRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", `principal_refresh_token=${accessToken}`);
    expect(accessAsRefreshRes.status).toBe(401);

    // POSITIVE CONTROL: the real refresh token on /refresh succeeds.
    const realRefreshRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", refreshCookie);
    expect(realRefreshRes.status).toBe(200);
  });

  it("principal API responses never contain passwordHash on login or refresh", async () => {
    const { organizationId } = await createOrgWithPrincipalAccount({
      email: `no-hash-leak-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "CorrectHorseBattery9!" });

    // POSITIVE: a populated 200 success response, asserted BEFORE the
    // negative check below -- a `not.toHaveProperty` on a 401 body would
    // pass trivially.
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.account.id).toBe(account.id);
    expect(loginRes.body).not.toHaveProperty("passwordHash");
    expect(loginRes.body.account).not.toHaveProperty("passwordHash");

    const meRes = await request(app.getHttpServer())
      .get("/api/auth/principal/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body).not.toHaveProperty("passwordHash");
  });

  it("Important 2 (fix-round-1): a LOCKED account's existing refresh token stops working (positive control: it works while ACTIVE)", async () => {
    const { organizationId } = await createOrgWithPrincipalAccount({
      email: `lock-during-session-${randomUUID()}@example.com`,
      password: "CorrectHorseBattery9!",
    });
    const account = await prisma.principalAccount.findFirstOrThrow({
      where: { organizationId },
    });

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: account.email, password: "CorrectHorseBattery9!" });
    const cookie = extractRefreshCookie(loginRes);

    // POSITIVE CONTROL: the token still works normally while the account
    // remains ACTIVE.
    const controlRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", cookie);
    expect(controlRes.status).toBe(200);
    const rotatedCookie = extractRefreshCookie(controlRes);

    // Lock the account directly -- simulating an admin/DPO locking a
    // compromised or suspended portal account mid-session. No new login
    // attempt is involved; only the EXISTING, still-unexpired,
    // never-revoked refresh token is exercised below.
    await prisma.principalAccount.update({
      where: { id: account.id },
      data: { status: "LOCKED" },
    });

    // NEGATIVE: "cannot log in" without "cannot continue" would be a weak
    // control for precisely the state LOCKED exists to represent
    // (compromised/suspended). The still-valid refresh token must now be
    // rejected.
    const afterLockRes = await request(app.getHttpServer())
      .post("/api/auth/principal/refresh")
      .set("Cookie", rotatedCookie);
    expect(afterLockRes.status).toBe(401);
  });

  it("audience-attribution (fix-round-1): an employee token is rejected on /api/auth/principal/me by the aud check itself, not by incidental id/org mismatch", async () => {
    // Manufactures the one scenario that isolates WHICH mechanism causes
    // the 401: a PrincipalAccount row deliberately given the SAME id as
    // an Employee row, in the SAME organization. Employee.id and
    // PrincipalAccount.id are separate UUID spaces that would essentially
    // never collide naturally -- this collision is constructed so that a
    // guard which forgot to check `aud` and only did the
    // `(id, organizationId)` database lookup would find a REAL row and
    // succeed. Without this collision, the earlier CRUX test's 401 could
    // just as well be explained by "the employee's id happens not to
    // match any PrincipalAccount row" -- a guard bug (skipped aud check)
    // that this test would not have caught.
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `Test Org ${organizationId}` },
    });
    createdOrgIds.push(organizationId);

    const permissionCode = `test.principal-auth.attribution.${randomUUID()}`;
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
        code: "TEST_ROLE",
        name: "Test Role",
        permissions: { create: [{ permissionCode }] },
      },
    });
    const employeePassword = "CorrectHorseBattery9!";
    const employee = await prisma.employee.create({
      data: {
        organizationId,
        email: `attribution-employee-${randomUUID()}@example.com`,
        fullName: "Attribution Employee",
        roleId: role.id,
        passwordHash: await argon2.hash(employeePassword, {
          type: argon2.argon2id,
        }),
        status: "ACTIVE",
      },
    });

    const dataPrincipal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Attribution Principal",
      },
    });
    const principalPassword = "CorrectHorseBattery9!";
    // The collision: this row's `id` is set to the EMPLOYEE's id.
    const principalAccount = await prisma.principalAccount.create({
      data: {
        id: employee.id,
        organizationId,
        dataPrincipalId: dataPrincipal.id,
        email: `attribution-principal-${randomUUID()}@example.com`,
        passwordHash: await argon2.hash(principalPassword, {
          type: argon2.argon2id,
        }),
        status: "ACTIVE",
      },
    });

    const employeeLoginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email: employee.email, password: employeePassword });
    const employeeAccessToken = employeeLoginRes.body.accessToken as string;
    expect(decodeJwtPayload(employeeAccessToken)["sub"]).toBe(
      principalAccount.id,
    );

    // POSITIVE CONTROL: the id/org lookup step alone DOES find this exact
    // row and succeed when the audience is correct -- proving the
    // negative below is specifically the audience check, not "no such
    // PrincipalAccount row".
    const principalLoginRes = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email: principalAccount.email, password: principalPassword });
    const principalAccessToken = principalLoginRes.body.accessToken as string;
    const controlRes = await request(app.getHttpServer())
      .get("/api/auth/principal/me")
      .set("Authorization", `Bearer ${principalAccessToken}`);
    expect(controlRes.status).toBe(200);
    expect(controlRes.body.id).toBe(principalAccount.id);

    // NEGATIVE: the employee token names the SAME id in the SAME
    // organization. If JwtPrincipalGuard's account lookup ran without its
    // `aud` check, this would ALSO find `principalAccount` and succeed --
    // it must not.
    const crossRes = await request(app.getHttpServer())
      .get("/api/auth/principal/me")
      .set("Authorization", `Bearer ${employeeAccessToken}`);
    expect(crossRes.status).toBe(401);
  });
});
