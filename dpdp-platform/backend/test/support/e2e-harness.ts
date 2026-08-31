import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../../prisma/seed/permissions";

/**
 * MVP 2 task 1: this file extracts the per-spec bootstrap pattern every
 * one of MVP 1's 25 e2e specs hand-rolls (see `test/rbac.e2e-spec.ts` for
 * the canonical example this was lifted from -- same
 * `Test.createTestingModule({ imports: [AppModule] })`, the same
 * `setGlobalPrefix("api")`, the same
 * `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`,
 * a raw `new PrismaService()` for fixtures, and the same targeted
 * `deleteMany` cleanup keyed off a list of created organization ids) into
 * reusable exports for MVP 2's new specs.
 *
 * Deliberately NOT wired into any of the 25 existing MVP 1 spec files --
 * they keep their own hand-rolled copy of this pattern unchanged. This
 * harness is for MVP 2's ~15 new specs (and is proven working by
 * `test/mvp2-schema-constraints.e2e-spec.ts`, the one new spec task 1
 * itself owns).
 */

/** Everything a bootstrapped e2e app needs: the running Nest application
 * (already `api`-prefixed and validation-piped) and a raw, unscoped
 * `PrismaService` connected to the same database, for fixture setup and
 * cleanup that must bypass tenant scoping. */
export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Boots a full Nest application from the real `AppModule` (no mocks, the
 * same style as every existing e2e spec) against the real Postgres
 * database, with the same global prefix and `ValidationPipe` the real
 * `main.ts` bootstrap uses. Call once in `beforeAll`; call
 * `app.close()` / `prisma.$disconnect()` in `afterAll`.
 */
export async function bootstrapTestApp(): Promise<TestApp> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const prisma = new PrismaService();
  await prisma.$connect();

  return { app, prisma };
}

/**
 * Upserts a permission code from the REAL seed catalogue
 * (`prisma/seed/permissions.ts`) into the (global, unscoped) `Permission`
 * table, so a test-created `Role` can reference it. Throws if the code is
 * not a real catalogue entry -- a fabricated permission code would
 * silently paper over that code going missing from the real catalogue,
 * and would permanently pollute the global `Permission` table every
 * other test and endpoint reads from. Never deleted by `cleanupOrgs`:
 * deleting a shared catalogue row would break every other
 * role/organization that also references it via `RolePermission`.
 */
export async function ensurePermission(
  prisma: PrismaService,
  code: string,
): Promise<void> {
  const catalogueEntry = PERMISSIONS.find((p) => p.code === code);
  if (!catalogueEntry) {
    throw new Error(
      `ensurePermission(): "${code}" is not in the real seed catalogue ` +
        "(prisma/seed/permissions.ts).",
    );
  }
  await prisma.permission.upsert({
    where: { code },
    create: catalogueEntry,
    update: {},
  });
}

export interface OrgWithEmployee {
  organizationId: string;
  roleId: string;
  employeeId: string;
  email: string;
  accessToken: string;
}

/**
 * Builds one fresh organization with a single role holding exactly
 * `permissionCodes`, and one active employee in that role, logged in
 * through the real `/api/auth/employee/login` endpoint (so
 * `accessToken` is a real, guard-verifiable JWT, not a hand-signed
 * stand-in). Every permission code is upserted via `ensurePermission`
 * first.
 *
 * Does NOT track the created organization id for cleanup -- callers pass
 * every id they want removed to `cleanupOrgs` themselves, mirroring how
 * `rbac.e2e-spec.ts`'s `createdOrgIds` array is built up by the caller,
 * not by the fixture helper.
 */
export async function createOrgWithEmployee(
  app: INestApplication,
  prisma: PrismaService,
  roleCode: string,
  permissionCodes: readonly string[],
): Promise<OrgWithEmployee> {
  const organizationId = randomUUID();
  await prisma.organization.create({
    data: { id: organizationId, name: `E2E Harness Org ${organizationId}` },
  });

  for (const code of permissionCodes) {
    await ensurePermission(prisma, code);
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
      `createOrgWithEmployee(): fixture login failed for ${email}: ` +
        JSON.stringify(loginRes.body),
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

/**
 * Deletes every row `createOrgWithEmployee` (and the tests around it)
 * could have created for the given organization ids, in FK-safe order --
 * the same targeted `deleteMany` sequence every existing e2e spec's
 * `afterAll` hand-rolls: `Counter` (raw SQL, no relation), then
 * `RefreshToken`, `Employee`, `RolePermission` (via its parent `Role`'s
 * organizationId), `Role`, and finally `Organization` itself. Never
 * touches the global `Permission` catalogue.
 *
 * A spec that also created MVP 2 rows (ComplianceRule, PrincipalRequest,
 * etc.) under these organization ids must delete those itself, in its own
 * `afterAll`, before calling this -- this harness only knows about the
 * MVP 1 shape `createOrgWithEmployee` produces.
 */
export async function cleanupOrgs(
  prisma: PrismaService,
  orgIds: readonly string[],
): Promise<void> {
  if (orgIds.length === 0) {
    return;
  }
  const ids = [...orgIds];
  await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${ids})`;
  await prisma.refreshToken.deleteMany({
    where: { organizationId: { in: ids } },
  });
  await prisma.employee.deleteMany({
    where: { organizationId: { in: ids } },
  });
  await prisma.rolePermission.deleteMany({
    where: { role: { organizationId: { in: ids } } },
  });
  await prisma.role.deleteMany({
    where: { organizationId: { in: ids } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: ids } },
  });
}

/**
 * Polls `predicate` every `intervalMs` until it resolves truthy or
 * `timeoutMs` elapses, in which case it throws. Same shape as the
 * `waitUntil` helper `sync.e2e-spec.ts` and `schema-constraints.e2e-spec.ts`
 * each define locally, extracted here so MVP 2 specs polling for
 * async state (a queued job, a scan picking up a due row, ...) share one
 * implementation instead of re-deriving it.
 */
export async function waitUntil(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 8000,
  intervalMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error("waitUntil: timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
