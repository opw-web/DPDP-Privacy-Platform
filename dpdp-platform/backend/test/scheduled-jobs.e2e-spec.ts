import { ACCESS_LOG_RETENTION_FLOOR_DAYS } from "../src/config/access-log-retention.constant";
import { AccessLogRetentionProcessor } from "../src/queues/access-log-retention.processor";
import { AuditChainVerifyProcessor } from "../src/queues/audit-chain-verify.processor";
import { Mvp2ScheduleReconciliationService, MVP2_REPEATABLE_SCHEDULES } from "../src/queues/mvp2-schedules";

describe("Scheduled jobs", () => {
  it("refuses access-log retention below the Rule 6(1)(e) floor and runs at the floor", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { auditEvent: { findFirst } };
    const tooShort = new AccessLogRetentionProcessor(prisma as never, { get: () => ({ accessLogRetentionDays: ACCESS_LOG_RETENTION_FLOOR_DAYS - 1 }) } as never);
    await expect(tooShort.runRetention()).rejects.toThrow(/Rule 6\(1\)\(e\)/);
    expect(findFirst).not.toHaveBeenCalled();

    const atFloor = new AccessLogRetentionProcessor(prisma as never, { get: () => ({ accessLogRetentionDays: ACCESS_LOG_RETENTION_FLOOR_DAYS }) } as never);
    await expect(atFloor.runRetention(new Date("2026-09-01T00:00:00.000Z"))).resolves.toMatchObject({ deleted: 0 });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ action: "PERSONAL_DATA_VIEWED" }) }));
  });

  it("deletes only expired AccessLogEntry projections and leaves AuditEvent untouched", async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 7 });
    const auditEvent = { findFirst: jest.fn() };
    const prisma = { accessLogEntry: { deleteMany }, auditEvent };
    const processor = new AccessLogRetentionProcessor(
      prisma as never,
      { get: () => ({ accessLogRetentionDays: ACCESS_LOG_RETENTION_FLOOR_DAYS }) } as never,
    );
    const now = new Date("2026-09-01T00:00:00.000Z");

    await expect(processor.runRetention(now)).resolves.toEqual({
      deleted: 7,
      cutoff: new Date("2025-09-01T00:00:00.000Z"),
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { occurredAt: { lt: new Date("2025-09-01T00:00:00.000Z") } },
    });
    expect(auditEvent.findFirst).not.toHaveBeenCalled();
  });

  it("raises exactly one CRITICAL notification for every ADMIN when a chain is corrupted", async () => {
    const send = jest.fn().mockResolvedValue({});
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([{ id: "org-1" }]) },
      scoped: { employee: { findMany: jest.fn().mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]) } },
    };
    const processor = new AuditChainVerifyProcessor(
      prisma as never,
      { verifyChain: jest.fn().mockResolvedValue({ valid: false, checkedCount: 3, firstBrokenSequence: "2", reason: "stored hash does not match the recomputed hash" }) } as never,
      { send } as never,
    );
    await expect(processor.runVerificationCycle()).resolves.toEqual({ organizationsScanned: 1, brokenChains: 1, notificationsSent: 2 });
    expect(send).toHaveBeenCalledTimes(2);
    for (const call of send.mock.calls) {
      expect(call[0]).toMatchObject({ audience: "EMPLOYEE", severity: "CRITICAL", title: "Audit chain verification failed" });
    }
  });

  it("restores a deleted fixed MVP 2 scheduler during reconciliation", async () => {
    const schedulers = new Set<string>();
    const queue = { upsertJobScheduler: jest.fn(async (id: string) => { schedulers.add(id); }) };
    const reconciler = new Mvp2ScheduleReconciliationService(queue as never, queue as never, queue as never, queue as never, queue as never, queue as never, queue as never, queue as never);
    await reconciler.reconcile();
    const target = MVP2_REPEATABLE_SCHEDULES.auditChainVerify.id;
    expect(schedulers.has(target)).toBe(true);
    schedulers.delete(target); // Redis scheduler key deleted outside the application.
    await reconciler.reconcile();
    expect(schedulers.has(target)).toBe(true);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(target, { pattern: MVP2_REPEATABLE_SCHEDULES.auditChainVerify.pattern }, expect.objectContaining({ name: MVP2_REPEATABLE_SCHEDULES.auditChainVerify.name }));
  });
});
