import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { AuditService } from "../src/common/audit/audit.service";
import { TenantContext } from "../src/common/tenant/tenant-context";
import type { TenantStore } from "../src/common/tenant/tenant-context";
import {
  ErasureTaskService,
  type CreateFromTriggerInput,
  type PublicErasureTask,
} from "../src/modules/retention/erasure-task.service";
import {
  RetentionScanService,
  type RetentionScanSummary,
} from "../src/modules/retention/retention-scan.service";
import {
  PreErasureNoticeService,
  type PreErasureNoticeSummary,
} from "../src/modules/retention/pre-erasure-notice.service";
import { PurposeServedService } from "../src/modules/retention/purpose-served.service";
import { addByDeadlineUnit } from "../src/modules/compliance/compliance.service";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  ensurePermission,
  cleanupOrgs,
} from "./support/e2e-harness";

/**
 * Task 9 e2e coverage: erasure tasks, the RE-06/RE-07 one-year floor,
 * legal holds, and the two retention jobs' domain logic.
 *
 * BOOTSTRAP NOTE: uses the real `AppModule` via `test/support/e2e-harness.ts`,
 * same convention as every other MVP 2 spec. `RetentionModule` is
 * registered in `src/app.module.ts` (marked `TEMP-TASK9-VERIFY`, left in
 * place per this task's instructions for the wave integrator to
 * normalise) and now registers its own `retention-scan` /
 * `pre-erasure-notice` BullMQ queues inside `retention.module.ts` itself
 * (a fix to the inherited source -- see that file's doc comment and
 * task-9-report.md).
 *
 * There is no HTTP route to create an `ErasureTask` ad hoc (the spec's
 * four retention routes are `GET tasks`, `POST tasks/:id/complete`,
 * `POST tasks/:id/cancel`, `GET|POST legal-holds` -- creation is always
 * job- or trigger-driven). Tests that need a task therefore call
 * `ErasureTaskService.createFromTrigger` directly, `RetentionScanService`
 * .`runForCurrentOrganization()`/`PreErasureNoticeService`.`runForCurrentOrganization()`
 * are called directly too, the same "plain injectable service the
 * processor delegates to" seam both classes' own doc comments describe
 * (mirrors `requests.e2e-spec.ts` calling `deadlineScanProcessor.runScanCycle`
 * directly instead of waiting on BullMQ's cron). All three run wrapped in
 * `TenantContext.run(...)`, the documented convention for callers outside
 * an HTTP request (`notifications.e2e-spec.ts`'s `sendNotification`, this
 * codebase's own established idiom).
 */
jest.setTimeout(120000);

const TEST_ACTOR_LABEL = "e2e-test-fixture";

