import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/shared/Skeleton";
import { EmptyState } from "../../components/shared/EmptyState";
import { DateTime } from "../../components/shared/DateTime";
import type { RecentAuditEvent } from "../pages/DashboardPage";

interface RecentAuditStripProps {
  events: RecentAuditEvent[] | undefined;
  isLoading: boolean;
}

/**
 * The dashboard's "recent audit strip" (spec line 849) -- the ten most
 * recent `AuditEvent` rows the summary endpoint returns, each read-only
 * and linking to `/app/audit` for the full, filterable log (global
 * constraint #5: everything is auditable, so the landing screen always
 * shows that the trail exists, never a claim about what it proves).
 */
export function RecentAuditStrip({ events, isLoading }: RecentAuditStripProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Recent audit activity</CardTitle>
        <Link to="/app/audit" className="text-xs text-primary hover:underline">
          View full audit log
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2" data-testid="recent-audit-skeleton">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : !events || events.length === 0 ? (
          <EmptyState
            icon={History}
            title="No audit activity yet"
            description="Actions taken in this organization will appear here as they happen."
            action={{ label: "Open audit log", to: "/app/audit" }}
          />
        ) : (
          <ul className="divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                    {event.action}
                  </Badge>
                  <span className="truncate text-muted-foreground">
                    {event.actorLabel}
                    {event.resourceType ? ` – ${event.resourceType}` : ""}
                  </span>
                </div>
                <DateTime value={event.createdAt} className="shrink-0 text-xs text-muted-foreground" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
