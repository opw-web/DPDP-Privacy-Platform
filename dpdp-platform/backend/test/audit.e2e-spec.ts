import { randomUUID, createHash } from "crypto";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  TenantContext,
  TenantStore,
} from "../src/common/tenant/tenant-context";
import { AuditService } from "../src/common/audit/audit.service";
import { canonicalJson } from "../src/common/audit/canonical-json";
import type { AuditEvent } from "@prisma/client";

/**
 * Task 4 gate: AuditService's counter allocation and hash chain, exercised
 * against the real Postgres database with genuine concurrency (real
 * transactions racing via `Promise.all`, not a sequential loop -- a
 * sequential test cannot exercise the `SELECT ... FOR UPDATE` lock at
 * all).
 *
 * Covers:
 *  - Check 17 (spec lines 1097-1100): 50 events written concurrently
 *    across 10 real transactions for one organization produce sequences
 *    1..50 with no gaps and no duplicates.
 *  - The hash chain: each event's `previousHash` equals the immediately
 *    preceding event's `hash`, and a chain-verification helper that
 *    recomputes every hash from scratch reports the whole chain intact --
 *    including (fix-round-1 Important 2) an event whose metadata contains
 *    exactly the shapes that differ between `canonicalJson` and a plain
 *    JS-object comparison after a real Postgres `jsonb` round trip: a
 *    nested object, an array of objects, `null`, a unicode string, keys
 *    inserted out of alphabetical order, and a `Date`.
 *  - Two organizations maintain independent chains, both starting at 1 --
 *    proving the `Counter` lock is scoped per (organizationId, name), not
 *    global.
 *
 * Fix-round-1 (Important 2 / cheap-fix 2): every test creates its OWN
 * fresh organization(s) instead of sharing `beforeAll`-seeded orgs across
 * tests. No test's assertions depend on another test having run first, or
 * on execution order at all -- each is runnable alone.
 */
