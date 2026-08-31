import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { ComplianceService } from "./compliance.service";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { AuditService } from "../../common/audit/audit.service";
import type { ComplianceRule } from "@prisma/client";

/**
 * Unit tests written BEFORE anything (Task 6/9/13/14) consumes this
 * service, per spec line 928 -- exactly the purposes.service.spec.ts
 * pattern: `prisma.scoped` mocked with `jest.fn()`s, no HTTP layer, no
 * real database.
 */
function buildService() {
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const organizationFindFirstOrThrow = jest.fn();
  const transaction = jest.fn();
  const record = jest.fn();
  const txComplianceRule = {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  };

  const prisma = {
    scoped: {
      complianceRule: { findFirst, findMany },
      organization: { findFirstOrThrow: organizationFindFirstOrThrow },
      $transaction: transaction,
    },
  } as unknown as PrismaService;

  const auditService = { record } as unknown as AuditService;

  transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ complianceRule: txComplianceRule }),
  );

  return {
    service: new ComplianceService(prisma, auditService),
    findFirst,
    findMany,
    organizationFindFirstOrThrow,
    transaction,
    record,
    txComplianceRule,
  };
}

function buildRule(overrides: Partial<ComplianceRule> = {}): ComplianceRule {
  return {
    id: "rule-1",
    organizationId: "org-1",
    ruleCode: "REQUEST_ACCESS",
    version: 1,
    name: "Access request response",
    jurisdiction: "IN",
    legalSource: "Company service level",
    basis: "ORG_POLICY",
    appliesTo: "REQUEST:ACCESS",
    deadlineValue: 30,
    deadlineUnit: "DAYS",
    warningLead: 7,
    escalateOnBreach: false,
    publishedPeriodText: null,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveUntil: null,
    enabled: true,
    reviewedByEmployeeId: null,
    reviewedAt: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as ComplianceRule;
}

describe("ComplianceService.resolveRule()", () => {
  it("returns null when no rule matches appliesTo (Check: no-match never falls back to a number)", async () => {
    const { service, findMany } = buildService();
    findMany.mockResolvedValue([]);

    const result = await service.resolveRule("REQUEST:UNKNOWN", new Date());

    expect(result).toBeNull();
  });

  it("Check 25: RETENTION_INACTIVITY resolves null when thirdScheduleClass is NONE, and resolves when it is set", async () => {
    const { service, findMany, organizationFindFirstOrThrow } = buildService();
    const retentionRule = buildRule({
      id: "rule-retention",
      ruleCode: "RETENTION_INACTIVITY",
      appliesTo: "RETENTION:INACTIVITY",
      deadlineValue: 3,
      deadlineUnit: "YEARS",
      warningLead: 30,
      basis: "STATUTORY",
      enabled: false,
    });
    findMany.mockResolvedValue([retentionRule]);

    organizationFindFirstOrThrow.mockResolvedValueOnce({
      thirdScheduleClass: "NONE",
    });
    const whenNone = await service.resolveRule("RETENTION:INACTIVITY", new Date());
    expect(whenNone).toBeNull();

    organizationFindFirstOrThrow.mockResolvedValueOnce({
      thirdScheduleClass: "ECOMMERCE",
    });
    const whenSet = await service.resolveRule("RETENTION:INACTIVITY", new Date());
    expect(whenSet).toEqual(retentionRule);
  });

  it("does not consult Organization.thirdScheduleClass for a non-retention lookup key", async () => {
    const { service, findMany, organizationFindFirstOrThrow } = buildService();
    findMany.mockResolvedValue([buildRule()]);

    const result = await service.resolveRule("REQUEST:ACCESS", new Date());

    expect(result).not.toBeNull();
    expect(organizationFindFirstOrThrow).not.toHaveBeenCalled();
  });
});

describe("ComplianceService.computeDeadline() - calendar arithmetic via date-fns, never millisecond math", () => {
  /**
   * Jest workers resolve their ICU/ Date timezone once at worker startup
   * and ignore a later `process.env.TZ = ...` write from inside a test
   * (verified: a `beforeAll` mutation here left `new Date(...).getHours()`
   * unaffected). The only reliable way to exercise a genuine DST
   * boundary is a fresh child process that has `TZ` set in its OS
   * environment *before* Node starts. `ts-node/register/transpile-only`
   * lets that child `require()` this project's own `.ts` source directly
   * (no build step / dist/ dependency) so this test still exercises the
   * real `addByDeadlineUnit` export, not a reimplementation of it.
   */
  function computeInTimeZone(
    timeZone: string,
    fromArgs: [number, number, number, number, number, number],
    value: number,
    unit: string,
  ): { year: number; month: number; date: number; hours: number; naiveHours: number } {
    const servicePath = path.join(__dirname, "compliance.service.ts");
    const script = `
      const { addByDeadlineUnit } = require(${JSON.stringify(servicePath)});
      const from = new Date(...${JSON.stringify(fromArgs)});
      const dueAt = addByDeadlineUnit(from, ${value}, ${JSON.stringify(unit)});
      const naive = new Date(from.getTime() + ${value} * 24 * 60 * 60 * 1000);
      process.stdout.write(JSON.stringify({
        year: dueAt.getFullYear(),
        month: dueAt.getMonth(),
        date: dueAt.getDate(),
        hours: dueAt.getHours(),
        naiveHours: naive.getHours(),
      }));
    `;
    const out = execFileSync(
      process.execPath,
      ["-r", "ts-node/register/transpile-only", "-e", script],
      { env: { ...process.env, TZ: timeZone }, encoding: "utf8" },
    );
    return JSON.parse(out);
  }

  it("a 1-day deadline across a DST boundary keeps the same local wall-clock time next day", () => {
    // 2027-03-14 is when US Eastern clocks spring forward (2am -> 3am).
    const result = computeInTimeZone(
      "America/New_York",
      [2027, 2, 13, 10, 0, 0],
      1,
      "DAYS",
    );

    expect(result.year).toBe(2027);
    expect(result.month).toBe(2);
    expect(result.date).toBe(14);
    expect(result.hours).toBe(10);

    // Naive millisecond arithmetic (the thing this method must NOT do),
    // computed in the SAME child / same TZ, drifts by the DST-lost hour
    // and does NOT preserve 10:00 local -- demonstrating why addDays
    // (calendar time) is required here.
    expect(result.naiveHours).not.toBe(10);
  }, 20000);

  it("a 3-month deadline from 30 November lands on the last day of February (leap year clipping)", () => {
    const { service } = buildService();
    const from = new Date(2027, 10, 30, 9, 0, 0); // 30 November 2027
    const rule = { deadlineValue: 3, deadlineUnit: "MONTHS", warningLead: 0 } as const;

    const { dueAt } = service.computeDeadline(rule, from);

    expect(dueAt.getFullYear()).toBe(2028); // 2028 is a leap year
    expect(dueAt.getMonth()).toBe(1); // February
    expect(dueAt.getDate()).toBe(29);
  });

  it("warningLead is in hours for an HOURS-unit rule", () => {
    const { service } = buildService();
    const from = new Date(2026, 5, 1, 8, 0, 0);
    const rule = { deadlineValue: 24, deadlineUnit: "HOURS", warningLead: 6 } as const;

    const { dueAt, warningAt } = service.computeDeadline(rule, from);

    expect(dueAt.getTime() - warningAt.getTime()).toBe(6 * 60 * 60 * 1000);
  });

  it("warningLead is in days for a YEARS-unit rule (RETENTION_INACTIVITY's 'warn 30 days')", () => {
    const { service } = buildService();
    const from = new Date(2026, 0, 1, 0, 0, 0);
    const rule = { deadlineValue: 3, deadlineUnit: "YEARS", warningLead: 30 } as const;

    const { dueAt, warningAt } = service.computeDeadline(rule, from);

    expect(dueAt.getTime() - warningAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("ComplianceService.snapshotOnto()", () => {
  it("writes the generic snapshot keys onto the given entity", () => {
    const { service } = buildService();
    const rule = buildRule();
    const dueAt = new Date("2026-02-01T00:00:00Z");
    const warningAt = new Date("2026-01-25T00:00:00Z");

    const entity: Record<string, unknown> = {};
    service.snapshotOnto(entity, rule, dueAt, warningAt);

    expect(entity).toEqual({
      ruleId: rule.id,
      ruleCode: rule.ruleCode,
      ruleVersion: rule.version,
      ruleBasis: rule.basis,
      legalSource: rule.legalSource,
      dueAt,
      warningAt,
    });
  });
});

describe("ComplianceService.update() - versioning (Check 2)", () => {
  it("creates version N+1 without ever calling UPDATE on the row in use, and an earlier snapshot is unaffected", async () => {
    const { service, findFirst, transaction, txComplianceRule } = buildService();

    const v1 = buildRule({
      id: "rule-1",
      version: 1,
      legalSource: "v1 legal source",
      deadlineValue: 30,
    });

    // A caller (e.g. Task 6) snapshots version 1 onto its own entity
    // BEFORE the edit happens.
    const existingSnapshot: Record<string, unknown> = {};
    service.snapshotOnto(existingSnapshot, v1, new Date("2026-01-31T00:00:00Z"), new Date(
      "2026-01-24T00:00:00Z",
    ));
    expect(existingSnapshot["ruleVersion"]).toBe(1);
    expect(existingSnapshot["legalSource"]).toBe("v1 legal source");

    // findFirst is called twice by update(): once to load the target row,
    // once to confirm it is the current (latest) version for its ruleCode.
    findFirst.mockResolvedValueOnce(v1).mockResolvedValueOnce(v1);

    const v2 = buildRule({
      id: "rule-2",
      version: 2,
      legalSource: "v2 legal source",
      deadlineValue: 45,
    });
    txComplianceRule.create.mockResolvedValue(v2);

    const updated = await service.update("rule-1", {
      legalSource: "v2 legal source",
      deadlineValue: 45,
    });

    expect(updated.version).toBe(2);
    expect(updated.legalSource).toBe("v2 legal source");

    // The row actually in use (v1) was never mutated -- update() issues
    // no `complianceRule.update` call anywhere.
    expect(txComplianceRule.update).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);

    // create() was called with version: target.version + 1, ruleCode
    // unchanged, and the new row starts unreviewed.
    expect(txComplianceRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ruleCode: "REQUEST_ACCESS",
          version: 2,
          reviewedByEmployeeId: null,
          reviewedAt: null,
        }),
      }),
    );

    // The snapshot taken before the edit is completely unchanged --
    // update() has no reference to it and nothing about calling
    // update() could have moved it.
    expect(existingSnapshot["ruleVersion"]).toBe(1);
    expect(existingSnapshot["legalSource"]).toBe("v1 legal source");
  });

  it("rejects an edit against a superseded (non-latest) version", async () => {
    const { service, findFirst } = buildService();
    const v1 = buildRule({ id: "rule-1", version: 1 });
    const v2 = buildRule({ id: "rule-2", version: 2 });

    findFirst.mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);

    await expect(service.update("rule-1", { name: "New name" })).rejects.toThrow(
      /not the current version/,
    );
  });
});

