import { useCountdown } from "../../hooks/useCountdown";
import { Badge, type BadgeProps } from "../ui/badge";
import { cn } from "../../lib/utils";
import { formatDeadlineText } from "../../lib/format";

export interface DeadlinePillProps {
  /** UTC ISO instant this deadline is due. */
  dueAt: string;
  /**
   * UTC ISO instant the countdown window started (e.g. the request's
   * creation date, or the start of the applicable statutory window) --
   * used ONLY to compute the fraction-of-window-remaining colour band.
   * The pill's text is always computed from `dueAt` alone via
   * `formatDeadlineText`, independent of this.
   */
  windowStart: string;
  className?: string;
}

type Band = "neutral" | "amber" | "orange" | "overdue";

const BADGE_VARIANT: Record<Band, BadgeProps["variant"]> = {
  neutral: "secondary",
  amber: "amber",
  orange: "orange",
  overdue: "destructive",
};

function bandFor(remainingMs: number, totalWindowMs: number): Band {
  if (remainingMs <= 0) return "overdue";
  if (totalWindowMs <= 0) return "orange"; // degenerate/zero-length window: treat as urgent, never neutral
  const fraction = remainingMs / totalWindowMs;
  if (fraction > 0.5) return "neutral";
  // At exactly 20% the requirement still places the pill in the amber
  // 50–20% band; orange is strictly below 20%.
  if (fraction >= 0.2) return "amber";
  return "orange";
}

/**
 * Colours by FRACTION OF WINDOW REMAINING (spec line 920), not by an
 * absolute day count: `>50%` neutral, `50-20%` amber, `<20%` orange, past
 * due red. The text ("in 43 days" / "3 days overdue") is always rendered
 * alongside the colour -- colour is never the only signal, an
 * accessibility requirement, not a style choice (spec line 920).
 *
 * Ticks live via `useCountdown` (hand-written, no library -- spec line
 * 64), so a mounted pill re-bands and re-labels itself over time without
 * the parent page re-rendering it.
 */
export function DeadlinePill({ dueAt, windowStart, className }: DeadlinePillProps) {
  const { remainingMs } = useCountdown(dueAt);
  const totalWindowMs = new Date(dueAt).getTime() - new Date(windowStart).getTime();
  const band = bandFor(remainingMs, totalWindowMs);
  const text = formatDeadlineText(dueAt);

  return (
    <Badge variant={BADGE_VARIANT[band]} className={cn("whitespace-nowrap", className)}>
      {text}
    </Badge>
  );
}
