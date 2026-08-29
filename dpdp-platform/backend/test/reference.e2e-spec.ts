import { randomUUID } from "crypto";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  TenantContext,
  TenantStore,
} from "../src/common/tenant/tenant-context";
import { ReferenceService } from "../src/common/reference/reference.service";
import { AUDIT_COUNTER_NAME } from "../src/common/reference/counter";

/**
 * Task 4 fix-round-1, Important 4 and 5: `ReferenceService` had no
 * coverage at all -- neither the human-facing `DP-000123` formatting the
 * brief names explicitly, nor the "AUDIT" counter reservation that keeps
 * a stray caller from burning an audit sequence number with no
 * `AuditEvent` row behind it (exactly the Check 17 gap this task exists
 * to prevent).
 */
describe("ReferenceService (e2e)", () => {
  const prisma = new PrismaService();
  const referenceService = new ReferenceService(prisma);
  const createdOrgIds: string[] = [];

  async function createOrg(name: string): Promise<TenantStore> {
    const id = randomUUID();
    await prisma.organization.create({ data: { id, name } });
    createdOrgIds.push(id);
    return {
      organizationId: id,
      actorType: "EMPLOYEE",
      actorId: `actor-${id}`,
      actorLabel: "Test Actor",
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await Promise.all(
        createdOrgIds.map(
          (id) =>
            prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ${id}`,
        ),
      );
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("nextPrincipalReference() formats DP-000001, DP-000002, ... zero-padded to 6 digits", async () => {
    const ctx = await createOrg("Reference Format Org");
    const first = await TenantContext.run(ctx, () =>
      referenceService.nextPrincipalReference(),
    );
    const second = await TenantContext.run(ctx, () =>
      referenceService.nextPrincipalReference(),
    );
    expect(first).toBe("DP-000001");
    expect(second).toBe("DP-000002");
  });

  it("next() allocates distinct, gap-free values under real concurrency for the same organization", async () => {
    const ctx = await createOrg("Reference Concurrency Org");
    const COUNT = 10;

    // Genuine concurrency, same as the AuditService concurrency test:
    // fire every allocation at once via Promise.all so the Counter row's
    // SELECT ... FOR UPDATE lock is what serializes them, not test
    // ordering.
    const values = await Promise.all(
      Array.from({ length: COUNT }, () =>
        TenantContext.run(ctx, () => referenceService.next("WIDGET")),
      ),
    );

    const asStrings = values
      .map((v) => v.toString())
      .sort((a, b) => Number(a) - Number(b));
    expect(asStrings).toEqual(
      Array.from({ length: COUNT }, (_, i) => String(i + 1)),
    );
    // Belt-and-braces: distinctness specifically, independent of ordering.
    expect(new Set(asStrings).size).toBe(COUNT);
  });

  it("next() rejects the reserved AUDIT counter name (fix-round-1 Important 4)", async () => {
    const ctx = await createOrg("Reference Reserved Name Org");
    await expect(
      TenantContext.run(ctx, () => referenceService.next(AUDIT_COUNTER_NAME)),
    ).rejects.toThrow(/reserved for AuditService\.record/);
  });
});
