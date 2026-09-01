import { Link } from "react-router-dom";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

interface UnreviewedRuleChipProps {
  isReviewed: boolean;
  className?: string;
}

/**
 * The rule-config counterpart to `fiduciary/components/NotReviewedChip.tsx`
 * (which does the same thing for purposes) -- same convention, deliberately:
 * renders nothing once reviewed, no separate "Reviewed" positive chip to
 * keep in sync, absence of the amber chip IS the reviewed state. Links to
 * `/app/settings/compliance`, where a rule's review state is managed.
 */
export function UnreviewedRuleChip({ isReviewed, className }: UnreviewedRuleChipProps) {
  if (isReviewed) {
    return null;
  }
  return (
    <Link to="/app/settings/compliance">
      <Badge variant="amber" className={cn("whitespace-nowrap", className)}>
        Rule not yet reviewed
      </Badge>
    </Link>
  );
}
