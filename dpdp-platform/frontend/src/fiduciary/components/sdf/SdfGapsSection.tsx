import { Link } from "react-router-dom";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card";
import { RuleBasisChip } from "../../../components/shared/RuleBasisChip";
import type { ComplianceRuleSummary, SdfGapsData } from "./types";

/**
 * SD-06 (cross-border localisation), SD-05 (algorithm review) and SD-01
 * (DPO location) gaps, rendered from `GET /sdf/gaps` verbatim. Per
 * `SdfGapsService`'s own doc comment, "the platform FLAGS these three
 * things ... it cannot block" -- this component adds no compliance
 * language of its own and never claims a zero-gap state means the
 * organization "is compliant" (Global Constraint 8).
 */
export function SdfGapsSection({
  gaps,
  isLoading,
  cycleRule,
  showLinkToFullRegister = false,
}: {
  gaps: SdfGapsData | undefined;
  isLoading: boolean;
  cycleRule?: ComplianceRuleSummary;
  showLinkToFullRegister?: boolean;
}) {
  return (
    <Card data-testid="sdf-gaps-section">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Localisation and algorithm gaps</CardTitle>
            <CardDescription>What the platform has flagged for a human to act on -- it never blocks a transfer or a review.</CardDescription>
          </div>
          {showLinkToFullRegister ? (
            <Link to="/app/sdf/gaps" className="text-sm underline">Open gaps register</Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading || !gaps ? (
          <p className="text-sm text-muted-foreground">Loading gaps…</p>
        ) : (
          <>
            {gaps.dpoNotIndiaBased ? (
              <div role="alert" className="rounded-md border-2 border-destructive p-3 text-sm text-destructive">
                DPO is not India-based. s.10(2)(a) requires a Significant Data Fiduciary's Data Protection Officer to be based in India (SD-01).
              </div>
            ) : null}

            <section aria-label="Localisation gaps">
              <h3 className="font-semibold">Localisation gaps (CB-03 / Rule 13(4))</h3>
              {gaps.localisationRequiredTransfers.length > 0 ? (
                <>
                  <p role="alert" className="mt-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm font-semibold text-destructive">
                    {gaps.localisationRequiredTransfers.length} cross-border transfer(s) are marked in the transfer register as requiring data localisation -- each recipient below needs review before the register can be relied on.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {gaps.localisationRequiredTransfers.map((gap) => (
                      <li key={gap.id} className="rounded-md border border-destructive/40 p-3 text-sm">
                        <p className="font-medium text-destructive">{gap.destinationCountry}</p>
                        <p className="text-muted-foreground">{gap.purposeDescription}</p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No cross-border transfer is currently flagged as requiring localisation review.</p>
              )}
            </section>

            <section aria-label="Algorithms requiring review">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">Algorithms requiring Rule 13(3) review</h3>
                {cycleRule ? <RuleBasisChip basis={cycleRule.basis} citation={cycleRule.legalSource} /> : null}
              </div>
              {gaps.unreviewedAlgorithms.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {gaps.unreviewedAlgorithms.map((algorithm) => (
                    <li key={algorithm.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <span>{algorithm.name}</span>
                      <Badge variant="amber">
                        {algorithm.lastReviewedAt ? `Last reviewed ${new Date(algorithm.lastReviewedAt).toLocaleDateString()}` : "Never reviewed"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No algorithm register entry is currently overdue for review.</p>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
