import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/shared/Skeleton";

interface StatCardProps {
  /** Short metric name, e.g. "Unique principals". */
  label: string;
  value: number;
  /**
   * The screen that resolves this stat -- every stat on the dashboard
   * links somewhere an employee can act on or investigate it further
   * (task brief: "every stat links to the screen that resolves it").
   */
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** One line of extra context, e.g. what obligation a count relates to. */
  description?: string;
}

/**
 * One tile in the dashboard's metric grid (spec line 849). Never renders a
 * verdict -- only a count, a label and a link to the screen that count
 * came from. No card here claims compliance (global constraint #8).
 */
export function StatCard({ label, value, to, icon: Icon, description }: StatCardProps) {
  return (
    <Link
      to={to}
      className="block rounded-lg outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString("en-IN")}</p>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

/** Skeleton placeholder for a `StatCard`, shown while the summary query is pending. */
export function StatCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-16" />
      </CardContent>
    </Card>
  );
}
