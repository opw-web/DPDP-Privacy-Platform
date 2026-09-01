import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { employeeApiClient } from "../../lib/api-client";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

interface Assessment { id: string; kind: string; dueAt: string; completedAt: string | null; isIndependent: boolean; }
interface SdfData { organization: { isSignificantDataFiduciary: boolean }; assessments: Assessment[]; }

export function canCompleteAudit(assessment: Pick<Assessment, "kind" | "isIndependent">): boolean {
  return assessment.kind !== "AUDIT" || assessment.isIndependent;
}

export function SdfPage() {
  const query = useQuery({ queryKey: ["sdf"], queryFn: () => employeeApiClient.get<SdfData>("/sdf/assessments") });
  const complete = useMutation({
    mutationFn: (id: string) => employeeApiClient.post(`/sdf/assessments/${id}/complete`),
    onSuccess: () => { toast.success("Assessment marked complete."); void query.refetch(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not complete assessment."),
  });
  if (!query.data) return <p>Loading SDF readiness…</p>;
  const data = query.data;
  return <div className="space-y-6">
    <div><h1 className="text-xl font-semibold">SDF readiness</h1><p className="text-sm text-muted-foreground">Cycles are calculated from the configured compliance rule and returned due dates.</p></div>
    {!data.organization.isSignificantDataFiduciary ? <Card><CardContent className="p-6"><h2 className="font-semibold">Not currently a Significant Data Fiduciary</h2><p className="text-sm text-muted-foreground">Readiness view is available while your declaration is pending.</p></CardContent></Card> : null}
    <Card><CardHeader><CardTitle>Assessment cycle</CardTitle></CardHeader><CardContent className="space-y-3">{data.assessments.map((assessment) => { const dueAt = new Date(assessment.dueAt); const days = Math.ceil((dueAt.getTime() - Date.now()) / 86_400_000); const auditBlocked = !canCompleteAudit(assessment); return <div key={assessment.id} className="rounded border p-3"><div className="flex justify-between"><span className="font-medium">{assessment.kind}</span><Badge>{assessment.completedAt ? "Complete" : "Open"}</Badge></div><p className="text-sm">Due {dueAt.toLocaleDateString()} · {days} days remaining</p>{days <= 30 && !assessment.completedAt ? <p className="font-semibold text-destructive">Warning: cycle due within 30 days.</p> : null}{auditBlocked ? <p className="text-sm text-destructive">Independent auditor required before completion.</p> : null}{!assessment.completedAt ? <Button className="mt-2" size="sm" disabled={auditBlocked || complete.isPending} onClick={() => complete.mutate(assessment.id)}>Mark complete</Button> : null}</div>; })}</CardContent></Card>
  </div>;
}
