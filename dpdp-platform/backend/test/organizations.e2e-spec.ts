import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";

/**
 * Integration-gate fix (Job 3): `UpdateOrganizationDto.timezone` had
 * `@IsString()` but no `@IsNotEmpty()`, so `PATCH /api/organization` could
 * write `timezone: ""`. `MeService.getProfile()` already normalizes an
 * empty stored timezone to `null` defensively (see its docstring), but
 * that is a read-side safety net, not a reason to accept the empty
 * string on write. This spec asserts the write itself now rejects it,
 * with a positive control on the identical payload shape so a 400 here
 * cannot be passing for the wrong reason (route missing, permission
 * denied first, etc.) -- same discipline as `purposes.e2e-spec.ts` and
 * `rbac.e2e-spec.ts`.
 */
describe("Organizations (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  const createdOrgIds: string[] = [];

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

  /** One organization with one employee whose role holds CAN_CHANGE_ORG_SETTINGS. */
  async function createOrgWithSettingsManager(): Promise<{
    organizationId: string;
    accessToken: string;
  }> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `Org Settings Test Org ${organizationId}` },
    });
    createdOrgIds.push(organizationId);

    const permissionCode = "CAN_CHANGE_ORG_SETTINGS";
    await ensurePermission(permissionCode);

    const role = await prisma.role.create({
      data: {
        organizationId,
        code: "SETTINGS_MANAGER",
        name: "Settings Manager",
        isSystem: false,
        permissions: { create: [{ permissionCode }] },
      },
    });

    const email = `settings-manager-${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: "Settings Manager",
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

    return { organizationId, accessToken: loginRes.body.accessToken as string };
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

  it("PATCH /api/organization with timezone: \"\" returns 400 naming timezone; the corrected payload succeeds", async () => {
    const { accessToken } = await createOrgWithSettingsManager();

    // NEGATIVE: an empty-string timezone must be rejected, not silently
    // written and normalized later on some other read path.
    const emptyRes = await request(app.getHttpServer())
      .patch("/api/organization")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ timezone: "" });
    expect(emptyRes.status).toBe(400);
    expect(JSON.stringify(emptyRes.body)).toMatch(/timezone/i);

    // POSITIVE CONTROL: identical route/permission/shape, a real IANA zone.
    const okRes = await request(app.getHttpServer())
      .patch("/api/organization")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ timezone: "Asia/Kolkata" });
    expect(okRes.status).toBe(200);
    expect(okRes.body.timezone).toBe("Asia/Kolkata");
  });

  it("a successful PATCH with only timezone writes an ORG_SETTINGS_UPDATED audit event", async () => {
    const { accessToken, organizationId } = await createOrgWithSettingsManager();

    const updateRes = await request(app.getHttpServer())
      .patch("/api/organization")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ timezone: "Asia/Kolkata" });
    expect(updateRes.status).toBe(200);

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId,
        action: "ORG_SETTINGS_UPDATED",
        resourceId: organizationId,
      },
    });
    expect(auditEvent).not.toBeNull();
  });
});
