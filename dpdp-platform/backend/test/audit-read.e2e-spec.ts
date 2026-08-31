import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { AuditService } from "../src/common/audit/audit.service";
import type { AuditAction } from "../src/common/audit/audit-actions";
import {
  TenantContext,
  TenantStore,
} from "../src/common/tenant/tenant-context";
import { AUDIT_EVENTS_PAGE_SIZE } from "../src/modules/audit/dto/list-audit-events.dto";
import { PERMISSIONS } from "../prisma/seed/permissions";

/**
 * Task 21 gate: `GET /api/audit-events` (read-only, filterable,
 * paginated) and `GET /api/audit-events/access-log.csv` (the
 * `PERSONAL_DATA_VIEWED` view, spec lines 833-834). Events are seeded
 * directly through the real `AuditService.record`, the same way
 * `test/access-log.e2e-spec.ts` seeds them, so sequence/hash-chain
 * bookkeeping stays correct without this spec reimplementing it.
 */
describe("Audit read API (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  const auditService = new AuditService();
  const organizationIds: string[] = [];

  type EmployeeSession = { accessToken: string };

  const ctxFor = (organizationId: string, actorId: string): TenantStore => ({
    organizationId,
    actorType: "EMPLOYEE",
    actorId,
    actorLabel: `Employee ${actorId}`,
  });

  async function seedEvent(
    organizationId: string,
    actorId: string,
    input: {
      action: AuditAction;
      resourceType: string;
      resourceId?: string;
      subjectPrincipalId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await TenantContext.run(ctxFor(organizationId, actorId), () =>
      prisma.scoped.$transaction(async (tx) => {
        await auditService.record(tx, input);
      }),
    );
  }

  async function ensurePermission(code: string): Promise<void> {
    const permission = PERMISSIONS.find((row) => row.code === code);
    if (!permission) {
      throw new Error(`Missing real seeded permission ${code}`);
    }
    await prisma.permission.upsert({
      where: { code },
      create: permission,
      update: {},
    });
  }

  async function employeeSession(
    organizationId: string,
    permissions: string[],
    label: string,
  ): Promise<EmployeeSession> {
    await Promise.all(
      permissions.map((permission) => ensurePermission(permission)),
    );
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: `${label}-${randomUUID()}`,
        name: label,
        permissions: {
          create: permissions.map((permissionCode) => ({ permissionCode })),
        },
      },
    });
    const password = "CorrectHorseBattery9!";
    const email = `${randomUUID()}@audit-read.example.test`;
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: label,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: "ACTIVE",
        roleId: role.id,
      },
    });
    const response = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });
    expect(response.status).toBe(200);
    return { accessToken: response.body.accessToken as string };
  }

  function authenticated(session: EmployeeSession): [string, string] {
    return ["Authorization", `Bearer ${session.accessToken}`];
  }

  type Fixture = {
    organizationId: string;
    otherOrganizationId: string;
    actorId: string;
    subjectPrincipalIdA: string;
    subjectPrincipalIdB: string;
    reader: EmployeeSession;
    exporter: EmployeeSession;
  };
  let fixture: Fixture;

  async function createFixture(): Promise<Fixture> {
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    organizationIds.push(organizationId, otherOrganizationId);
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: `Audit ${organizationId}` },
        { id: otherOrganizationId, name: `Other ${otherOrganizationId}` },
      ],
    });

    const actorId = `employee-${randomUUID()}`;
    const subjectPrincipalIdA = randomUUID();
    const subjectPrincipalIdB = randomUUID();

    // Two PERSONAL_DATA_VIEWED events for two different subjects.
    await seedEvent(organizationId, actorId, {
      action: "PERSONAL_DATA_VIEWED",
      resourceType: "DataPrincipal",
      resourceId: subjectPrincipalIdA,
      subjectPrincipalId: subjectPrincipalIdA,
      metadata: { view: "detail" },
    });
    await seedEvent(organizationId, actorId, {
      action: "PERSONAL_DATA_VIEWED",
      resourceType: "DataPrincipal",
      resourceId: subjectPrincipalIdB,
      subjectPrincipalId: subjectPrincipalIdB,
      metadata: { view: "detail" },
    });
    // A non-personal-data event, for the action filter test.
    await seedEvent(organizationId, actorId, {
      action: "PURPOSE_CREATED",
      resourceType: "ProcessingPurpose",
      resourceId: randomUUID(),
      metadata: { change: "CREATED" },
    });

    // Cross-tenant noise: must never surface for this org's caller.
    await seedEvent(otherOrganizationId, `employee-${randomUUID()}`, {
      action: "PERSONAL_DATA_VIEWED",
      resourceType: "DataPrincipal",
      resourceId: randomUUID(),
      subjectPrincipalId: randomUUID(),
    });

    // Enough extra events to exercise pagination across two pages.
    const extraCount = AUDIT_EVENTS_PAGE_SIZE;
    for (let i = 0; i < extraCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await seedEvent(organizationId, actorId, {
        action: "EMPLOYEE_LOGIN_SUCCEEDED",
        resourceType: "Employee",
        resourceId: actorId,
      });
    }

    const reader = await employeeSession(
      organizationId,
      ["CAN_VIEW_AUDIT_LOG"],
      "Reader",
    );
    const exporter = await employeeSession(
      organizationId,
      ["CAN_VIEW_AUDIT_LOG", "CAN_EXPORT_EVIDENCE"],
      "Exporter",
    );

    return {
      organizationId,
      otherOrganizationId,
      actorId,
      subjectPrincipalIdA,
      subjectPrincipalIdB,
      reader,
      exporter,
    };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
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
    fixture = await createFixture();
  });

  afterAll(async () => {
    if (organizationIds.length) {
      // AuditEvent has no FK to Organization and is append-only (DB
      // triggers reject DELETE outright) -- left in place deliberately,
      // same convention as access-log.e2e-spec.ts / audit.e2e-spec.ts.
      await prisma.refreshToken.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.employee.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { role: { organizationId: { in: organizationIds } } },
      });
      await prisma.role.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${organizationIds})`;
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    await prisma.$disconnect();
    await app.close();
  });

  describe("GET /api/audit-events", () => {
    it("filters by subjectPrincipalId", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/audit-events")
        .query({ subjectPrincipalId: fixture.subjectPrincipalIdA })
        .set(...authenticated(fixture.reader));
      expect(response.status).toBe(200);
      const items = response.body.items as Array<{
        subjectPrincipalId: string | null;
      }>;
      expect(items.length).toBeGreaterThan(0);
      expect(
        items.every(
          (item) => item.subjectPrincipalId === fixture.subjectPrincipalIdA,
        ),
      ).toBe(true);
    });

    it("filters by action", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/audit-events")
        .query({ action: "PURPOSE_CREATED" })
        .set(...authenticated(fixture.reader));
      expect(response.status).toBe(200);
      const items = response.body.items as Array<{ action: string }>;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.action === "PURPOSE_CREATED")).toBe(
        true,
      );
    });

    it("paginates, and total count matches the directly-queried database count", async () => {
      // Scoped to fixture.actorId, not just organizationId+action: the
      // reader/exporter sessions created in createFixture() each perform a
      // real login, which itself writes a genuine EMPLOYEE_LOGIN_SUCCEEDED
      // event for this org under their *own* actor id. Filtering by the
      // fixture's seeding actor keeps this assertion exactly the
      // AUDIT_EVENTS_PAGE_SIZE rows the loop above actually seeded.
      const totalInDb = await prisma.auditEvent.count({
        where: {
          organizationId: fixture.organizationId,
          action: "EMPLOYEE_LOGIN_SUCCEEDED",
          actorId: fixture.actorId,
        },
      });
      expect(totalInDb).toBe(AUDIT_EVENTS_PAGE_SIZE);

      const page1 = await request(app.getHttpServer())
        .get("/api/audit-events")
        .query({
          action: "EMPLOYEE_LOGIN_SUCCEEDED",
          actorId: fixture.actorId,
          page: 1,
        })
        .set(...authenticated(fixture.reader));
      expect(page1.status).toBe(200);
      expect(page1.body.items).toHaveLength(AUDIT_EVENTS_PAGE_SIZE);
      expect(page1.body.totalCount).toBe(totalInDb);

      // The regression this guards against: AuditEvent.sequence is a
      // Prisma BigInt column. JSON.stringify() cannot serialize a bigint
      // at all (that is exactly the Task 21 defect -- 500 "Do not know how
      // to serialize a BigInt"), and a bare JS number would silently lose
      // precision above 2^53, so the wire contract is a decimal string.
      const sequences = (page1.body.items as Array<{ sequence: unknown }>).map(
        (item) => item.sequence,
      );
      expect(sequences.length).toBeGreaterThan(0);
      for (const sequence of sequences) {
        expect(typeof sequence).toBe("string");
        expect(sequence as string).toMatch(/^\d+$/);
        // Round-trips to a real bigint with no precision loss.
        expect(() => BigInt(sequence as string)).not.toThrow();
      }
      // `sequence desc` ordering must survive string serialization: verify
      // via BigInt comparison, not lexical/numeric string comparison.
      const sequenceBigInts = sequences.map((sequence) =>
        BigInt(sequence as string),
      );
      for (let i = 1; i < sequenceBigInts.length; i += 1) {
        const prev = sequenceBigInts[i - 1] as bigint;
        const curr = sequenceBigInts[i] as bigint;
        expect(prev > curr).toBe(true);
      }

      const page2 = await request(app.getHttpServer())
        .get("/api/audit-events")
        .query({
          action: "EMPLOYEE_LOGIN_SUCCEEDED",
          actorId: fixture.actorId,
          page: 2,
        })
        .set(...authenticated(fixture.reader));
      expect(page2.status).toBe(200);
      expect(page2.body.items).toHaveLength(0);
    });

    it("never returns another organization's events", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/audit-events")
        .query({ page: 1 })
        .set(...authenticated(fixture.reader));
      expect(response.status).toBe(200);
      const items = response.body.items as Array<{ id: string }>;
      const otherOrgEvents = await prisma.auditEvent.findMany({
        where: { organizationId: fixture.otherOrganizationId },
        select: { id: true },
      });
      const otherIds = new Set(otherOrgEvents.map((e) => e.id));
      expect(items.some((item) => otherIds.has(item.id))).toBe(false);
    });

    it("rejects a caller without CAN_VIEW_AUDIT_LOG", async () => {
      const noPerms = await employeeSession(
        fixture.organizationId,
        [],
        "No perms",
      );
      const response = await request(app.getHttpServer())
        .get("/api/audit-events")
        .set(...authenticated(noPerms));
      expect(response.status).toBe(403);
    });

    it("I-1: withholds metadata from an actor without CAN_VIEW_ALL_PERSONAL_DATA, and returns it to one with that permission", async () => {
      // Final whole-branch review, I-1: PRINCIPAL_CREATED's metadata
      // carries a raw displayName (see linking.service.ts), and the
      // seeded AUDITOR role holds CAN_VIEW_AUDIT_LOG without
      // CAN_VIEW_ALL_PERSONAL_DATA -- before this fix, that role could
      // read every principal's unmasked name straight off this endpoint,
      // one page at a time, defeating the masking `/app/principals/:id`
      // enforces for the exact same actor.
      const subjectPrincipalId = randomUUID();
      await seedEvent(fixture.organizationId, fixture.actorId, {
        action: "PRINCIPAL_CREATED",
        resourceType: "DataPrincipal",
        resourceId: subjectPrincipalId,
        subjectPrincipalId,
        metadata: { displayName: "Aman Sharma", reference: "DP-000123" },
      });

      // `fixture.reader` holds only CAN_VIEW_AUDIT_LOG -- the AUDITOR
      // shape this finding is about.
      const readerRes = await request(app.getHttpServer())
        .get("/api/audit-events")
        .query({ action: "PRINCIPAL_CREATED", subjectPrincipalId })
        .set(...authenticated(fixture.reader));
      expect(readerRes.status).toBe(200);
      const readerItems = readerRes.body.items as Array<
        Record<string, unknown>
      >;
      expect(readerItems.length).toBeGreaterThan(0);
      for (const item of readerItems) {
        expect(item).not.toHaveProperty("metadata");
        expect(JSON.stringify(item)).not.toContain("Aman Sharma");
      }

      const fullAccessReader = await employeeSession(
        fixture.organizationId,
        ["CAN_VIEW_AUDIT_LOG", "CAN_VIEW_ALL_PERSONAL_DATA"],
        "Full access reader",
      );
      const fullAccessRes = await request(app.getHttpServer())
        .get("/api/audit-events")
        .query({ action: "PRINCIPAL_CREATED", subjectPrincipalId })
        .set(...authenticated(fullAccessReader));
      expect(fullAccessRes.status).toBe(200);
      const fullAccessItems = fullAccessRes.body.items as Array<{
        metadata: Record<string, unknown>;
      }>;
      expect(fullAccessItems.length).toBeGreaterThan(0);
      expect(fullAccessItems[0]?.metadata).toEqual({
        displayName: "Aman Sharma",
        reference: "DP-000123",
      });

      // The stored row itself is untouched by this read-side fix --
      // AuditService.record() remains the only writer and the table
      // stays complete for chain verification.
      const storedEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId: fixture.organizationId,
          action: "PRINCIPAL_CREATED",
          subjectPrincipalId,
        },
      });
      expect(
        (storedEvent?.metadata as Record<string, unknown> | undefined)?.[
          "displayName"
        ],
      ).toBe("Aman Sharma");
    });
  });

  describe("GET /api/audit-events/access-log.csv", () => {
    it("is the PERSONAL_DATA_VIEWED view, filterable by subject principal, and writes EVIDENCE_EXPORTED", async () => {
      const before = await prisma.auditEvent.count({
        where: {
          organizationId: fixture.organizationId,
          action: "EVIDENCE_EXPORTED",
        },
      });

      const response = await request(app.getHttpServer())
        .get("/api/audit-events/access-log.csv")
        .query({ subjectPrincipalId: fixture.subjectPrincipalIdA })
        .set(...authenticated(fixture.exporter));
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");

      const lines = (response.text as string)
        .split("\r\n")
        .filter((line) => line.length > 0);
      expect(lines[0]).toBe(
        "Event ID,Sequence,Occurred At,Actor Type,Actor ID,Actor Label," +
          "Subject Principal ID,Resource Type,Resource ID",
      );
      // Exactly one PERSONAL_DATA_VIEWED event was seeded for subject A.
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain(fixture.subjectPrincipalIdA);

      const after = await prisma.auditEvent.count({
        where: {
          organizationId: fixture.organizationId,
          action: "EVIDENCE_EXPORTED",
        },
      });
      expect(after - before).toBe(1);

      const exportEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId: fixture.organizationId,
          action: "EVIDENCE_EXPORTED",
        },
        orderBy: { sequence: "desc" },
      });
      expect(exportEvent?.subjectPrincipalId).toBe(fixture.subjectPrincipalIdA);
      expect(
        (exportEvent?.metadata as Record<string, unknown> | undefined)?.[
          "exportType"
        ],
      ).toBe("ACCESS_LOG");
    });

    it("exports the whole organization's access log when no subject is given", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/audit-events/access-log.csv")
        .set(...authenticated(fixture.exporter));
      expect(response.status).toBe(200);
      const lines = (response.text as string)
        .split("\r\n")
        .filter((line) => line.length > 0);
      // Header + at least the two PERSONAL_DATA_VIEWED events seeded for
      // subjects A and B (a third export's own EVIDENCE_EXPORTED write
      // from the previous test does not count -- that action is not
      // PERSONAL_DATA_VIEWED).
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it("rejects a caller without CAN_EXPORT_EVIDENCE", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/audit-events/access-log.csv")
        .set(...authenticated(fixture.reader));
      expect(response.status).toBe(403);
    });
  });
});
