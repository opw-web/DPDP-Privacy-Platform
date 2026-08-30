import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";

/**
 * Task 8 gate (Check 11, spec lines 1056-1060 / LB-02): the purpose
 * register never defaults or infers `lawfulBasis`, enforces the
 * LEGITIMATE_USE/CONSENT limb rules, and derives `isReviewed` correctly.
 *
 * Every negative (400/403/409) assertion below has a POSITIVE CONTROL in
 * the same test -- the identical payload with only the field under test
 * corrected, asserted to succeed -- and every 400 assertion checks the
 * error message names the specific field under test, so a test cannot
 * pass because a DIFFERENT field failed validation, the route did not
 * exist, or the permission guard rejected first (task brief's own
 * "five tests that were green for the wrong reason" warning).
 */
describe("Purposes (e2e)", () => {
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

  /** One organization with one employee whose role holds both purpose codes. */
  async function createOrgWithManager(): Promise<{
    organizationId: string;
    accessToken: string;
  }> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `Purposes Test Org ${organizationId}` },
    });
    createdOrgIds.push(organizationId);

    const permissionCodes = ["CAN_MANAGE_PURPOSES", "CAN_VIEW_PRINCIPALS"];
    for (const code of permissionCodes) {
      await ensurePermission(code);
    }

    const role = await prisma.role.create({
      data: {
        organizationId,
        code: "PURPOSE_MANAGER",
        name: "Purpose Manager",
        isSystem: false,
        permissions: {
          create: permissionCodes.map((permissionCode) => ({ permissionCode })),
        },
      },
    });

    const email = `purpose-manager-${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: "Purpose Manager",
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

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      code: `PURPOSE_${randomUUID()}`,
      name: "Order Fulfilment",
      description: "Fulfil customer orders placed on the storefront.",
      lawfulBasis: "CONSENT",
      basisJustification:
        "Customer opts in at checkout via the consent notice.",
      dataCategories: ["IDENTITY", "CONTACT"],
      ...overrides,
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
      await prisma.processingPurpose.deleteMany({
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

  it("POST /api/purposes without lawfulBasis returns 400 naming lawfulBasis; the corrected payload succeeds", async () => {
    const { accessToken } = await createOrgWithManager();
    const fullPayload = validPayload();
    const withoutBasis: Record<string, unknown> = { ...fullPayload };
    delete withoutBasis["lawfulBasis"];

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(withoutBasis);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("lawfulBasis");

    // POSITIVE CONTROL: same payload, lawfulBasis restored.
    const okRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validPayload());
    expect(okRes.status).toBe(201);
    expect(okRes.body.lawfulBasis).toBe("CONSENT");
  });

  it("POST /api/purposes with LEGITIMATE_USE and no limb returns 400 naming legitimateUseLimb; adding the limb succeeds", async () => {
    const { accessToken } = await createOrgWithManager();
    const payload = validPayload({ lawfulBasis: "LEGITIMATE_USE" });
    delete (payload as Record<string, unknown>)["legitimateUseLimb"];

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("legitimateUseLimb");

    // POSITIVE CONTROL: identical payload, limb supplied.
    const okRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...validPayload({ lawfulBasis: "LEGITIMATE_USE" }),
        legitimateUseLimb: "EMPLOYMENT",
      });
    expect(okRes.status).toBe(201);
    expect(okRes.body.lawfulBasis).toBe("LEGITIMATE_USE");
    expect(okRes.body.legitimateUseLimb).toBe("EMPLOYMENT");
  });

  it("POST /api/purposes with CONSENT and a supplied limb returns 400 naming legitimateUseLimb; removing the limb succeeds", async () => {
    const { accessToken } = await createOrgWithManager();
    const payload = validPayload({
      lawfulBasis: "CONSENT",
      legitimateUseLimb: "EMPLOYMENT",
    });

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("legitimateUseLimb");

    // POSITIVE CONTROL: identical payload, limb removed.
    const withoutLimb: Record<string, unknown> = { ...payload };
    delete withoutLimb["legitimateUseLimb"];
    const okRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(withoutLimb);
    expect(okRes.status).toBe(201);
    expect(okRes.body.lawfulBasis).toBe("CONSENT");
    expect(okRes.body.legitimateUseLimb).toBeNull();
  });

  it("POST /api/purposes with a blank/whitespace-only basisJustification returns 400 naming basisJustification; non-blank text succeeds", async () => {
    const { accessToken } = await createOrgWithManager();
    const payload = validPayload({ basisJustification: "   " });

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("basisJustification");

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validPayload({ code: payload.code + "_OK" }));
    expect(okRes.status).toBe(201);
  });

  it("a valid purpose is created unreviewed (isReviewed: false), and POST /api/purposes/:id/review sets the reviewer/timestamp and writes PURPOSE_REVIEWED", async () => {
    const { accessToken, organizationId } = await createOrgWithManager();

    const createRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validPayload());
    expect(createRes.status).toBe(201);
    expect(createRes.body.isReviewed).toBe(false);
    expect(createRes.body.reviewedByEmployeeId).toBeNull();
    expect(createRes.body.reviewedAt).toBeNull();

    const purposeId = createRes.body.id as string;
    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId },
    });

    const reviewRes = await request(app.getHttpServer())
      .post(`/api/purposes/${purposeId}/review`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.isReviewed).toBe(true);
    expect(reviewRes.body.reviewedByEmployeeId).toBe(employee.id);
    expect(reviewRes.body.reviewedAt).not.toBeNull();

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId,
        action: "PURPOSE_REVIEWED",
        resourceId: purposeId,
      },
    });
    expect(auditEvent).not.toBeNull();
    expect(
      (auditEvent!.metadata as Record<string, unknown>)["reviewedByEmployeeId"],
    ).toBe(employee.id);

    const createdAuditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId,
        action: "PURPOSE_CREATED",
        resourceId: purposeId,
      },
    });
    expect(createdAuditEvent).not.toBeNull();
  });

  it("a duplicate code within the same org returns 409 naming the code, the identical payload with a different code succeeds, and the same code in another org succeeds", async () => {
    const orgA = await createOrgWithManager();
    const code = `DUP_${randomUUID()}`;

    const firstRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${orgA.accessToken}`)
      .send(validPayload({ code }));
    expect(firstRes.status).toBe(201);

    // NEGATIVE: same org, same code -> 409, not some other constraint.
    const dupRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${orgA.accessToken}`)
      .send(validPayload({ code, name: "A different name entirely" }));
    expect(dupRes.status).toBe(409);
    expect(JSON.stringify(dupRes.body)).toContain(code);

    // POSITIVE CONTROL: identical shape, different code, same org.
    const differentCodeRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${orgA.accessToken}`)
      .send(validPayload({ code: `${code}_OTHER` }));
    expect(differentCodeRes.status).toBe(201);

    // Genuinely different organization, same code -> succeeds, and lands
    // in the right org (not silently rejected, not attached to org A).
    const orgB = await createOrgWithManager();
    expect(orgB.organizationId).not.toBe(orgA.organizationId);

    const crossOrgRes = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${orgB.accessToken}`)
      .send(validPayload({ code }));
    expect(crossOrgRes.status).toBe(201);

    const rowInOrgB = await prisma.processingPurpose.findFirst({
      where: { code, organizationId: orgB.organizationId },
    });
    expect(rowInOrgB).not.toBeNull();
    const rowInOrgA = await prisma.processingPurpose.findFirst({
      where: { code, organizationId: orgA.organizationId },
    });
    expect(rowInOrgA).not.toBeNull();
    expect(rowInOrgB!.id).not.toBe(rowInOrgA!.id);
  });

  it("GET /api/purposes: CAN_VIEW_PRINCIPALS succeeds, no permission gets 403 on the identical request", async () => {
    const { accessToken, organizationId } = await createOrgWithManager();
    await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validPayload());

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .get("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(okRes.status).toBe(200);
    expect(Array.isArray(okRes.body)).toBe(true);
    expect(okRes.body.length).toBeGreaterThan(0);

    // NEGATIVE: an employee in the SAME org with no permissions.
    const noPermRole = await prisma.role.create({
      data: {
        organizationId,
        code: "NO_PERM",
        name: "No Permissions",
        isSystem: false,
      },
    });
    const email = `no-perm-${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: "No Perm",
        roleId: noPermRole.id,
        passwordHash,
        status: "ACTIVE",
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });

    const deniedRes = await request(app.getHttpServer())
      .get("/api/purposes")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_VIEW_PRINCIPALS",
    );
  });
});
