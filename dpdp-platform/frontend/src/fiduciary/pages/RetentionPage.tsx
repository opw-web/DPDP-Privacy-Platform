import { useState } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { employeeApiClient } from "../../lib/api-client";
import { DateTime } from "../../components/shared/DateTime";
import { EmptyState } from "../../components/shared/EmptyState";
import { Skeleton } from "../../components/shared/Skeleton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { LegalHoldForm } from "../components/retention/LegalHoldForm";
import { RetentionTaskCard } from "../components/retention/RetentionTaskCard";
import { RETENTION_STATES, retentionStateLabel, type ErasureTask, type LegalHold, type RetentionState } from "../components/retention/types";

export function RetentionPage() {
  const [state, setState] = useState<RetentionState | "">("");
  const [showHoldForm, setShowHoldForm] = useState(false);
  const taskQuery = state ? `?state=${encodeURIComponent(state)}` : "";
  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["retention", "tasks", state],
    queryFn: () => employeeApiClient.get<ErasureTask[]>(`/retention/tasks${taskQuery}`),
  });
  const { data: legalHolds, isLoading: holdsLoading } = useQuery({
    queryKey: ["retention", "legal-holds"],
    queryFn: () => employeeApiClient.get<LegalHold[]>("/retention/legal-holds"),
  });
  const taskRows = tasks ?? [];
  const deferredTasks = taskRows.filter((task) => task.state === "DEFERRED_RETENTION_FLOOR");
  const stateCount = new Map(RETENTION_STATES.map((candidate) => [candidate, taskRows.filter((task) => task.state === candidate).length]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Retention and erasure</h1><p className="text-sm text-muted-foreground">Review erasure tasks, the statutory retention floor, legal holds and human completion checklists.</p></div><Button onClick={() => setShowHoldForm((current) => !current)}><Plus className="h-4 w-4" aria-hidden="true" />New legal hold</Button></div>

      <Card className="border-amber-300 bg-amber-50/60"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-950"><ShieldAlert className="h-5 w-5" aria-hidden="true" />Retention floor protection</CardTitle><CardDescription className="text-amber-900">Rule 8(3) requires the minimum retention period. Erasure must never cross that floor.</CardDescription></CardHeader><CardContent>{deferredTasks.length === 0 ? <p className="text-sm text-amber-900">No task is currently deferred by the retention floor.</p> : <div className="space-y-3">{deferredTasks.map((task) => <div key={task.id} className="rounded-md border border-amber-300 bg-background p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Principal {task.dataPrincipalId}</span><Badge variant="amber">DEFERRED_RETENTION_FLOOR</Badge></div><p className="mt-1"><span className="font-medium">Release date:</span> {task.retentionFloorUntil ? <DateTime value={task.retentionFloorUntil} /> : "Not available"}</p><p className="mt-1 text-xs text-muted-foreground">Rule 8(3) — minimum one-year retention of personal data and logs. Completion remains blocked until release.</p></div>)}</div>}</CardContent></Card>

      <Card><CardHeader><CardTitle>Tasks by state</CardTitle><CardDescription>Filter the erasure queue without changing the state recorded by the retention engine.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Button size="sm" variant={state === "" ? "default" : "outline"} onClick={() => setState("")}>All ({taskRows.length})</Button>{RETENTION_STATES.map((candidate) => <Button key={candidate} size="sm" variant={state === candidate ? "default" : "outline"} onClick={() => setState(candidate)}>{retentionStateLabel(candidate)} ({stateCount.get(candidate) ?? 0})</Button>)}</div><label className="flex items-center gap-2 text-sm" htmlFor="retention-state-filter"><span className="font-medium">State filter</span><select id="retention-state-filter" value={state} onChange={(event) => setState(event.target.value as RetentionState | "")} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">All states</option>{RETENTION_STATES.map((candidate) => <option key={candidate} value={candidate}>{retentionStateLabel(candidate)}</option>)}</select></label>{tasksLoading ? <Skeleton className="h-40 w-full" data-testid="retention-tasks-skeleton" /> : taskRows.length === 0 ? <EmptyState title="No erasure tasks" description="The retention scan has not created any task matching this state." action={{ label: "Show all states", onClick: () => setState("") }} /> : <div className="space-y-4">{taskRows.map((task) => <RetentionTaskCard key={task.id} task={task} />)}</div>}</CardContent></Card>

      <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Legal holds</CardTitle><CardDescription>Active holds override the retention schedule; every hold displays its legal citation.</CardDescription></div>{!showHoldForm ? <Button variant="outline" onClick={() => setShowHoldForm(true)}><Plus className="h-4 w-4" aria-hidden="true" />Create hold</Button> : null}</CardHeader>{showHoldForm ? <CardContent><LegalHoldForm onDone={() => setShowHoldForm(false)} /></CardContent> : null}<CardContent className={showHoldForm ? "pt-0" : undefined}>{holdsLoading ? <Skeleton className="h-24 w-full" data-testid="legal-holds-skeleton" /> : (legalHolds ?? []).length === 0 ? <EmptyState title="No legal holds" description="Create a hold when a court, Board direction or investigation requires erasure to pause." action={{ label: "Create legal hold", onClick: () => setShowHoldForm(true) }} /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="p-3">Hold</th><th className="p-3">Reason</th><th className="p-3">Legal citation</th><th className="p-3">Scope</th><th className="p-3">Started</th><th className="p-3">Ends</th></tr></thead><tbody>{(legalHolds ?? []).map((hold) => <tr key={hold.id} className="border-b border-border"><td className="p-3 font-medium">{hold.name}</td><td className="max-w-sm p-3">{hold.reason}</td><td className="p-3 font-medium">{hold.legalCitation}</td><td className="p-3 text-xs">{hold.scope?.principalIds?.length ? `${hold.scope.principalIds.length} principal(s)` : hold.scope?.purposeIds?.length ? `${hold.scope.purposeIds.length} purpose(s)` : "Organization-wide"}</td><td className="p-3"><DateTime value={hold.startedAt} /></td><td className="p-3">{hold.endsAt ? <DateTime value={hold.endsAt} /> : "Open-ended"}</td></tr>)}</tbody></table></div>}</CardContent></Card>
    </div>
  );
}
