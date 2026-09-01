import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { employeeApiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { AccessReportPanel } from "../components/requests/AccessReportPanel";
import { CorrectionWorkflow } from "../components/requests/CorrectionWorkflow";
import { ErasureChecklist } from "../components/requests/ErasureChecklist";
import { RequestRulePanel } from "../components/requests/RulePanel";
import { RequestWorkPanel } from "../components/requests/RequestWorkPanel";
import type { ProcessorActivity, RequestPrincipal, RequestRecord } from "../components/requests/types";

interface ComplianceRule { ruleCode: string; version: number; isReviewed: boolean; }

/** `/app/requests/:ref` — three-column human workflow for a rights request. */
export function RequestDetailPage() {
  const { ref = "" } = useParams();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const requestQuery = useQuery({
    queryKey: ["request", ref],
    queryFn: () => employeeApiClient.get<RequestRecord>(`/requests/${ref}`),
    enabled: Boolean(ref),
    refetchInterval: 20_000,
  });
  const principalQuery = useQuery({
    queryKey: ["request-principal", requestQuery.data?.dataPrincipalId],
    queryFn: () => employeeApiClient.get<RequestPrincipal>(`/principals/${requestQuery.data!.dataPrincipalId}`),
    enabled: Boolean(requestQuery.data?.dataPrincipalId),
  });
  const recipientsQuery = useQuery({
    queryKey: ["request-recipients", requestQuery.data?.dataPrincipalId],
    queryFn: () => employeeApiClient.get<ProcessorActivity[]>(`/principals/${requestQuery.data!.dataPrincipalId}/recipients`),
    enabled: Boolean(requestQuery.data?.dataPrincipalId),
  });
  const rulesQuery = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: () => employeeApiClient.get<ComplianceRule[]>("/compliance-rules"),
  });
  const request = requestQuery.data;
  const principal = principalQuery.data;
  const activities = useMemo(() => recipientsQuery.data ?? [], [recipientsQuery.data]);
  const checklistItems = useMemo(
    () => principal ? [...new Set([
      ...principal.fields.flatMap((field) => field.sources.map((source) => `source:${source.id}`)),
      ...activities.filter((activity) => activity.recipient.type === "DATA_PROCESSOR").map((activity) => `processor:${activity.recipient.id}`),
    ])] : [],
    [activities, principal],
  );

  if (requestQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading request…</p>;
  if (!request) return <p className="text-sm text-destructive">Request could not be loaded.</p>;

  const snapshottedRule = rulesQuery.data?.find((rule) => rule.ruleCode === request.ruleCodeSnapshot && rule.version === request.ruleVersionSnapshot);
  const completionAllowed = request.type !== "ERASURE" || (checklistItems.length > 0 && checklistItems.every((item) => checked.has(item)));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div><h1 className="text-xl font-semibold">{request.reference}</h1><p className="text-sm text-muted-foreground">{request.type.replaceAll("_", " ")} request</p></div>
        <Button variant="outline" asChild><Link to="/app/requests">All requests</Link></Button>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Request detail</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Badge variant={request.isOverdue ? "destructive" : "secondary"}>{request.status.replaceAll("_", " ")}</Badge>
              <div><p className="text-muted-foreground">Subject</p><p>{request.subject}</p></div>
              <div><p className="text-muted-foreground">Request</p><p className="whitespace-pre-wrap">{request.body}</p></div>
              {request.outcome ? <div><p className="text-muted-foreground">Outcome</p><p>{request.outcome}</p></div> : null}
            </CardContent>
          </Card>
          <RequestRulePanel request={request} isReviewed={snapshottedRule?.isReviewed ?? false} />
          {request.type === "ACCESS" ? <AccessReportPanel reference={request.reference} /> : null}
          {request.type === "CORRECTION" && principal ? <CorrectionWorkflow request={request} principal={principal} /> : null}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Canonical profile with lineage</CardTitle></CardHeader>
            <CardContent>
              {principalQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading profile…</p> : principal ? <>
                <p className="font-medium">{principal.displayName ?? `Principal ${principal.reference}`}</p>
                <dl className="mt-3 space-y-3 text-sm">{principal.fields.map((field) => <div key={field.id}><dt className="text-muted-foreground">{field.canonicalField.replaceAll("_", " ")}</dt><dd>{field.value}<span className="ml-2 text-xs text-muted-foreground">from {field.sources.map((source) => source.name).join(", ")}</span></dd></div>)}</dl>
              </> : <p className="text-sm text-muted-foreground">Profile unavailable.</p>}
            </CardContent>
          </Card>
          {request.type === "ERASURE" && principal ? <ErasureChecklist principal={principal} activities={activities} checked={checked} onChange={(key, value) => setChecked((current) => { const next = new Set(current); if (value) next.add(key); else next.delete(key); return next; })} /> : null}
        </div>
        <div><RequestWorkPanel request={request} completionAllowed={completionAllowed} /></div>
      </div>
    </div>
  );
}
