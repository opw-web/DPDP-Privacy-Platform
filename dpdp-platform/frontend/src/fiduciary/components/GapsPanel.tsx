import { Link } from "react-router-dom";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/shared/Skeleton";
import { EmptyState } from "../../components/shared/EmptyState";
import type { InventoryGap } from "../pages/DashboardPage";

/**
 * The screen where each shortfall in `GET /api/inventory/gaps` actually
 * gets resolved (task brief: "every stat links to the screen that
 * resolves it"). Kept here, not derived from the gap's `code` at render
 * time, so every one of the four codes the backend can ever send has an
 * explicit, reviewable destination.
 */
const GAP_RESOLUTION_LINK: Record<InventoryGap["code"], string> = {
  "CH-01": "/app/principals?ageStatus=UNKNOWN",
  "LB-02": "/app/purposes",
  "GO-02": "/app/registers",
  "GO-03": "/app/principals",
};

interface GapsPanelProps {
  gaps: InventoryGap[] | undefined;
  isLoading: boolean;
}

/**
 * Renders the four evidence-floor shortfalls the backend computes
 * (`InventoryService.getGaps`) verbatim -- each card shows the backend's
 * own `explanation` string, which states what obligation the gap bears on
 * (e.g. unknown age status: "s.9 obligations toward children cannot be
 * evidenced as tracked"). This component adds no compliance language of
 * its own; it never says the organization "is compliant" or congratulates
 * a zero count -- a gap card at count 0 renders the same explanation
 * sentence the backend sends for that count, nothing more (global
 * constraint #8: "supports"/"evidences"/"tracks" only).
 */
export function GapsPanel({ gaps, isLoading }: GapsPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="gaps-panel-skeleton">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!gaps || gaps.length === 0) {
    return (
      <EmptyState
        title="Gap data unavailable"
        description="The compliance-gap counts could not be loaded right now."
        action={{ label: "Reload dashboard", to: "/app" }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {gaps.map((gap) => (
        <Card key={gap.code}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{gap.code}</Badge>
                <p className="text-sm font-medium">{gap.label}</p>
              </div>
              <p className="text-sm text-muted-foreground">{gap.explanation}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
              <p className="text-xl font-semibold tabular-nums">{gap.count}</p>
              <Button asChild size="sm" variant="outline">
                <Link to={GAP_RESOLUTION_LINK[gap.code]}>Review</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