describe("Retention: erasure tasks, the floor, legal holds and the retention jobs (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let appPrisma: PrismaService;
  let erasureTaskService: ErasureTaskService;
  let retentionScanService: RetentionScanService;
  let preErasureNoticeService: PreErasureNoticeService;
  let purposeServedService: PurposeServedService;
  let auditService: AuditService;
  const orgIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
    appPrisma = app.get(PrismaService);
    erasureTaskService = app.get(ErasureTaskService);
    retentionScanService = app.get(RetentionScanService);
    preErasureNoticeService = app.get(PreErasureNoticeService);
    purposeServedService = app.get(PurposeServedService);
    auditService = app.get(AuditService);
  });

  afterAll(async () => {
    if (orgIds.length > 0) {
      // MVP 2 shape `cleanupOrgs` does not know about -- delete first, in
      // FK-safe order (ErasureTask/PrincipalAccount both carry an
      // onDelete: Restrict FK to DataPrincipal), before `cleanupOrgs`
      // removes the organizations themselves.
      await prisma.erasureTask.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.purposeServedSignal.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.retentionPolicy.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.processingPurpose.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.legalHold.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.notification.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.principalContactEvent.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.principalAccount.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.complianceRule.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.dataPrincipal.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------
  // Fixture helpers
  // -------------------------------------------------------------------

  /** A bare organization for tests that only need an `organizationId`
   * (no HTTP-authenticated actor). */
  async function createOrg(): Promise<string> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: `Retention Test Org ${organizationId}`,
      },
    });
    orgIds.push(organizationId);
    return organizationId;
  }

  async function createPrincipal(
    organizationId: string,
    overrides: { createdAt?: Date } = {},
  ): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Retention Test Principal",
        ageStatus: "ADULT",
        createdAt: overrides.createdAt,
      },
    });
    return principal.id;
  }

  /** `ComplianceService.resolveRule`'s lookup keys for this module are
   * `RETENTION:INACTIVITY` / `RETENTION:PRE_ERASURE_NOTICE` /
   * `RETENTION:LOG_FLOOR` (transcribed verbatim from
   * `erasure-task.service.ts`'s own top-of-file constants -- they are not
   * exported, so this fixture helper reproduces them by literal, matching
   * the spec's own lookup keys, not the implementation's private names). */
  async function createComplianceRule(
    organizationId: string,
    opts: {
      ruleCode: string;
      appliesTo: string;
      deadlineValue: number;
      deadlineUnit: "HOURS" | "DAYS" | "MONTHS" | "YEARS";
      warningLead?: number;
      effectiveFrom?: Date;
    },
  ) {
    return prisma.complianceRule.create({
      data: {
        organizationId,
        ruleCode: opts.ruleCode,
        version: 1,
        name: opts.ruleCode,
        legalSource: "Test fixture -- not a real citation",
        basis: "ORG_POLICY",
        appliesTo: opts.appliesTo,
        deadlineValue: opts.deadlineValue,
        deadlineUnit: opts.deadlineUnit,
        warningLead: opts.warningLead ?? 0,
        effectiveFrom: opts.effectiveFrom ?? new Date(Date.now() - 60_000),
      },
    });
  }

  function systemActorStore(organizationId: string): TenantStore {
    return {
      organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: TEST_ACTOR_LABEL,
    };
  }

  /** Calls the published `ErasureTaskService.createFromTrigger(tx, input)`
   * seam exactly the way `RetentionScanService`/Wave 3's consent-withdrawal
   * handler are documented to: opened from the caller's own
   * `prisma.scoped.$transaction`, inside a bound `TenantContext`. */
  async function createTask(
    organizationId: string,
    input: CreateFromTriggerInput,
  ): Promise<PublicErasureTask> {
    return TenantContext.run(systemActorStore(organizationId), () =>
      appPrisma.scoped.$transaction((tx) =>
        erasureTaskService.createFromTrigger(tx, input),
      ),
    );
  }

  async function runRetentionScan(
    organizationId: string,
  ): Promise<RetentionScanSummary> {
    return TenantContext.run(systemActorStore(organizationId), () =>
      retentionScanService.runForCurrentOrganization(),
    );
  }

  async function runPreErasureNotice(
    organizationId: string,
  ): Promise<PreErasureNoticeSummary> {
    return TenantContext.run(systemActorStore(organizationId), () =>
      preErasureNoticeService.runForCurrentOrganization(),
    );
  }

  /** Adds a second employee (own role/permission set) to an EXISTING
   * organization -- `createOrgWithEmployee` always mints a fresh org, but
   * the permission-boundary check below needs two differently-permissioned
   * actors inside the SAME tenant so both can reach the same task. Same
   * shape as `registers.e2e-spec.ts`'s local `createEmployeeWithPermissions`. */
  async function createEmployeeWithPermissions(
    organizationId: string,
    permissionCodes: readonly string[],
  ): Promise<{ email: string; accessToken: string }> {
    for (const code of permissionCodes) {
      // eslint-disable-next-line no-await-in-loop
      await ensurePermission(prisma, code);
    }
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: `ROLE_${randomUUID()}`,
        name: "Test Role",
        isSystem: false,
        permissions: {
          create: permissionCodes.map((permissionCode) => ({ permissionCode })),
        },
      },
    });
    const email = `${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: "Test Employee",
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
    return { email, accessToken: loginRes.body.accessToken as string };
  }

  function authed(token: string) {
    return {
      get: (path: string) =>
        request(app.getHttpServer())
          .get(path)
          .set("Authorization", `Bearer ${token}`),
      post: (path: string, body?: object) =>
        request(app.getHttpServer())
          .post(path)
          .set("Authorization", `Bearer ${token}`)
          .send(body ?? {}),
    };
  }

  // -------------------------------------------------------------------
  // Check 22 -- the single most dangerous bug in this module (spec line 720)
  // -------------------------------------------------------------------

  describe("Check 22: an erasure can never cross the retention floor (RE-06/RE-07)", () => {
    it("a CONSENT_WITHDRAWN task for data processed two weeks ago lands DEFERRED_RETENTION_FLOOR carrying its release date", async () => {
      const organizationId = await createOrg();
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const dataPrincipalId = await createPrincipal(organizationId, {
        createdAt: twoWeeksAgo,
      });

      // RE-06/RE-07: the one-year floor, resolved from ComplianceService,
      // never a literal. `resolveLastProcessingAt` falls back to
      // `DataPrincipal.createdAt` when the principal has no
      // `PrincipalDataField` rows yet -- which is the case here.
      await createComplianceRule(organizationId, {
        ruleCode: "RETENTION_LOG_FLOOR",
        appliesTo: "RETENTION:LOG_FLOOR",
        deadlineValue: 1,
        deadlineUnit: "YEARS",
        warningLead: 30,
      });

      const task = await createTask(organizationId, {
        trigger: "CONSENT_WITHDRAWN",
        dataPrincipalId,
      });

      expect(task.state).toBe("DEFERRED_RETENTION_FLOOR");
      expect(task.retentionFloorUntil).not.toBeNull();
      // erasureDueAt is bumped UP to the release date itself -- it IS the
      // date the UI shows, never left at the value that would violate the
      // floor.
      expect((task.erasureDueAt as Date).toISOString()).toBe(
        (task.retentionFloorUntil as Date).toISOString(),
      );
      const expectedFloor = addByDeadlineUnit(twoWeeksAgo, 1, "YEARS");
      expect((task.retentionFloorUntil as Date).toISOString()).toBe(
        expectedFloor.toISOString(),
      );
    });

    it("a direct SQL UPDATE setting erasureDueAt inside the floor is refused by erasure_respects_floor", async () => {
      const organizationId = await createOrg();
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const dataPrincipalId = await createPrincipal(organizationId, {
        createdAt: twoWeeksAgo,
      });
      await createComplianceRule(organizationId, {
        ruleCode: "RETENTION_LOG_FLOOR",
        appliesTo: "RETENTION:LOG_FLOOR",
        deadlineValue: 1,
        deadlineUnit: "YEARS",
        warningLead: 30,
      });
      const task = await createTask(organizationId, {
        trigger: "CONSENT_WITHDRAWN",
        dataPrincipalId,
      });
      expect(task.state).toBe("DEFERRED_RETENTION_FLOOR");

      // Tomorrow -- well inside the ~1-year floor this task's
      // retentionFloorUntil carries. The application-level guard
      // (`ErasureTaskService.complete`) is a SEPARATE protection; this
      // proves the database-level CHECK constraint refuses the write on
      // its own, independent of any application code path.
      const insideFloor = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await expect(
        prisma.$executeRaw`UPDATE "ErasureTask" SET "erasureDueAt" = ${insideFloor} WHERE id = ${task.id}`,
      ).rejects.toThrow(/erasure_respects_floor/);
    });
  });

  // -------------------------------------------------------------------
  // Check 23 -- pre-erasure notice, RE-05 / Rule 8(2)
  // -------------------------------------------------------------------

  describe("Check 23: the pre-erasure notice fires at the rule's lead time, names the three Rule 8(2) conditions, and a principal login cancels the task", () => {
    it("resolves the lead time from ComplianceService (not a hard-coded 48), sends a notice naming all three conditions, and a real portal login cancels the task with the reason recorded and lastPrincipalContactAt updated", async () => {
      const organizationId = await createOrg();
      const dataPrincipalId = await createPrincipal(organizationId);

      // A deliberately NON-48 lead time -- proves preErasureNoticeDueAt is
      // driven by this rule's own deadlineValue/deadlineUnit, not the
      // literal 48 that happens to be RetentionPolicy.preErasureNoticeHours'
      // column default (a different, unrelated field this code path never
      // reads).
      await createComplianceRule(organizationId, {
        ruleCode: "RETENTION_PRE_ERASURE_NOTICE",
        appliesTo: "RETENTION:PRE_ERASURE_NOTICE",
        deadlineValue: 5,
        deadlineUnit: "DAYS",
      });
      // No RETENTION:LOG_FLOOR rule in this organization -- the floor
      // resolves null, so nothing defers this task; it stays EVALUATED
      // and a preErasureNoticeDueAt is actually computed.

      const task = await createTask(organizationId, {
        trigger: "CONSENT_WITHDRAWN",
        dataPrincipalId,
      });
      expect(task.state).toBe("EVALUATED");
      expect(task.erasureDueAt).not.toBeNull();
      expect(task.preErasureNoticeDueAt).not.toBeNull();

      const expectedNoticeDueAt = addByDeadlineUnit(
        task.erasureDueAt as Date,
        -5,
        "DAYS",
      );
      expect((task.preErasureNoticeDueAt as Date).toISOString()).toBe(
        expectedNoticeDueAt.toISOString(),
      );
      // erasureDueAt is effectively "now" (CONSENT_WITHDRAWN, no
      // retentionPolicyId => immediate), so preErasureNoticeDueAt (5 days
      // earlier) is already in the past -- the job picks it up on the
      // very next run, no need to fabricate elapsed time.
      expect((task.preErasureNoticeDueAt as Date).getTime()).toBeLessThan(
        Date.now(),
      );

      const summary1 = await runPreErasureNotice(organizationId);
      expect(summary1.noticesSent).toBe(1);
      // A retry/racing worker sees the CAS precondition no longer true and
      // neither sends a duplicate portal notice nor appends another audit.
      const retry = await runPreErasureNotice(organizationId);
      expect(retry.noticesSent).toBe(0);
      const noticeAudits = await prisma.auditEvent.count({
        where: {
          organizationId,
          resourceId: task.id,
          action: "ERASURE_TASK_PRE_ERASURE_NOTICE_SENT",
        },
      });
      expect(noticeAudits).toBe(1);

      const notification = await prisma.notification.findFirst({
        where: { organizationId, dataPrincipalId, audience: "PRINCIPAL" },
        orderBy: { createdAt: "desc" },
      });
      expect(notification).not.toBeNull();
      expect(notification?.body).toContain("Rule 8(2)");
      // The exact three Rule 8(2) conditions, not a paraphrase.
      expect(notification?.body).toContain("logging into your account");
      expect(notification?.body).toContain("contacting us for the purpose");
      expect(notification?.body).toContain("exercising your rights");

      const afterNotice = await prisma.erasureTask.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(afterNotice.state).toBe("NOTICE_SENT");
      expect(afterNotice.preErasureNoticeSentAt).not.toBeNull();

      // One of the three Rule 8(2) ways to stop erasure: logging into her
      // account -- exercised for real through the actual portal login
      // endpoint (principal-auth.service.ts writes the INBOUND
      // PrincipalContactEvent this depends on).
      const password = "CorrectHorseBattery9!";
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });
      const email = `principal-${randomUUID()}@example.com`;
      await prisma.principalAccount.create({
        data: {
          organizationId,
          dataPrincipalId,
          email,
          passwordHash,
          status: "ACTIVE",
        },
      });

      const beforeLogin = await prisma.dataPrincipal.findUniqueOrThrow({
        where: { id: dataPrincipalId },
      });
      expect(beforeLogin.lastPrincipalContactAt).toBeNull();

      const loginRes = await request(app.getHttpServer())
        .post("/api/auth/principal/login")
        .send({ email, password });
      expect(loginRes.status).toBe(200);

      const summary2 = await runPreErasureNotice(organizationId);
      expect(summary2.tasksCancelled).toBe(1);

      const cancelled = await prisma.erasureTask.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(cancelled.state).toBe("CANCELLED");
      expect(cancelled.cancelledReason).toContain("Rule 8(2)");
      expect(cancelled.cancelledReason).toContain("PORTAL_LOGIN");

      const principalAfterLogin = await prisma.dataPrincipal.findUniqueOrThrow({
        where: { id: dataPrincipalId },
      });
      expect(principalAfterLogin.lastPrincipalContactAt).not.toBeNull();
    });

    it("rolls back the portal notification and task transition if their audit append fails", async () => {
      const organizationId = await createOrg();
      const dataPrincipalId = await createPrincipal(organizationId);
      await createComplianceRule(organizationId, {
        ruleCode: "RETENTION_PRE_ERASURE_NOTICE_AUDIT_ROLLBACK",
        appliesTo: "RETENTION:PRE_ERASURE_NOTICE",
        deadlineValue: 5,
        deadlineUnit: "DAYS",
      });
      const task = await createTask(organizationId, {
        trigger: "CONSENT_WITHDRAWN",
        dataPrincipalId,
      });

      const originalRecord = auditService.record.bind(auditService);
      const auditSpy = jest
        .spyOn(auditService, "record")
        .mockImplementation(async (tx, input) => {
          if (input.action === "ERASURE_TASK_PRE_ERASURE_NOTICE_SENT") {
            throw new Error("intentional pre-erasure audit failure");
          }
          return originalRecord(tx, input);
        });
      try {
        await expect(runPreErasureNotice(organizationId)).rejects.toThrow(
          "intentional pre-erasure audit failure",
        );
      } finally {
        auditSpy.mockRestore();
      }

      const taskAfter = await prisma.erasureTask.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(taskAfter.state).toBe("EVALUATED");
      expect(taskAfter.preErasureNoticeSentAt).toBeNull();
      expect(
        await prisma.notification.count({
          where: {
            organizationId,
            dataPrincipalId,
            title: "Your data is scheduled for erasure",
          },
        }),
      ).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Check 24 -- GO-09: inactivity counts INBOUND contact only
  // -------------------------------------------------------------------

  describe("Check 24: an outbound campaign leaves lastPrincipalContactAt unchanged and the inactivity clock still running", () => {
    it("an OUTBOUND PrincipalContactEvent does not update lastPrincipalContactAt and does not stop an overdue INACTIVITY task from being created", async () => {
      const organizationId = await createOrg();
      await prisma.organization.update({
        where: { id: organizationId },
        data: { thirdScheduleClass: "ECOMMERCE" },
      });
      await createComplianceRule(organizationId, {
        ruleCode: "RETENTION_INACTIVITY_24",
        appliesTo: "RETENTION:INACTIVITY",
        deadlineValue: 90,
        deadlineUnit: "DAYS",
        warningLead: 7,
      });

      // Past the 90-day threshold, and never contacted the company.
      const longAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const dataPrincipalId = await createPrincipal(organizationId, {
        createdAt: longAgo,
      });

      // Simulate an outbound campaign send: an OUTBOUND
      // PrincipalContactEvent, recent, with no prior INBOUND contact at
      // all -- a company reaching out is not the principal approaching
      // the company (GO-09).
      await prisma.principalContactEvent.create({
        data: {
          organizationId,
          dataPrincipalId,
          direction: "OUTBOUND",
          channel: "CAMPAIGN_OUT",
        },
      });

      const principalAfterOutbound =
        await prisma.dataPrincipal.findUniqueOrThrow({
          where: { id: dataPrincipalId },
        });
      expect(principalAfterOutbound.lastPrincipalContactAt).toBeNull();

      const summary = await runRetentionScan(organizationId);
      expect(summary.inactivityTasksCreated).toBe(1);

      // Had the OUTBOUND event counted as contact, the inactivity clock
      // would have reset to "recent" and dueAt would land 90 days in the
      // FUTURE -- no task would exist yet. One exists, so the clock is
      // still running off the true (never-contacted) history.
      const created = await prisma.erasureTask.findFirst({
        where: { organizationId, dataPrincipalId, trigger: "INACTIVITY" },
      });
      expect(created).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Check 25 (retention half) -- RE-03: the Third Schedule gate
  // -------------------------------------------------------------------

  describe("Check 25 (retention half): RETENTION:INACTIVITY resolves null unless thirdScheduleClass is set", () => {
    it("no inactivity task is created while thirdScheduleClass=NONE; one appears after setting it to ECOMMERCE", async () => {
      const organizationId = await createOrg();
      // thirdScheduleClass defaults to NONE (schema default) -- left
      // untouched for the "before" half. That gate lives inside
      // `ComplianceService.resolveRule` itself (Wave 1); this test
      // verifies the observed behaviour, it does not reimplement the gate.
      await createComplianceRule(organizationId, {
        ruleCode: "RETENTION_INACTIVITY_25",
        appliesTo: "RETENTION:INACTIVITY",
        deadlineValue: 30,
        deadlineUnit: "DAYS",
        warningLead: 7,
      });

      const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const dataPrincipalId = await createPrincipal(organizationId, {
        createdAt: longAgo,
      });

      const before = await runRetentionScan(organizationId);
      expect(before.inactivityTasksCreated).toBe(0);
      const noneYet = await prisma.erasureTask.findFirst({
        where: { organizationId, dataPrincipalId, trigger: "INACTIVITY" },
      });
      expect(noneYet).toBeNull();

      await prisma.organization.update({
        where: { id: organizationId },
        data: { thirdScheduleClass: "ECOMMERCE" },
      });

      const after = await runRetentionScan(organizationId);
      expect(after.inactivityTasksCreated).toBe(1);
      const created = await prisma.erasureTask.findFirst({
        where: { organizationId, dataPrincipalId, trigger: "INACTIVITY" },
      });
      expect(created).not.toBeNull();
    });
  });

  describe("PURPOSE_SERVED consumes an explicit principal signal exactly once", () => {
    it("uses the business servedAt timestamp and atomically marks the signal scheduled", async () => {
      const organizationId = await createOrg();
      const dataPrincipalId = await createPrincipal(organizationId);
      const purpose = await prisma.processingPurpose.create({
        data: {
          organizationId,
          code: `PURPOSE_${randomUUID()}`,
          name: "Completed order",
          description: "Order fulfilment",
          lawfulBasis: "CONSENT",
          basisJustification: "Test fixture",
          dataCategories: ["IDENTITY"],
        },
      });
      const policy = await prisma.retentionPolicy.create({
        data: {
          organizationId,
          purposeId: purpose.id,
          name: "Completed order retention",
          triggerType: "PURPOSE_SERVED",
          retentionValue: 2,
          retentionUnit: "DAYS",
          legalBasisForRetention: "Test policy",
          legalBasisType: "ORG_POLICY",
        },
      });
      const servedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      const signal = await TenantContext.run(
        systemActorStore(organizationId),
        () =>
          appPrisma.scoped.$transaction((tx) =>
            purposeServedService.record(tx, {
              dataPrincipalId,
              retentionPolicyId: policy.id,
              servedAt,
            }),
          ),
      );
      expect(signal.scheduledAt).toBeNull();
      const first = await runRetentionScan(organizationId);
      expect(first.purposeServedTasksCreated).toBe(1);

      const task = await prisma.erasureTask.findFirstOrThrow({
        where: { organizationId, dataPrincipalId, trigger: "PURPOSE_SERVED" },
      });
      expect(task.erasureDueAt?.toISOString()).toBe(
        addByDeadlineUnit(servedAt, 2, "DAYS").toISOString(),
      );
      const consumed = await prisma.purposeServedSignal.findUniqueOrThrow({
        where: { id: signal.id },
      });
      expect(consumed.scheduledAt).not.toBeNull();

      const second = await runRetentionScan(organizationId);
      expect(second.purposeServedTasksCreated).toBe(0);
      expect(
        await prisma.erasureTask.count({
          where: { organizationId, dataPrincipalId, trigger: "PURPOSE_SERVED" },
        }),
      ).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // Legal holds
  // -------------------------------------------------------------------

  describe("A legal hold moves an open task to ON_LEGAL_HOLD and its citation is retrievable", () => {
    it("POST /api/retention/legal-holds applies immediately to an open task; the citation is visible on the task and on the hold itself", async () => {
      const grantee = await createOrgWithEmployee(
        app,
        prisma,
        "RETENTION_HOLD_MGR",
        ["CAN_MANAGE_RETENTION"],
      );
      orgIds.push(grantee.organizationId);
      const client = authed(grantee.accessToken);
      const dataPrincipalId = await createPrincipal(grantee.organizationId);

      // No RETENTION:LOG_FLOOR rule in this org -- task stays EVALUATED
      // (open) so the hold has something to apply to.
      const task = await createTask(grantee.organizationId, {
        trigger: "CONSENT_WITHDRAWN",
        dataPrincipalId,
      });
      expect(task.state).toBe("EVALUATED");
      // READY_FOR_ERASURE is still an open task: a hold created at this
      // point must take effect immediately, not wait for the nightly scan.
      const readyPrincipalId = await createPrincipal(grantee.organizationId);
      const readyTask = await createTask(grantee.organizationId, {
        trigger: "CONSENT_WITHDRAWN",
        dataPrincipalId: readyPrincipalId,
      });
      await prisma.erasureTask.update({
        where: { id: readyTask.id },
        data: { state: "READY_FOR_ERASURE" },
      });

      const holdRes = await client.post("/api/retention/legal-holds", {
        name: "Board Inquiry Hold",
        reason: "Pending regulatory inquiry",
        legalCitation: "DPB Order No. 2026/TEST-001",
        // Omitted scope -- organization-wide hold, per
        // legal-hold-scope.util.ts's documented interpretation of an
        // empty scope.
      });
      expect(holdRes.status).toBe(201);
      expect(holdRes.body.legalCitation).toBe("DPB Order No. 2026/TEST-001");

      const taskAfter = await prisma.erasureTask.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(taskAfter.state).toBe("ON_LEGAL_HOLD");
      expect(taskAfter.legalHoldId).toBe(holdRes.body.id);
      const readyTaskAfter = await prisma.erasureTask.findUniqueOrThrow({
        where: { id: readyTask.id },
      });
      expect(readyTaskAfter.state).toBe("ON_LEGAL_HOLD");
      expect(
        await prisma.auditEvent.count({
          where: {
            organizationId: grantee.organizationId,
            resourceId: task.id,
            action: "ERASURE_TASK_LEGAL_HOLD_APPLIED",
            metadata: { path: ["source"], equals: "legal-hold-create" },
          },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            organizationId: grantee.organizationId,
            resourceId: readyTask.id,
            action: "ERASURE_TASK_LEGAL_HOLD_APPLIED",
            metadata: { path: ["fromState"], equals: "READY_FOR_ERASURE" },
          },
        }),
      ).toBe(1);

      const listRes = await client.get("/api/retention/legal-holds");
      expect(listRes.status).toBe(200);
      const found = (
        listRes.body as Array<{ id: string; legalCitation: string }>
      ).find((h) => h.id === holdRes.body.id);
      expect(found?.legalCitation).toBe("DPB Order No. 2026/TEST-001");
    });

    it("rejects category-scoped holds explicitly because tasks cannot represent category scope", async () => {
      const grantee = await createOrgWithEmployee(
        app,
        prisma,
        "RETENTION_CATEGORY_SCOPE",
        ["CAN_MANAGE_RETENTION"],
      );
      orgIds.push(grantee.organizationId);
      const response = await authed(grantee.accessToken).post(
        "/api/retention/legal-holds",
        {
          name: "Unsupported category hold",
          reason: "Category support is intentionally not enabled in this model",
          legalCitation: "DPB Test Order",
          scope: { categories: ["HEALTH"] },
        },
      );
      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        "Category-scoped legal holds are not supported",
      );
    });
  });

  // -------------------------------------------------------------------
  // Permission boundary
  // -------------------------------------------------------------------

  describe("Permission boundary: completing a task requires CAN_APPROVE_ERASURE, not CAN_MANAGE_RETENTION", () => {
    it("403s for an actor holding only CAN_MANAGE_RETENTION, with a positive control on the same route and payload", async () => {
      const org = await createOrgWithEmployee(
        app,
        prisma,
        "RETENTION_ONLY_MGR",
        ["CAN_MANAGE_RETENTION"],
      );
      orgIds.push(org.organizationId);
      const approver = await createEmployeeWithPermissions(org.organizationId, [
        "CAN_APPROVE_ERASURE",
      ]);

      const dataPrincipalId = await createPrincipal(org.organizationId);
      // REQUEST trigger, no retentionPolicyId, no RETENTION:LOG_FLOOR
      // rule in this org -- immediate erasureDueAt, state EVALUATED, and
      // (no PrincipalDataField/DataRecipient rows) an empty checklist, so
      // `complete()` has nothing to force a tick on.
      const task = await createTask(org.organizationId, {
        trigger: "REQUEST",
        dataPrincipalId,
      });
      const payload = { systemChecklist: [], processorChecklist: [] };

      // NEGATIVE
      const deniedRes = await request(app.getHttpServer())
        .post(`/api/retention/tasks/${task.id}/complete`)
        .set("Authorization", `Bearer ${org.accessToken}`)
        .send(payload);
      expect(deniedRes.status).toBe(403);
      expect(deniedRes.body.message).toContain(
        "Missing required permission: CAN_APPROVE_ERASURE",
      );

      // POSITIVE CONTROL: identical route and payload, same task, an
      // actor in the SAME organization holding CAN_APPROVE_ERASURE.
      const okRes = await request(app.getHttpServer())
        .post(`/api/retention/tasks/${task.id}/complete`)
        .set("Authorization", `Bearer ${approver.accessToken}`)
        .send(payload);
      expect(okRes.status).toBe(201);
      expect(okRes.body.state).toBe("ERASED");
    });
  });
});
