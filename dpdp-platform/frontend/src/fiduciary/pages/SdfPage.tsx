import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { employeeApiClient } from "../../lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { RuleBasisChip } from "../../components/shared/RuleBasisChip";
import { UnreviewedRuleChip } from "../../components/shared/UnreviewedRuleChip";
import { AlgorithmRegisterPanel } from "../components/sdf/AlgorithmRegisterPanel";
import { AssessmentRow, type AssessmentRowData } from "../components/sdf/AssessmentRow";
import { SdfGapsSection } from "../components/sdf/SdfGapsSection";
import { findSdfCycleRule, type ComplianceRuleSummary, type SdfGapsData } from "../components/sdf/types";

interface SdfData { organization: { isSignificantDataFiduciary: boolean }; assessments: AssessmentRowData[]; }

export function canCompleteAudit(assessment: Pick<AssessmentRowData, "kind" | "isIndependent">): boolean {
  return assessment.kind !== "AUDIT" || assessment.isIndependent;
}

export function SdfPage() {
  const query = useQuery({ queryKey: ["sdf"], queryFn: () => employeeApiClient.get<SdfData>("/sdf/assessments") });
  const rulesQuery = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: () => employeeApiClient.get<ComplianceRuleSummary[]>("/compliance-rules"),
  });
  const gapsQuery = useQuery({
    queryKey: ["sdf-gaps"],
    queryFn: () => employeeApiClient.get<SdfGapsData>("/sdf/gaps"),
  });

  const cycleRule = findSdfCycleRule(rulesQuery.data);
  const unreviewedAlgorithmIds = useMemo(
    () => new Set((gapsQuery.data?.unreviewedAlgorithms ?? []).map((entry) => entry.id)),
    [gapsQuery.data],
  );

  if (!query.data) return <p>Loading SDF readiness…</p>;
  const data = query.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">SDF readiness</h1>
        <p className="text-sm text-muted-foreground">Cycles are calculated from the configured compliance rule and returned due dates -- never a hard-coded figure.</p>
      </div>

      {!data.organization.isSignificantDataFiduciary ? (
        <Card>
          <CardContent className="p-6">
            <h2 className="font-semibold">Not currently a Significant Data Fiduciary</h2>
            <p className="text-sm text-muted-foreground">Readiness view is available while your declaration is pending.</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Assessment cycle</CardTitle>
              <CardDescription>DPIA and audit, once every cycle (SD-02, SD-04).</CardDescription>
            </div>
            {cycleRule ? (
              <div className="flex items-center gap-2">
                <RuleBasisChip basis={cycleRule.basis} citation={cycleRule.legalSource} />
                <UnreviewedRuleChip isReviewed={cycleRule.isReviewed} />
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.assessments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assessment cycle has been opened yet.</p>
          ) : null}
          {data.assessments.map((assessment) => (
            <AssessmentRow key={assessment.id} assessment={assessment} canCompleteAudit={canCompleteAudit} />
          ))}
        </CardContent>
      </Card>

      <AlgorithmRegisterPanel unreviewedIds={unreviewedAlgorithmIds} cycleRule={cycleRule} />

      <SdfGapsSection gaps={gapsQuery.data} isLoading={gapsQuery.isLoading} cycleRule={cycleRule} showLinkToFullRegister />
    </div>
  );
}
