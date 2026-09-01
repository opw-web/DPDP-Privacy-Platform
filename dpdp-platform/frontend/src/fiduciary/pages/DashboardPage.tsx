import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  Clock3,
  Database,
  Files,
  ScrollText,
  ShieldQuestion,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { employeeApiClient } from "../../lib/api-client";
import { StatCard, StatCardSkeleton } from "../components/StatCard";
import { GapsPanel } from "../components/GapsPanel";
import { ExportButtons } from "../components/ExportButtons";
import { RecentAuditStrip } from "../components/RecentAuditStrip";
import { usePermission } from "../../lib/permissions";

/** Mirrors `RecentAuditEvent` in `inventory.service.ts` exactly, with `createdAt` as the ISO string every JSON response actually carries. */
export interface RecentAuditEvent {
  id: string;
  action: string;
  actorType: string;
  actorLabel: string;
  resourceType: string;
  resourceId: string | null;
  subjectPrincipalId: string | null;
  createdAt: string;
}

/** Mirrors `InventorySummary` in `inventory.service.ts` exactly (`GET /api/inventory/summary`). */
export interface InventorySummary {
  sourceCount: number;
  rawRecordCount: number;
  uniquePrincipalCount: number;
  matchedPrincipalCount: number;
  pendingReviewCount: number;
  conflictCount: number;
  unknownAgeStatusCount: number;
  purposesWithoutReviewedLawfulBasisCount: number;
  processorsWithoutContractCount: number;
  recentAuditEvents: RecentAuditEvent[];
}

/** Mirrors `InventoryGap` in `inventory.service.ts` exactly (`GET /api/inventory/gaps`). */
export interface InventoryGap {
  code: "GO-03" | "CH-01" | "LB-02" | "GO-02";
  label: string;
  count: number;
  explanation: string;
}

interface RequestStats {
  overdueCount: number;
}

interface BreachObligation {
  status: string;
}

interface DashboardBreach {
  obligations?: BreachObligation[];
}

/**
 * `/app` -- the inventory dashboard (spec line 849): the first screen a
 * data fiduciary sees. Shows the nine metrics the spec names explicitly
 * (five inventory counts, four evidence-floor shortfalls) plus the recent
 * audit strip and the two evidence exports.
 *
 * Global constraint #8 ("the platform never concludes"): nothing on this
 * page asserts the organization "is compliant". Every number here is a
 * count fetched from the backend and a link to the screen that resolves
 * it -- never a verdict rendered client side.
 */
export function DashboardPage() {
  const canManageRequests = usePermission("CAN_MANAGE_REQUESTS");
  const canManageBreaches = usePermission("CAN_MANAGE_BREACHES");

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["inventory", "summary"],
    queryFn: () => employeeApiClient.get<InventorySummary>("/inventory/summary"),
  });

  const { data: gaps, isLoading: isGapsLoading } = useQuery({
    queryKey: ["inventory", "gaps"],
    queryFn: () => employeeApiClient.get<InventoryGap[]>("/inventory/gaps"),
  });

  const { data: requestStats, isLoading: isRequestStatsLoading } = useQuery({
    queryKey: ["requests", "stats"],
    queryFn: () => employeeApiClient.get<RequestStats>("/requests/stats"),
    enabled: canManageRequests,
  });

  const { data: breaches, isLoading: isBreachesLoading } = useQuery({
    queryKey: ["breaches"],
    queryFn: () => employeeApiClient.get<DashboardBreach[]>("/breaches"),
    enabled: canManageBreaches,
  });

  const openBreachObligationCount = (breaches ?? []).reduce(
    (count, breach) =>
      count +
      (breach.obligations ?? []).filter(
        (obligation) => !["DONE", "WAIVED"].includes(obligation.status),
      ).length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Inventory dashboard</h1>
          <p className="text-sm text-muted-foreground">
            What this platform has discovered, matched and tracked so far, and what it cannot
            yet evidence.
          </p>
        </div>
        <ExportButtons />
      </div>

      <section aria-label="Inventory metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isSummaryLoading || !summary ? (
          Array.from({ length: 9 }).map((_, index) => <StatCardSkeleton key={index} />)
        ) : (
          <>
            <StatCard label="Connected sources" value={summary.sourceCount} to="/app/data-sources" icon={Database} />
            <StatCard label="Raw records" value={summary.rawRecordCount} to="/app/data-sources" icon={Files} />
            <StatCard label="Unique principals" value={summary.uniquePrincipalCount} to="/app/principals" icon={Users} />
            <StatCard label="Matched principals" value={summary.matchedPrincipalCount} to="/app/principals" icon={UserCheck} />
            <StatCard
              label="Pending review"
              value={summary.pendingReviewCount}
              to="/app/review"
              icon={ClipboardCheck}
            />
            <StatCard
              label="Conflicts (GO-03)"
              value={summary.conflictCount}
              to="/app/principals"
              icon={AlertTriangle}
              description="Principals with a source-conflicting field"
            />
            <StatCard
              label="Unknown age status (CH-01)"
              value={summary.unknownAgeStatusCount}
              to="/app/principals?ageStatus=UNKNOWN"
              icon={ShieldQuestion}
              description="s.9 obligations cannot be evidenced without this"
            />
            {canManageRequests ? (
              <StatCard
                label="Overdue rights requests"
                value={requestStats?.overdueCount ?? 0}
                to="/app/requests?overdue=true"
                icon={Clock3}
                description="Requests flagged overdue by the deadline scanner"
              />
            ) : null}
            {canManageBreaches ? (
              <StatCard
                label="Open breach obligations"
                value={openBreachObligationCount}
                to="/app/breaches"
                icon={ShieldAlert}
                description="Obligations still awaiting completion or waiver"
              />
            ) : null}
            <StatCard
              label="Purposes without reviewed basis (LB-02)"
              value={summary.purposesWithoutReviewedLawfulBasisCount}
              to="/app/purposes"
              icon={ScrollText}
            />
            <StatCard
              label="Processors without a contract (GO-02)"
              value={summary.processorsWithoutContractCount}
              to="/app/registers"
              icon={Boxes}
            />
          </>
        )}
      </section>

      {(canManageRequests || canManageBreaches) && (isRequestStatsLoading || isBreachesLoading) ? (
        <p className="text-xs text-muted-foreground" role="status">
          Loading operational counts…
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-label="Compliance gaps">
          <h2 className="mb-3 text-sm font-semibold">Evidence gaps</h2>
          <GapsPanel gaps={gaps} isLoading={isGapsLoading} />
        </section>

        <section aria-label="Recent audit activity">
          <RecentAuditStrip events={summary?.recentAuditEvents} isLoading={isSummaryLoading} />
        </section>
      </div>
    </div>
  );
}
