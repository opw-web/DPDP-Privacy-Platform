import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../../lib/api-client";
import { DateTime } from "../../../components/shared/DateTime";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { retentionStateLabel, type ErasureTask, type ProcessorChecklistEntry, type SystemChecklistEntry } from "./types";

function hasIncompleteChecklist(systems: SystemChecklistEntry[], processors: ProcessorChecklistEntry[]) {
  return systems.some((entry) => !entry.excluded && !entry.done) || processors.some((entry) => !entry.confirmed);
}

export function RetentionTaskCard({ task }: { task: ErasureTask }) {
  const queryClient = useQueryClient();
  const [systems, setSystems] = useState(task.systemChecklist ?? []);
  const [processors, setProcessors] = useState(task.processorChecklist ?? []);
  const [cancelReason, setCancelReason] = useState("");
  const canWork = task.state === "EVALUATED" || task.state === "NOTICE_SENT" || task.state === "READY_FOR_ERASURE";
  const complete = useMutation({
    mutationFn: () => employeeApiClient.post(`/retention/tasks/${task.id}/complete`, {
      systemChecklist: systems.map((entry) => ({ dataSourceId: entry.dataSourceId, done: Boolean(entry.excluded || entry.done) })),
      processorChecklist: processors.map((entry) => ({ recipientId: entry.recipientId, confirmed: entry.confirmed, ...(entry.ref?.trim() ? { ref: entry.ref.trim() } : {}) })),
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["retention", "tasks"] }); toast.success("Erasure checklist completed and recorded."); },
    onError: (error: unknown) => toast.error(error instanceof ApiError && error.message ? error.message : "Could not complete this erasure task."),
  });
  const cancel = useMutation({
    mutationFn: () => employeeApiClient.post(`/retention/tasks/${task.id}/cancel`, { reason: cancelReason.trim() }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["retention", "tasks"] }); toast.success("Erasure task cancelled with a recorded reason."); },
    onError: (error: unknown) => toast.error(error instanceof ApiError && error.message ? error.message : "Could not cancel this erasure task."),
  });

  function toggleSystem(index: number) {
    setSystems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, done: !entry.done } : entry));
  }
  function toggleProcessor(index: number) {
    setProcessors((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, confirmed: !entry.confirmed } : entry));
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><CardTitle className="text-base">Principal {task.dataPrincipalId}</CardTitle><CardDescription>{task.trigger.replaceAll("_", " ")} · evaluated <DateTime value={task.evaluatedAt} /></CardDescription></div>
          <Badge variant={task.state === "DEFERRED_RETENTION_FLOOR" ? "amber" : task.state === "ON_LEGAL_HOLD" ? "destructive" : "outline"}>{retentionStateLabel(task.state)}</Badge>
        </div>
        {task.state === "DEFERRED_RETENTION_FLOOR" ? <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Erasure deferred by the mandatory retention floor</p><p>Release date: {task.retentionFloorUntil ? <DateTime value={task.retentionFloorUntil} /> : "not available"}</p><p className="mt-1 text-xs">Rule 8(3) — personal data and logs must be retained for the minimum statutory period. This task cannot be completed before the floor releases.</p></div> : null}
        {task.state === "ON_LEGAL_HOLD" ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950"><p className="font-semibold">Legal hold blocks erasure</p><p>Hold: {task.legalHoldId ?? "organization hold"}. Resolve the hold before completing this task.</p></div> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Erasure due</p><p>{task.erasureDueAt ? <DateTime value={task.erasureDueAt} /> : "Not scheduled"}</p></div><div><p className="text-xs text-muted-foreground">Pre-erasure notice due</p><p>{task.preErasureNoticeDueAt ? <DateTime value={task.preErasureNoticeDueAt} /> : "Not scheduled"}</p></div><div><p className="text-xs text-muted-foreground">Rule snapshot</p><p>{task.ruleCodeSnapshot ? `${task.ruleCodeSnapshot}${task.ruleVersionSnapshot ? ` v${task.ruleVersionSnapshot}` : ""}` : "No rule snapshot"}</p></div></div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-2"><h4 className="text-sm font-semibold">Per-system completion checklist</h4>{systems.length === 0 ? <p className="text-sm text-muted-foreground">No source systems listed.</p> : systems.map((entry, index) => <label key={`${entry.dataSourceId}-${index}`} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm"><Checkbox checked={entry.done || Boolean(entry.excluded)} disabled={Boolean(entry.excluded) || !canWork} onChange={() => toggleSystem(index)} /><span><span className="font-mono text-xs">{entry.dataSourceId}</span>{entry.excluded ? <span className="ml-2 text-xs text-muted-foreground">Excluded under account-access carve-out{entry.excludedFields?.length ? ` (${entry.excludedFields.join(", ")})` : ""}</span> : <span className="block text-xs text-muted-foreground">Confirm manual erasure in this source; platform access is read-only.</span>}</span></label>)}</div>
          <div className="space-y-2"><h4 className="text-sm font-semibold">Per-processor completion checklist</h4>{processors.length === 0 ? <p className="text-sm text-muted-foreground">No processors listed.</p> : processors.map((entry, index) => <div key={`${entry.recipientId}-${index}`} className="rounded-md border border-border p-2"><label className="flex items-start gap-2 text-sm"><Checkbox checked={entry.confirmed} disabled={!canWork} onChange={() => toggleProcessor(index)} /><span className="font-mono text-xs">{entry.recipientId}</span></label><Input className="mt-2 h-8 text-xs" disabled={!canWork} aria-label={`Processor confirmation reference ${entry.recipientId}`} value={entry.ref ?? ""} onChange={(event) => setProcessors((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ref: event.target.value } : item))} placeholder="Processor ticket/reference" /></div>)}</div>
        </div>
        {canWork ? <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3"><div className="flex gap-2"><Button variant="default" disabled={hasIncompleteChecklist(systems, processors) || complete.isPending} onClick={() => complete.mutate()}>{complete.isPending ? "Submitting…" : "Complete erasure checklist"}</Button><Button variant="outline" disabled={!cancelReason.trim() || cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? "Cancelling…" : "Cancel task"}</Button></div><Input className="w-72" aria-label={`Cancellation reason for ${task.id}`} placeholder="Cancellation reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></div> : null}
      </CardContent>
    </Card>
  );
}
