import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";

interface NotReviewedChipProps {
  /** `PublicPurpose.isReviewed` -- `reviewedByEmployeeId !== null` (purposes.service.ts). */
  isReviewed: boolean;
  className?: string;
}

/**
 * Spec lines 739-748: "Until `reviewedByEmployeeId` is set, every screen
 * showing that purpose carries an amber 'Not yet reviewed' chip." This is
 * the ONE component that renders it, so that rule holds by construction
 * rather than by every call site remembering to add it: `PurposesPage`'s
 * register row, and every other component in this task that embeds a
 * purpose (`SharingTab`, `RetentionTab`), import and render this rather
 * than rolling their own badge.
 *
 * Renders nothing once reviewed -- there is deliberately no "Reviewed"
 * positive chip here (that would be a second badge to keep in sync); the
 * absence of the amber chip IS the reviewed state.
 */
export function NotReviewedChip({ isReviewed, className }: NotReviewedChipProps) {
  if (isReviewed) {
    return null;
  }
  return (
    <Badge variant="amber" className={cn("whitespace-nowrap", className)}>
      Not yet reviewed
    </Badge>
  );
}
