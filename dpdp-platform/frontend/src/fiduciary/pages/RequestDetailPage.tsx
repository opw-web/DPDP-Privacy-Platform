import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { employeeApiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import { AccessReportPanel } from "../components/requests/AccessReportPanel";
import { CorrectionWorkflow } from "../components/requests/CorrectionWorkflow";
import { RequestRulePanel } from "../components/requests/RulePanel";
import { RequestWorkPanel, type ErasureCompletionEvidence } from "../components/requests/RequestWorkPanel";
import type { RequestPrincipal, RequestRecord } from "../components/requests/types";

interface ComplianceRule { ruleCode: string; version: number; isReviewed: boolean; }
interface ErasureCompletionHolders { systemChecklist: Array<{ dataSourceId: string }>; processorChecklist: Array<{ recipientId: string }>; }

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
  const erasureHoldersQuery = useQuery({
    queryKey: ["request-erasure-completion-holders", ref],
    queryFn: () => employeeApiClient.get<ErasureCompletionHolders>(`/requests/${ref}/erasure-completion-holders`),
    enabled: requestQuery.data?.type === "ERASURE" && Boolean(ref),
  });
  const rulesQuery = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: () => employeeApiClient.get<ComplianceRule[]>("/compliance-rules"),
  });
  const request = requestQuery.data;
  const principal = principalQuery.data;
  const sourceHolderIds = useMemo(
    () => [...new Set((erasureHoldersQuery.data?.systemChecklist ?? []).map((item) => item.dataSourceId))],
    [erasureHoldersQuery.data],
  );
  const processorHolderIds = useMemo(
    () => [...new Set((erasureHoldersQuery.data?.processorChecklist ?? []).map((item) => item.recipientId))],
    [erasureHoldersQuery.data],
  );
  const checklistItems = useMemo(
    () => [...sourceHolderIds.map((id) => `source:${id}`), ...processorHolderIds.map((id) => `processor:${id}`)],
    [processorHolderIds, sourceHolderIds],
  );
  const erasureCompletionEvidence = useMemo<ErasureCompletionEvidence | undefined>(() => {
    if (requestQuery.data?.type !== "ERASURE") return undefined;
    return {
      systemChecklist: checklistItems
        .filter((item) => item.startsWith("source:") && checked.has(item))
        .map((item) => ({ dataSourceId: item.slice("source:".length), done: true })),
      processorChecklist: checklistItems
        .filter((item) => item.startsWith("processor:") && checked.has(item))
        .map((item) => ({ recipientId: item.slice("processor:".length), confirmed: true })),
    };
  }, [checked, checklistItems, requestQuery.data?.type]);

  if (requestQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading request…</p>;
  if (!request) return <p className="text-sm text-destructive">Request could not be loaded.</p>;

  const snapshottedRule = rulesQuery.data?.find((rule) => rule.ruleCode === request.ruleCodeSnapshot && rule.version === request.ruleVersionSnapshot);
  const completionAllowed = request.type !== "ERASURE" || (!erasureHoldersQuery.isLoading && checklistItems.length > 0 && checklistItems.every((item) => checked.has(item)));

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
          {request.type === "ERASURE" ? <section className="rounded-md border p-4" aria-label="Erasure completion checklist"><h2 className="font-semibold">Erasure completion checklist</h2><p className="mt-1 text-sm text-muted-foreground">Confirm every source system and registered processor before marking this request complete. This records a human workflow; it does not delete anything.</p>{erasureHoldersQuery.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading required holders…</p> : <><div className="mt-3 space-y-2">{sourceHolderIds.map((id) => { const key = `source:${id}`; return <label key={key} className="flex gap-2 text-sm"><Checkbox type="checkbox" checked={checked.has(key)} onChange={(event) => setChecked((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} />Source system: {id}</label>; })}{processorHolderIds.map((id) => { const key = `processor:${id}`; return <label key={key} className="flex gap-2 text-sm"><Checkbox type="checkbox" checked={checked.has(key)} onChange={(event) => setChecked((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} />Registered processor: {id}</label>; })}</div>{checklistItems.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No source systems or registered processors could be loaded; completion remains blocked pending this evidence.</p> : checklistItems.every((item) => checked.has(item)) ? <p className="mt-3 text-sm text-emerald-700">All listed holders have been confirmed.</p> : <p className="mt-3 text-sm text-destructive">Tick every listed item before completing.</p>}</>}</section> : null}
        </div>
        <div><RequestWorkPanel request={request} completionAllowed={completionAllowed} erasureCompletionEvidence={erasureCompletionEvidence} /></div>
      </div>
    </div>
  );
}
