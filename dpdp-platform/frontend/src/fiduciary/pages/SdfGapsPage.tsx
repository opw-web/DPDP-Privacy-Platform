import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { employeeApiClient } from "../../lib/api-client";
import { SdfGapsSection } from "../components/sdf/SdfGapsSection";
import { findSdfCycleRule, type ComplianceRuleSummary, type SdfGapsData } from "../components/sdf/types";

/**
 * `/app/sdf/gaps` -- a direct-linkable, full-page view of the same
 * localisation/algorithm gaps rendered inline on `/app/sdf`
 * (`SdfGapsSection`, shared by both). Kept as its own route (existing
 * navigation and any bookmarked/notification links keep working) rather
 * than removed once the SDF page started showing the substance itself.
 */
export function SdfGapsPage() {
  const gapsQuery = useQuery({
    queryKey: ["sdf-gaps"],
    queryFn: () => employeeApiClient.get<SdfGapsData>("/sdf/gaps"),
  });
  const rulesQuery = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: () => employeeApiClient.get<ComplianceRuleSummary[]>("/compliance-rules"),
  });
  const cycleRule = findSdfCycleRule(rulesQuery.data);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">SDF gaps and algorithm register</h1>
        <Link to="/app/sdf" className="text-sm underline">Back to SDF readiness</Link>
      </div>
      <SdfGapsSection gaps={gapsQuery.data} isLoading={gapsQuery.isLoading} cycleRule={cycleRule} />
    </div>
  );
}
