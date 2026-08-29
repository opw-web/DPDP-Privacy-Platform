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
 *    recomputes every hash from scratch reports the whole chain intact.
 *  - Two organizations maintain independent chains, both starting at 1 --
 *    proving the `Counter` lock is scoped per (organizationId, name), not
 *    global.
 */
describe("AuditService hash chain (e2e)", () => {
  const prisma = new PrismaService();
  const auditService = new AuditService();

  let orgAId: string;
  let orgBId: string;

  const ctxFor = (organizationId: string): TenantStore => ({
    organizationId,
    actorType: "EMPLOYEE",
    actorId: `actor-${organizationId}`,
    actorLabel: "Test Actor",
  });

  beforeAll(async () => {
    await prisma.$connect();
    orgAId = randomUUID();
    orgBId = randomUUID();
    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Audit Org A" },
        { id: orgBId, name: "Audit Org B" },
      ],
    });
  });

  afterAll(async () => {
    // AuditEvent rows are immutable by design (Check 16: the append-only
    // triggers reject DELETE, not just UPDATE) -- this test's rows are
    // deliberately left in place rather than "cleaned up". There is no FK
    // from AuditEvent to Organization, so deleting the test organizations
    // below does not fail; the audit rows simply outlive them, exactly as
    // they would for a real deleted organization in production.
    await prisma.$queryRaw`DELETE FROM "Counter" WHERE "organizationId" IN (${orgAId}, ${orgBId})`;
    await prisma.organization.deleteMany({
      where: { id: { in: [orgAId, orgBId] } },
    });
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

  it("allocates gap-free, duplicate-free sequences under real concurrency, hash-chained end to end", async () => {
    const TRANSACTIONS = 10;
    const EVENTS_PER_TRANSACTION = 5;
    const ctx = ctxFor(orgAId);

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
        }),
      );

    // Genuine concurrency: fire all 10 transactions at once and let the
    // Counter row's SELECT ... FOR UPDATE lock serialize them. A
    // sequential `for` loop here would prove nothing about the lock.
    await Promise.all(
      Array.from({ length: TRANSACTIONS }, (_, txIndex) =>
        writeOneTransaction(txIndex),
      ),
    );

    const events = await prisma.auditEvent.findMany({
      where: { organizationId: orgAId },
      orderBy: { sequence: "asc" },
    });

    expect(events).toHaveLength(TRANSACTIONS * EVENTS_PER_TRANSACTION);

    const sequences = events.map((e) => e.sequence.toString());
    const expectedSequences = Array.from(
      { length: TRANSACTIONS * EVENTS_PER_TRANSACTION },
      (_, i) => String(i + 1),
    );
    // No gaps, no duplicates, starting at 1: the actual sequence list
    // equals 1..50 exactly.
    expect(sequences).toEqual(expectedSequences);
    // Belt-and-braces: a Set collapses duplicates, so an unequal size
    // here would specifically indicate a duplicate rather than a gap.
    expect(new Set(sequences).size).toBe(sequences.length);

    verifyChainIntact(events);
  });

  it("maintains independent, both-starting-at-1 sequences for a second organization", async () => {
    const ctxA = ctxFor(orgAId);
    const ctxB = ctxFor(orgBId);

    // Org A already has 50 events from the previous test; org B has none
    // yet. Write 3 fresh events to each, concurrently, and confirm org B
    // starts at 1 regardless of org A's already-advanced counter, and
    // that org A's sequence continues from 51 rather than being disturbed
    // by org B's writes.
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
      writeForOrg(ctxA, "orgA-second-batch"),
      writeForOrg(ctxB, "orgB-first-batch"),
    ]);

    const [orgAEvents, orgBEvents] = await Promise.all([
      prisma.auditEvent.findMany({
        where: { organizationId: orgAId },
        orderBy: { sequence: "asc" },
      }),
      prisma.auditEvent.findMany({
        where: { organizationId: orgBId },
        orderBy: { sequence: "asc" },
      }),
    ]);

    expect(orgAEvents).toHaveLength(53);
    expect(orgAEvents.map((e) => e.sequence.toString())).toEqual(
      Array.from({ length: 53 }, (_, i) => String(i + 1)),
    );

    expect(orgBEvents).toHaveLength(3);
    expect(orgBEvents.map((e) => e.sequence.toString())).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(orgBEvents[0]?.previousHash).toBeNull();

    verifyChainIntact(orgAEvents);
    verifyChainIntact(orgBEvents);
  });

  it("rejects metadata that looks like a credential, password hash, or token", async () => {
    const ctx = ctxFor(orgAId);
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
