import { Injectable, Logger } from "@nestjs/common";
import { SdfAssessmentKind } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext, type TenantStore } from "../../common/tenant/tenant-context";
import { ComplianceService, addByDeadlineUnit } from "../compliance/compliance.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SDF_CYCLE_APPLIES_TO } from "./sdf-assessment.service";

/** `TenantContext.actorLabel` for every write this scan makes -- same
 * convention as `RETENTION_SCAN_ACTOR_LABEL`. */
const SDF_CYCLE_SCAN_ACTOR_LABEL = "sdf-cycle-scan";

/** `SdfAssessment.conductedBy`'s placeholder for an auto-opened row --
 * kept in sync with `SdfAssessmentService`'s own constant rather than
 * imported, since importing it would be a private implementation detail
 * reaching across a file boundary for a one-line literal; both are
 * documented as "must stay empty-string, not null" for the same reason
 * (SD-02's independence check on AUDIT rows). */
const CONDUCTOR_UNASSIGNED = "";

const ASSESSMENT_KINDS: readonly SdfAssessmentKind[] = [
  SdfAssessmentKind.DPIA,
  SdfAssessmentKind.AUDIT,
];

export interface SdfCycleScanSummary {
  cyclesOpened: number;
  warningsSent: number;
}

/**
 * The `sdf-cycle-scan` job's domain logic (spec line 587, daily 02:00 --
 * SD-03): "opens the next cycle and warns as due dates approach." Kept
 * separate from `src/queues/sdf-cycle-scan.processor.ts`'s `WorkerHost`
 * so an e2e test can call `runForCurrentOrganization()` directly against
 * a tenant context it controls, same split `RetentionScanService`
 * documents for its own processor.
 */
@Injectable()
export class SdfCycleScanService {
  private readonly logger = new Logger(SdfCycleScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly complianceService: ComplianceService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async runForAllOrganizations(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({
      where: { isSignificantDataFiduciary: true, sdfNotifiedAt: { not: null } },
      select: { id: true },
    });
    for (const org of orgs) {
      const store: TenantStore = {
        organizationId: org.id,
        actorType: "SYSTEM",
        actorId: null,
        actorLabel: SDF_CYCLE_SCAN_ACTOR_LABEL,
      };
      try {
        await TenantContext.run(store, () => this.runForCurrentOrganization());
      } catch (err) {
        this.logger.error(
          `sdf-cycle-scan failed for organization "${org.id}": ` +
            `${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }
  }

  /** Must be called inside a bound `TenantContext` (see class doc comment). */
  async runForCurrentOrganization(): Promise<SdfCycleScanSummary> {
    const now = new Date();
    const org = await this.prisma.scoped.organization.findFirstOrThrow({
      select: { isSignificantDataFiduciary: true, sdfNotifiedAt: true },
    });
    if (!org.isSignificantDataFiduciary || !org.sdfNotifiedAt) {
      return { cyclesOpened: 0, warningsSent: 0 };
    }

    const rule = await this.complianceService.resolveRule(SDF_CYCLE_APPLIES_TO, now);
    if (!rule) {
      // No SDF_ASSESSMENT_CYCLE rule configured -- nothing to open or
      // warn against. Same "null means skip, never fall back to a
      // literal" discipline as ComplianceService.resolveRule's contract.
      return { cyclesOpened: 0, warningsSent: 0 };
    }

    // Walk cycle boundaries forward from sdfNotifiedAt until the NEXT
    // boundary would be in the future -- `cycleStart` lands on the most
    // recent boundary at or before `now`, i.e. the currently-open cycle.
    let cycleStart = org.sdfNotifiedAt;
    for (;;) {
      const nextBoundary = addByDeadlineUnit(cycleStart, rule.deadlineValue, rule.deadlineUnit);
      if (nextBoundary > now) {
        break;
      }
      cycleStart = nextBoundary;
    }
    const { dueAt, warningAt } = this.complianceService.computeDeadline(rule, cycleStart);

    let cyclesOpened = 0;
    for (const kind of ASSESSMENT_KINDS) {
      const existing = await this.prisma.scoped.sdfAssessment.findFirst({
        where: { kind, cycleStartedAt: cycleStart },
        select: { id: true },
      });
      if (existing) {
        continue;
      }
      await this.prisma.scoped.sdfAssessment.create({
        data: {
          kind,
          cycleStartedAt: cycleStart,
          dueAt,
          conductedBy: CONDUCTOR_UNASSIGNED,
          isIndependent: false,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime.
        } as never,
      });
      cyclesOpened += 1;
    }

    const warningsSent = await this.sendWarningsIfDue(cycleStart, dueAt, warningAt, now);

    return { cyclesOpened, warningsSent };
  }

  /**
   * Warns once the current cycle's `warningAt` has arrived (and it is
   * not yet past `dueAt`) for every still-open assessment row in this
   * cycle. There is no `assignee`/employee field on `SdfAssessment`
   * itself, so -- lacking a spec-named recipient for this warning --
   * this notifies every employee whose role holds `CAN_MANAGE_SDF`, the
   * same permission that gates this pack's own routes (documented design
   * choice; see task-13-report.md "Concerns").
   */
  private async sendWarningsIfDue(
    cycleStart: Date,
    dueAt: Date,
    warningAt: Date,
    now: Date,
  ): Promise<number> {
    if (now < warningAt || now >= dueAt) {
      return 0;
    }

    const openRows = await this.prisma.scoped.sdfAssessment.findMany({
      where: { cycleStartedAt: cycleStart, completedAt: null },
      select: { id: true, kind: true },
    });
    if (openRows.length === 0) {
      return 0;
    }

    const managers = await this.findSdfManagerEmployeeIds();
    if (managers.length === 0) {
      return 0;
    }

    let sent = 0;
    for (const employeeId of managers) {
      await this.notificationsService.send({
        audience: "EMPLOYEE",
        employeeId,
        title: "SDF assessment cycle due soon",
        body:
          `${openRows.map((r) => r.kind).join(" and ")} for the cycle starting ` +
          `${cycleStart.toISOString().slice(0, 10)} ${
            dueAt < now ? "is overdue" : `is due ${dueAt.toISOString().slice(0, 10)}`
          }.`,
        severity: "WARNING",
        linkPath: "/sdf",
      });
      sent += 1;
    }
    return sent;
  }

  private async findSdfManagerEmployeeIds(): Promise<string[]> {
    const { organizationId } = TenantContext.get();
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        role: { permissions: { some: { permissionCode: "CAN_MANAGE_SDF" } } },
      },
      select: { id: true },
    });
    return employees.map((e) => e.id);
  }
}
