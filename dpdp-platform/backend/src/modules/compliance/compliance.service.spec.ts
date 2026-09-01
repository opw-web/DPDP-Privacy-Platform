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
  const statutoryBaseline = buildRule({
    id: "grievance-statutory-baseline",
    ruleCode: "GRIEVANCE_STATUTORY_BASELINE",
    deadlineValue: 90,
    deadlineUnit: "DAYS",
    legalSource:
      "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
  });
  findFirst.mockImplementation((args: { where?: { ruleCode?: string } }) => {
    if (args.where?.ruleCode === "GRIEVANCE_STATUTORY_BASELINE") {
      return Promise.resolve(statutoryBaseline);
    }
    return Promise.resolve(null);
  });

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
    const whenNone = await service.resolveRule(
      "RETENTION:INACTIVITY",
      new Date(),
    );
    expect(whenNone).toBeNull();

    organizationFindFirstOrThrow.mockResolvedValueOnce({
      thirdScheduleClass: "ECOMMERCE",
    });
    const whenSet = await service.resolveRule(
      "RETENTION:INACTIVITY",
      new Date(),
    );
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
  ): {
    year: number;
    month: number;
    date: number;
    hours: number;
    naiveHours: number;
  } {
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
    const rule = {
      deadlineValue: 3,
      deadlineUnit: "MONTHS",
      warningLead: 0,
    } as const;

    const { dueAt } = service.computeDeadline(rule, from);

    expect(dueAt.getFullYear()).toBe(2028); // 2028 is a leap year
    expect(dueAt.getMonth()).toBe(1); // February
    expect(dueAt.getDate()).toBe(29);
  });

  it("warningLead is in hours for an HOURS-unit rule", () => {
    const { service } = buildService();
    const from = new Date(2026, 5, 1, 8, 0, 0);
    const rule = {
      deadlineValue: 24,
      deadlineUnit: "HOURS",
      warningLead: 6,
    } as const;

    const { dueAt, warningAt } = service.computeDeadline(rule, from);

    expect(dueAt.getTime() - warningAt.getTime()).toBe(6 * 60 * 60 * 1000);
  });

  it("warningLead is in days for a YEARS-unit rule (RETENTION_INACTIVITY's 'warn 30 days')", () => {
    const { service } = buildService();
    const from = new Date(2026, 0, 1, 0, 0, 0);
    const rule = {
      deadlineValue: 3,
      deadlineUnit: "YEARS",
      warningLead: 30,
    } as const;

    const { dueAt, warningAt } = service.computeDeadline(rule, from);

    expect(dueAt.getTime() - warningAt.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
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
    const { service, findFirst, transaction, txComplianceRule } =
      buildService();

    const v1 = buildRule({
      id: "rule-1",
      version: 1,
      legalSource: "v1 legal source",
      deadlineValue: 30,
    });

    // A caller (e.g. Task 6) snapshots version 1 onto its own entity
    // BEFORE the edit happens.
    const existingSnapshot: Record<string, unknown> = {};
    service.snapshotOnto(
      existingSnapshot,
      v1,
      new Date("2026-01-31T00:00:00Z"),
      new Date("2026-01-24T00:00:00Z"),
    );
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

    await expect(
      service.update("rule-1", { name: "New name" }),
    ).rejects.toThrow(/not the current version/);
  });
});

