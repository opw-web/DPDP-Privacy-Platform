import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";
import { Button } from "../ui/button";

type EmptyStateAction =
  | { label: string; onClick: () => void; to?: undefined }
  | { label: string; to: string; onClick?: undefined };

interface EmptyStateProps {
  /** One line explaining WHY the list is empty -- required (spec line 872: "every empty state has one line of explanation and a next action"). */
  description: string;
  title?: string;
  icon?: ComponentType<{ className?: string }>;
  /**
   * Required, not optional -- the spec rule is "one line of explanation
   * AND a next action", not "...and a next action where one is obvious".
   * If a screen truly has nothing actionable (e.g. a read-only, already-
   * filtered log with zero results), the action is still there: it just
   * points at the filter or the screen that would produce a result
   * ("Clear filters", "Go to Data Sources"), never omitted.
   */
  action: EmptyStateAction;
  children?: ReactNode;
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  icon: Icon = Inbox,
  action,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action.to ? (
        <Button size="sm" asChild>
          <Link to={action.to}>{action.label}</Link>
        </Button>
      ) : (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