describe("AuditService hash chain (e2e)", () => {
  const prisma = new PrismaService();
  const auditService = new AuditService();
  const createdOrgIds: string[] = [];

  const ctxFor = (organizationId: string): TenantStore => ({
    organizationId,
    actorType: "EMPLOYEE",
    actorId: `actor-${organizationId}`,
    actorLabel: "Test Actor",
  });

  async function createOrg(name: string): Promise<string> {
    const id = randomUUID();
    await prisma.organization.create({ data: { id, name } });
    createdOrgIds.push(id);
    return id;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    // AuditEvent rows are immutable by design (Check 16: the append-only
    // triggers reject DELETE, not just UPDATE) -- this test's rows are
    // deliberately left in place rather than "cleaned up". There is no FK
    // from AuditEvent to Organization, so deleting the test organizations
    // below does not fail; the audit rows simply outlive them, exactly as
    // they would for a real deleted organization in production.
    if (createdOrgIds.length > 0) {
      // One DELETE per org rather than a single `IN (...)` list: Prisma's
      // tagged-template raw SQL parameterizes each interpolation as ONE
      // value, so `IN (${createdOrgIds.join(",")})` would bind a single
      // comma-joined string, not a list of UUIDs, and match nothing.
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

  /**
   * Recomputes every event's hash from its own stored fields and asserts
   * it matches the stored `hash`, and that `previousHash` matches the
   * prior event's stored `hash` (or is null for sequence 1). Walking the
   * whole chain end to end this way is what "chain verification reports
   * intact" means for this test -- not just spot-checking two adjacent
   * rows.
   */
  function verifyChainIntact(events: AuditEvent[]): void {
    let expectedPreviousHash: string | null = null;
    for (const event of events) {
      expect(event.previousHash).toBe(expectedPreviousHash);
      const recomputed = createHash("sha256")
        .update(
          (event.previousHash ?? "") +
            event.sequence.toString() +
            event.action +
            (event.resourceId ?? "") +
            canonicalJson(event.metadata) +
            event.createdAt.toISOString(),
        )
        .digest("hex");
      expect(recomputed).toBe(event.hash);
      expectedPreviousHash = event.hash;
    }
  }

  it("allocates gap-free, duplicate-free sequences under real concurrency, hash-chained end to end (incl. rich metadata)", async () => {
    const orgId = await createOrg("Audit Concurrency Org");
    const TRANSACTIONS = 10;
    const EVENTS_PER_TRANSACTION = 5;
    const ctx = ctxFor(orgId);
    // Cheap-fix: ten transactions serializing on one Counter row lock
    // must have room to actually wait on each other rather than racing
    // Prisma's 5s interactive-transaction default on a slow/loaded
    // machine -- that would flake as a timeout, not a correctness
    // failure. Generous, explicit values here.
    const TX_OPTIONS = { timeout: 20_000, maxWait: 20_000 };

    const writeOneTransaction = (txIndex: number) =>
      TenantContext.run(ctx, () =>
        prisma.scoped.$transaction(async (tx) => {
          for (let i = 0; i < EVENTS_PER_TRANSACTION; i++) {
            await auditService.record(tx, {
              action: "EMPLOYEE_CREATED",
              resourceType: "Employee",
              resourceId: `emp-${txIndex}-${i}`,
              metadata: { txIndex, i },
            });
          }
        }, TX_OPTIONS),
      );

    // Genuine concurrency: fire all 10 transactions at once and let the
    // Counter row's SELECT ... FOR UPDATE lock serialize them. A
    // sequential `for` loop here would prove nothing about the lock.
    await Promise.all(
      Array.from({ length: TRANSACTIONS }, (_, txIndex) =>
        writeOneTransaction(txIndex),
      ),
    );

    // Fix-round-1 Important 2: a 51st event whose metadata is exactly the
    // shape that a flat-integers-only metadata object cannot exercise --
    // this is what actually proves canonicalJson survives a real
    // Postgres jsonb round trip (and would fail if the Important-1 Date
    // fix were reverted).
    await TenantContext.run(ctx, () =>
      prisma.scoped.$transaction(
        (tx) =>
          auditService.record(tx, {
            action: "ORG_SETTINGS_UPDATED",
            resourceType: "Organization",
            resourceId: orgId,
            metadata: {
              // Out-of-alphabetical-order insertion on purpose.
              zProfile: { nested: { deeplyNested: true }, count: 2 },
              aReasons: [
                { code: "R1", note: "café — ünïcödé ✓" },
                { code: "R2", note: null },
              ],
              occurredAt: new Date("2026-08-30T09:15:00.000Z"),
              previousValue: null,
              label: "naïve résumé 日本語",
            },
          }),
        TX_OPTIONS,
      ),
    );

    const events = await prisma.auditEvent.findMany({
      where: { organizationId: orgId },
      orderBy: { sequence: "asc" },
    });

    const expectedCount = TRANSACTIONS * EVENTS_PER_TRANSACTION + 1;
    expect(events).toHaveLength(expectedCount);

    const sequences = events.map((e) => e.sequence.toString());
    const expectedSequences = Array.from({ length: expectedCount }, (_, i) =>
      String(i + 1),
    );
    // No gaps, no duplicates, starting at 1: the actual sequence list
    // equals 1..51 exactly.
    expect(sequences).toEqual(expectedSequences);
    // Belt-and-braces: a Set collapses duplicates, so an unequal size
    // here would specifically indicate a duplicate rather than a gap.
    expect(new Set(sequences).size).toBe(sequences.length);

    verifyChainIntact(events);

    // Sanity: the rich-metadata event really did round-trip through
    // Postgres as something other than the naive-object "{}" a Date
    // would have produced pre-fix.
    const lastEvent = events[events.length - 1];
    expect(lastEvent).toBeDefined();
    const storedMetadata = lastEvent?.metadata as Record<string, unknown>;
    expect(storedMetadata["occurredAt"]).toBe("2026-08-30T09:15:00.000Z");
  });

  it("maintains independent, both-starting-at-1 sequences for two organizations", async () => {
    const orgXId = await createOrg("Audit Independence Org X");
    const orgYId = await createOrg("Audit Independence Org Y");
    const ctxX = ctxFor(orgXId);
    const ctxY = ctxFor(orgYId);

    // Fresh orgs for THIS test (fix-round-1 cheap-fix 2) -- this test's
    // assertions ("both start at 1") hold regardless of whether it runs
    // first, last, or alone.
    const writeForOrg = (ctx: TenantStore, resourcePrefix: string) =>
      TenantContext.run(ctx, () =>
        prisma.scoped.$transaction(async (tx) => {
          for (let i = 0; i < 3; i++) {
            await auditService.record(tx, {
              action: "PRINCIPAL_CREATED",
              resourceType: "DataPrincipal",
              resourceId: `${resourcePrefix}-${i}`,
              metadata: { i },
            });
          }
        }),
      );

    await Promise.all([
      writeForOrg(ctxX, "orgX-batch"),
      writeForOrg(ctxY, "orgY-batch"),
    ]);

    const [orgXEvents, orgYEvents] = await Promise.all([
      prisma.auditEvent.findMany({
        where: { organizationId: orgXId },
        orderBy: { sequence: "asc" },
      }),
      prisma.auditEvent.findMany({
        where: { organizationId: orgYId },
        orderBy: { sequence: "asc" },
      }),
    ]);

    expect(orgXEvents).toHaveLength(3);
    expect(orgXEvents.map((e) => e.sequence.toString())).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(orgXEvents[0]?.previousHash).toBeNull();

    expect(orgYEvents).toHaveLength(3);
    expect(orgYEvents.map((e) => e.sequence.toString())).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(orgYEvents[0]?.previousHash).toBeNull();

    verifyChainIntact(orgXEvents);
    verifyChainIntact(orgYEvents);
  });

  it("rejects metadata that looks like a credential, password hash, or token", async () => {
    const orgId = await createOrg("Audit Forbidden Metadata Org");
    const ctx = ctxFor(orgId);
    await expect(
      TenantContext.run(ctx, () =>
        prisma.scoped.$transaction(async (tx) =>
          auditService.record(tx, {
            action: "EMPLOYEE_LOGIN_FAILED",
            resourceType: "Employee",
            metadata: { attemptedPassword: "hunter2" },
          }),
        ),
      ),
    ).rejects.toThrow(/credential\/secret\/token/);

    await expect(
      TenantContext.run(ctx, () =>
        prisma.scoped.$transaction(async (tx) =>
          auditService.record(tx, {
            action: "EMPLOYEE_LOGIN_SUCCEEDED",
            resourceType: "Employee",
            metadata: { session: { refreshToken: "abc.def.ghi" } },
          }),
        ),
      ),
    ).rejects.toThrow(/credential\/secret\/token/);
  });
});
