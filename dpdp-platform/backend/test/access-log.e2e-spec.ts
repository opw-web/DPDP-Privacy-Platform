import { randomUUID } from "crypto";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  TenantContext,
  TenantStore,
} from "../src/common/tenant/tenant-context";
import { AuditService } from "../src/common/audit/audit.service";
import { AccessLogService } from "../src/common/audit/access-log.service";
import type { AuditEvent } from "@prisma/client";

/**
 * Task 7 gate (Check 15, spec lines 1078-1086; SE-03 / Rule 6(1)(c)):
 * `AccessLogService.recordPersonalDataViewed` writes exactly one
 * `PERSONAL_DATA_VIEWED` event naming both actor and subject.
 *
 * No `/api/principals/:id` route exists yet in this codebase (Tasks
 * 20-21 add it) -- there is nothing to `curl` for "opening a principal
 * profile" today. This exercises `AccessLogService` directly, against the
 * real Postgres database and a real `AuditService`, exactly the way
 * `audit.e2e-spec.ts` (Task 4's own gate) exercises `AuditService.record`
 * directly rather than through an HTTP route. Tasks 20-21 must call this
 * SAME service from their route handlers -- see the doc comment on
 * `AccessLogService.recordPersonalDataViewed` for the exact call shape
 * each of those routes needs.
 */
describe("AccessLogService (e2e)", () => {
  const prisma = new PrismaService();
  const auditService = new AuditService();
  const accessLogService = new AccessLogService(auditService);
  const createdOrgIds: string[] = [];

  async function createOrg(name: string): Promise<string> {
    const id = randomUUID();
    await prisma.organization.create({ data: { id, name } });
    createdOrgIds.push(id);
    return id;
  }

  const ctxFor = (organizationId: string, actorId: string): TenantStore => ({
    organizationId,
    actorType: "EMPLOYEE",
    actorId,
    actorLabel: `Employee ${actorId}`,
  });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${createdOrgIds})`;
      // AuditEvent has no FK to Organization and is append-only -- left in
      // place deliberately, same convention as audit.e2e-spec.ts.
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("writes exactly one PERSONAL_DATA_VIEWED event naming actor and subject", async () => {
    const organizationId = await createOrg(`AccessLog Org ${randomUUID()}`);
    const actorId = `employee-${randomUUID()}`;
    const subjectPrincipalId = randomUUID();

    await TenantContext.run(ctxFor(organizationId, actorId), () =>
      prisma.scoped.$transaction(async (tx) => {
        await accessLogService.recordPersonalDataViewed(tx, {
          subjectPrincipalId,
          resourceType: "DataPrincipal",
          resourceId: subjectPrincipalId,
          context: { view: "detail" },
        });
      }),
    );

    const events = await prisma.auditEvent.findMany({
      where: { organizationId, action: "PERSONAL_DATA_VIEWED" },
    });

    expect(events).toHaveLength(1);
    const event = events[0] as AuditEvent;
    expect(event.actorId).toBe(actorId);
    expect(event.actorType).toBe("EMPLOYEE");
    expect(event.subjectPrincipalId).toBe(subjectPrincipalId);
    expect(event.resourceType).toBe("DataPrincipal");
    expect(event.resourceId).toBe(subjectPrincipalId);

    const projections = await prisma.accessLogEntry.findMany({
      where: { organizationId },
    });
    expect(projections).toHaveLength(1);
    expect(projections[0]?.auditEventId).toBe(event.id);
    expect(projections[0]?.subjectPrincipalId).toBe(subjectPrincipalId);
  });

  it("viewing three different principals writes three distinct events, one per subject -- never one per field", async () => {
    const organizationId = await createOrg(`AccessLog Org ${randomUUID()}`);
    const actorId = `employee-${randomUUID()}`;
    const subjectIds = [randomUUID(), randomUUID(), randomUUID()];

    for (const subjectPrincipalId of subjectIds) {
      // A "detail page" response would embed several PrincipalDataField
      // values (name, email, phone, ...) -- exactly one call per VIEW,
      // not per field, is the whole point of this test.
      await TenantContext.run(ctxFor(organizationId, actorId), () =>
        prisma.scoped.$transaction(async (tx) => {
          await accessLogService.recordPersonalDataViewed(tx, {
            subjectPrincipalId,
            resourceType: "DataPrincipal",
            resourceId: subjectPrincipalId,
            context: {
              view: "detail",
              fieldsShown: ["EMAIL", "PHONE", "FULL_NAME"],
            },
          });
        }),
      );
    }

    const events = await prisma.auditEvent.findMany({
      where: { organizationId, action: "PERSONAL_DATA_VIEWED" },
      orderBy: { sequence: "asc" },
    });

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.subjectPrincipalId).sort()).toEqual(
      [...subjectIds].sort(),
    );
  });

  it("commits atomically with the caller's own transaction (rollback drops the access-log write too)", async () => {
    const organizationId = await createOrg(`AccessLog Org ${randomUUID()}`);
    const actorId = `employee-${randomUUID()}`;
    const subjectPrincipalId = randomUUID();

    await expect(
      TenantContext.run(ctxFor(organizationId, actorId), () =>
        prisma.scoped.$transaction(async (tx) => {
          await accessLogService.recordPersonalDataViewed(tx, {
            subjectPrincipalId,
            resourceType: "DataPrincipal",
            resourceId: subjectPrincipalId,
          });
          throw new Error("simulated failure after the access-log write");
        }),
      ),
    ).rejects.toThrow("simulated failure");

    const events = await prisma.auditEvent.findMany({
      where: { organizationId, action: "PERSONAL_DATA_VIEWED" },
    });
    expect(events).toHaveLength(0);
    expect(
      await prisma.accessLogEntry.count({ where: { organizationId } }),
    ).toBe(0);
  });

  it("two organizations' access logs never cross", async () => {
    const orgA = await createOrg(`AccessLog Org A ${randomUUID()}`);
    const orgB = await createOrg(`AccessLog Org B ${randomUUID()}`);
    const subjectInA = randomUUID();
    const subjectInB = randomUUID();

    await TenantContext.run(ctxFor(orgA, `employee-${randomUUID()}`), () =>
      prisma.scoped.$transaction((tx) =>
        accessLogService.recordPersonalDataViewed(tx, {
          subjectPrincipalId: subjectInA,
          resourceType: "DataPrincipal",
          resourceId: subjectInA,
        }),
      ),
    );
    await TenantContext.run(ctxFor(orgB, `employee-${randomUUID()}`), () =>
      prisma.scoped.$transaction((tx) =>
        accessLogService.recordPersonalDataViewed(tx, {
          subjectPrincipalId: subjectInB,
          resourceType: "DataPrincipal",
          resourceId: subjectInB,
        }),
      ),
    );

    const eventsInA = await prisma.auditEvent.findMany({
      where: { organizationId: orgA, action: "PERSONAL_DATA_VIEWED" },
    });
    const eventsInB = await prisma.auditEvent.findMany({
      where: { organizationId: orgB, action: "PERSONAL_DATA_VIEWED" },
    });

    expect(eventsInA).toHaveLength(1);
    expect(eventsInB).toHaveLength(1);
    expect(eventsInA[0]?.subjectPrincipalId).toBe(subjectInA);
    expect(eventsInB[0]?.subjectPrincipalId).toBe(subjectInB);
  });
});