describe("ComplianceService - GRIEVANCE_RESPONSE 90-day ceiling (Check 6)", () => {
  it("create() refuses a 120-day GRIEVANCE_RESPONSE deadline with the Rule 14(3) citation", async () => {
    const { service, findFirst } = buildService();
    findFirst.mockResolvedValue(null); // no existing rule with this code

    await expect(
      service.create({
        ruleCode: "GRIEVANCE_RESPONSE",
        name: "Grievance response deadline",
        legalSource: "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
        basis: "STATUTORY",
        appliesTo: "REQUEST:GRIEVANCE",
        deadlineValue: 120,
        deadlineUnit: "DAYS",
        warningLead: 14,
      }),
    ).rejects.toThrow(/Rule 14\(3\)/);
  });

  it("accepts exactly 90 days", async () => {
    const { service, findFirst, txComplianceRule } = buildService();
    findFirst.mockResolvedValue(null);
    txComplianceRule.create.mockResolvedValue(buildRule({ deadlineValue: 90 }));

    await expect(
      service.create({
        ruleCode: "GRIEVANCE_RESPONSE",
        name: "Grievance response deadline",
        legalSource: "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
        basis: "STATUTORY",
        appliesTo: "REQUEST:GRIEVANCE",
        deadlineValue: 90,
        deadlineUnit: "DAYS",
        warningLead: 14,
      }),
    ).resolves.toBeDefined();
  });
});
