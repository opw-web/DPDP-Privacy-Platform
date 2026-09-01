import { Badge, type BadgeProps } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import type { RuleBasis } from "../../lib/mvp2-api";

export interface RuleBasisChipProps {
  basis: RuleBasis;
  /**
   * The legal citation (e.g. "Rule 7(3)", "RBI Master Direction ...") for
   * a `STATUTORY`/`SECTORAL` row, or the organization's source/reference
   * for an `ORG_POLICY`/`INTERNAL_TARGET` row. Non-legal references are
   * always labelled as such in the tooltip.
   */
  citation?: string | null;
  className?: string;
}

const LABEL: Record<RuleBasis, string> = {
  STATUTORY: "Statutory",
  SECTORAL: "Sectoral",
  ORG_POLICY: "Org policy",
  INTERNAL_TARGET: "Internal target",
};

const VARIANT: Record<RuleBasis, BadgeProps["variant"]> = {
  STATUTORY: "outline",
  SECTORAL: "outline",
  ORG_POLICY: "secondary",
  INTERNAL_TARGET: "secondary",
};

const IS_LEGAL_BASIS: Record<RuleBasis, boolean> = {
  STATUTORY: true,
  SECTORAL: true,
  ORG_POLICY: false,
  INTERNAL_TARGET: false,
};

/**
 * Spec line 575: labelling an `ORG_POLICY` row `STATUTORY` "is telling a
 * customer their own SLA is the law" -- worse than showing no number at
 * all. This is the one component that renders a rule's basis, so that
 * distinction holds by construction: the label map above has no entry
 * that could resolve `ORG_POLICY`/`INTERNAL_TARGET` to the word
 * "Statutory", and their tooltips explicitly say that a supplied reference
 * is not a legal requirement. `delayDuration={0}` on the
 * tooltip: this chip's whole job is a legal/non-legal distinction that
 * must be discoverable immediately, not after a 700ms hover delay.
 */
export function RuleBasisChip({ basis, citation, className }: RuleBasisChipProps) {
  const isLegal = IS_LEGAL_BASIS[basis];
  const source = citation?.trim();
  const tooltipText = isLegal
    ? source || "Legal citation not yet recorded."
    : source
      ? `Organization reference: ${source}. Not a legal requirement.`
      : "Set by your organization -- not a legal requirement.";

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span>
            <Badge variant={VARIANT[basis]} className={cn("whitespace-nowrap", className)}>
              {LABEL[basis]}
            </Badge>
            {/* Keep the citation available to assistive technology and
                deterministic tests even when a pointer is unavailable. The
                Radix tooltip remains the visual affordance. */}
            <span className="sr-only">{tooltipText}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