describe("ComplianceService - GRIEVANCE_RESPONSE 90-day ceiling (Check 6)", () => {
  it("fails closed when the statutory baseline is missing", async () => {
    const { service, findFirst, txComplianceRule } = buildService();
    findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        ruleCode: "GRIEVANCE_RESPONSE",
        name: "Published grievance response period",
        legalSource: "Organization-published grievance response period",
        basis: "ORG_POLICY",
        appliesTo: "REQUEST:GRIEVANCE",
        deadlineValue: 90,
        deadlineUnit: "DAYS",
        warningLead: 14,
      }),
    ).rejects.toThrow(/statutory grievance baseline is unavailable/);
    expect(txComplianceRule.create).not.toHaveBeenCalled();
  });

  it("fails closed when the statutory baseline is disabled", async () => {
    const { service, findFirst, txComplianceRule } = buildService();
    // The production query only selects enabled baselines; a disabled row
    // therefore presents as absent to the enforcement path.
    findFirst.mockImplementation((args: { where?: { ruleCode?: string } }) => {
      if (args.where?.ruleCode === "GRIEVANCE_STATUTORY_BASELINE") {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    await expect(
      service.create({
        ruleCode: "GRIEVANCE_RESPONSE",
        name: "Published grievance response period",
        legalSource: "Organization-published grievance response period",
        basis: "ORG_POLICY",
        appliesTo: "REQUEST:GRIEVANCE",
        deadlineValue: 90,
        deadlineUnit: "DAYS",
        warningLead: 14,
      }),
    ).rejects.toThrow(/statutory grievance baseline is unavailable/);
    expect(txComplianceRule.create).not.toHaveBeenCalled();
  });

  it("refuses public baseline creation, versioning, and review", async () => {
    const { service, findFirst, transaction, txComplianceRule } =
      buildService();
    const baseline = buildRule({
      id: "grievance-statutory-baseline",
      ruleCode: "GRIEVANCE_STATUTORY_BASELINE",
    });

    await expect(
      service.create({
        ruleCode: "GRIEVANCE_STATUTORY_BASELINE",
        name: "Attempted replacement",
        legalSource: "Attempted replacement",
        basis: "STATUTORY",
        appliesTo: "SYSTEM:GRIEVANCE_STATUTORY_BASELINE",
        deadlineValue: 1,
        deadlineUnit: "DAYS",
        warningLead: 0,
      }),
    ).rejects.toThrow(/seed-managed/);

    findFirst.mockResolvedValue(baseline);
    await expect(
      service.update(baseline.id, { deadlineValue: 1 }),
    ).rejects.toThrow(/seed-managed/);
    await expect(
      service.review(baseline.id, { sub: "employee-1" } as never),
    ).rejects.toThrow(/seed-managed/);
    expect(txComplianceRule.create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("create() refuses a 120-day GRIEVANCE_RESPONSE deadline with the Rule 14(3) citation", async () => {
    const { service, findFirst } = buildService();
    await expect(
      service.create({
        ruleCode: "GRIEVANCE_RESPONSE",
        name: "Grievance response deadline",
        legalSource:
          "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
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
    txComplianceRule.create.mockResolvedValue(buildRule({ deadlineValue: 90 }));

    await expect(
      service.create({
        ruleCode: "GRIEVANCE_RESPONSE",
        name: "Grievance response deadline",
        legalSource:
          "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
        basis: "STATUTORY",
        appliesTo: "REQUEST:GRIEVANCE",
        deadlineValue: 90,
        deadlineUnit: "DAYS",
        warningLead: 14,
      }),
    ).resolves.toBeDefined();
  });

  /**
   * Regression coverage for the bug this task fixes: the original
   * `validateGrievanceCeiling` only ever compared `deadlineUnit ===
   * "DAYS"`, so a HOURS/MONTHS/YEARS deadline bypassed Rule 14(3)'s
   * ceiling entirely (e.g. `{deadlineValue: 6, deadlineUnit: "MONTHS"}`,
   * ~180 days, returned 200). Every non-DAYS unit now needs its own
   * passing/failing pair against the worst-case day count
   * (`worstCaseDeadlineDays`: HOURS -> ceil(value/24), MONTHS ->
   * value*31, YEARS -> value*366).
   *
   * `deadlineValue` is `@IsInt() @Min(1)` at the DTO layer, and even the
   * smallest legal YEARS value (1) is already 366 worst-case days --
   * over four times the ceiling. There is therefore no integer YEARS
   * value that could ever pass this check for GRIEVANCE_RESPONSE; the
   * YEARS coverage below is deliberately failing-only, and that is the
   * ceiling working as intended, not a gap in coverage.
   */
  describe("create() - every deadlineUnit is checked, not just DAYS", () => {
    it("HOURS: accepts 2160 hours (exactly 90 days worst-case)", async () => {
      const { service, findFirst, txComplianceRule } = buildService();
      txComplianceRule.create.mockResolvedValue(
        buildRule({ deadlineValue: 2160, deadlineUnit: "HOURS" }),
      );

      await expect(
        service.create({
          ruleCode: "GRIEVANCE_RESPONSE",
          name: "Grievance response deadline",
          legalSource:
            "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
          basis: "STATUTORY",
          appliesTo: "REQUEST:GRIEVANCE",
          deadlineValue: 2160,
          deadlineUnit: "HOURS",
          warningLead: 14,
        }),
      ).resolves.toBeDefined();
    });

    it("HOURS: refuses 2161 hours (91 days worst-case, ceil(2161/24) = 91) with the Rule 14(3) citation", async () => {
      const { service, findFirst } = buildService();
      await expect(
        service.create({
          ruleCode: "GRIEVANCE_RESPONSE",
          name: "Grievance response deadline",
          legalSource:
            "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
          basis: "STATUTORY",
          appliesTo: "REQUEST:GRIEVANCE",
          deadlineValue: 2161,
          deadlineUnit: "HOURS",
          warningLead: 14,
        }),
      ).rejects.toThrow(/Rule 14\(3\)/);
    });

    it("MONTHS: accepts 2 months (62 days worst-case)", async () => {
      const { service, findFirst, txComplianceRule } = buildService();
      txComplianceRule.create.mockResolvedValue(
        buildRule({ deadlineValue: 2, deadlineUnit: "MONTHS" }),
      );

      await expect(
        service.create({
          ruleCode: "GRIEVANCE_RESPONSE",
          name: "Grievance response deadline",
          legalSource:
            "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
          basis: "STATUTORY",
          appliesTo: "REQUEST:GRIEVANCE",
          deadlineValue: 2,
          deadlineUnit: "MONTHS",
          warningLead: 14,
        }),
      ).resolves.toBeDefined();
    });

    it("MONTHS: refuses 3 months (93 days worst-case) with the Rule 14(3) citation -- this is the bug's exact shape (previously only DAYS was checked)", async () => {
      const { service, findFirst } = buildService();
      await expect(
        service.create({
          ruleCode: "GRIEVANCE_RESPONSE",
          name: "Grievance response deadline",
          legalSource:
            "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
          basis: "STATUTORY",
          appliesTo: "REQUEST:GRIEVANCE",
          deadlineValue: 3,
          deadlineUnit: "MONTHS",
          warningLead: 14,
        }),
      ).rejects.toThrow(/Rule 14\(3\)/);
    });

    it("MONTHS: refuses 6 months (186 days worst-case) -- the report's original PoC payload", async () => {
      const { service, findFirst } = buildService();
      await expect(
        service.create({
          ruleCode: "GRIEVANCE_RESPONSE",
          name: "Grievance response deadline",
          legalSource:
            "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
          basis: "STATUTORY",
          appliesTo: "REQUEST:GRIEVANCE",
          deadlineValue: 6,
          deadlineUnit: "MONTHS",
          warningLead: 14,
        }),
      ).rejects.toThrow(/Rule 14\(3\)/);
    });

    it("YEARS: refuses even the smallest legal value, 1 year (366 days worst-case) with the Rule 14(3) citation", async () => {
      const { service, findFirst } = buildService();
      await expect(
        service.create({
          ruleCode: "GRIEVANCE_RESPONSE",
          name: "Grievance response deadline",
          legalSource:
            "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
          basis: "STATUTORY",
          appliesTo: "REQUEST:GRIEVANCE",
          deadlineValue: 1,
          deadlineUnit: "YEARS",
          warningLead: 14,
        }),
      ).rejects.toThrow(/Rule 14\(3\)/);
    });
  });

  describe("update() (PATCH) - the ceiling is re-checked on the effective merged value, for every unit", () => {
    it("MONTHS: PATCHing an existing GRIEVANCE_RESPONSE row to 3 months (93 days worst-case) is refused", async () => {
      const { service, findFirst } = buildService();
      const v1 = buildRule({
        id: "rule-1",
        ruleCode: "GRIEVANCE_RESPONSE",
        version: 1,
        deadlineValue: 60,
        deadlineUnit: "DAYS",
      });
      findFirst.mockResolvedValueOnce(v1).mockResolvedValueOnce(v1);

      await expect(
        service.update("rule-1", { deadlineValue: 3, deadlineUnit: "MONTHS" }),
      ).rejects.toThrow(/Rule 14\(3\)/);
    });

    it("HOURS: PATCHing an existing GRIEVANCE_RESPONSE row to 2161 hours (91 days worst-case) is refused", async () => {
      const { service, findFirst } = buildService();
      const v1 = buildRule({
        id: "rule-1",
        ruleCode: "GRIEVANCE_RESPONSE",
        version: 1,
        deadlineValue: 60,
        deadlineUnit: "DAYS",
      });
      findFirst.mockResolvedValueOnce(v1).mockResolvedValueOnce(v1);

      await expect(
        service.update("rule-1", {
          deadlineValue: 2161,
          deadlineUnit: "HOURS",
        }),
      ).rejects.toThrow(/Rule 14\(3\)/);
    });

    it("YEARS: PATCHing an existing GRIEVANCE_RESPONSE row to 1 year (366 days worst-case) is refused", async () => {
      const { service, findFirst } = buildService();
      const v1 = buildRule({
        id: "rule-1",
        ruleCode: "GRIEVANCE_RESPONSE",
        version: 1,
        deadlineValue: 60,
        deadlineUnit: "DAYS",
      });
      findFirst.mockResolvedValueOnce(v1).mockResolvedValueOnce(v1);

      await expect(
        service.update("rule-1", { deadlineValue: 1, deadlineUnit: "YEARS" }),
      ).rejects.toThrow(/Rule 14\(3\)/);
    });

    it("PATCHing deadlineUnit alone (no deadlineValue in the body) re-checks the ceiling against the merged effective value -- 90 DAYS reinterpreted as 90 MONTHS (2790 days worst-case) is refused", async () => {
      const { service, findFirst } = buildService();
      const v1 = buildRule({
        id: "rule-1",
        ruleCode: "GRIEVANCE_RESPONSE",
        version: 1,
        deadlineValue: 90,
        deadlineUnit: "DAYS",
      });
      findFirst.mockResolvedValueOnce(v1).mockResolvedValueOnce(v1);

      await expect(
        service.update("rule-1", { deadlineUnit: "MONTHS" }),
      ).rejects.toThrow(/Rule 14\(3\)/);
    });

    it("MONTHS: PATCHing an existing GRIEVANCE_RESPONSE row to 2 months (62 days worst-case) is accepted", async () => {
      const { service, findFirst, txComplianceRule } = buildService();
      const v1 = buildRule({
        id: "rule-1",
        ruleCode: "GRIEVANCE_RESPONSE",
        version: 1,
        deadlineValue: 60,
        deadlineUnit: "DAYS",
      });
      findFirst.mockResolvedValueOnce(v1).mockResolvedValueOnce(v1);
      txComplianceRule.create.mockResolvedValue(
        buildRule({
          id: "rule-2",
          ruleCode: "GRIEVANCE_RESPONSE",
          version: 2,
          deadlineValue: 2,
          deadlineUnit: "MONTHS",
        }),
      );

      await expect(
        service.update("rule-1", { deadlineValue: 2, deadlineUnit: "MONTHS" }),
      ).resolves.toBeDefined();
    });
  });

  describe("the ceiling does not apply to non-GRIEVANCE_RESPONSE rule codes", () => {
    it("create(): SDF_ASSESSMENT_CYCLE at 12 MONTHS (372 days worst-case) is accepted -- it is a legitimate non-grievance rule, not subject to Rule 14(3)", async () => {
      const { service, findFirst, txComplianceRule } = buildService();
      txComplianceRule.create.mockResolvedValue(
        buildRule({
          ruleCode: "SDF_ASSESSMENT_CYCLE",
          deadlineValue: 12,
          deadlineUnit: "MONTHS",
        }),
      );

      await expect(
        service.create({
          ruleCode: "SDF_ASSESSMENT_CYCLE",
          name: "SDF assessment cycle",
          legalSource: "Company policy",
          basis: "STATUTORY",
          appliesTo: "SDF:ASSESSMENT",
          deadlineValue: 12,
          deadlineUnit: "MONTHS",
          warningLead: 30,
        }),
      ).resolves.toBeDefined();
    });

    it("update(): PATCHing SDF_ASSESSMENT_CYCLE to 12 MONTHS is accepted", async () => {
      const { service, findFirst, txComplianceRule } = buildService();
      const v1 = buildRule({
        id: "rule-1",
        ruleCode: "SDF_ASSESSMENT_CYCLE",
        version: 1,
        deadlineValue: 6,
        deadlineUnit: "MONTHS",
      });
      findFirst.mockResolvedValueOnce(v1).mockResolvedValueOnce(v1);
      txComplianceRule.create.mockResolvedValue(
        buildRule({
          id: "rule-2",
          ruleCode: "SDF_ASSESSMENT_CYCLE",
          version: 2,
          deadlineValue: 12,
          deadlineUnit: "MONTHS",
        }),
      );

      await expect(
        service.update("rule-1", { deadlineValue: 12, deadlineUnit: "MONTHS" }),
      ).resolves.toBeDefined();
    });
  });
});
