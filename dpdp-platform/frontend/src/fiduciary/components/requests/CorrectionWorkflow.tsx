import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { employeeApiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import type { RequestPrincipal, RequestRecord } from "./types";

/** Human-only correction workflow; it intentionally contains no source write capability. */
export function CorrectionWorkflow({ request, principal }: { request: RequestRecord; principal: RequestPrincipal }) {
  const requestedFields = Object.keys(request.requestedChanges ?? {});
  const sources = [...new Map(principal.fields.filter((field) => requestedFields.includes(field.canonicalField)).flatMap((field) => field.sources).map((source) => [source.id, source])).values()];
  const sync = useMutation({ mutationFn: (id: string) => employeeApiClient.post(`/data-sources/${id}/sync`), onSuccess: () => toast.success("Sync queued. The source system remains read-only."), onError: () => toast.error("Could not queue sync."), });
  return <section className="rounded-md border p-4" aria-label="Correction workflow"><h2 className="font-semibold">Requested correction</h2><dl className="mt-3 space-y-2 text-sm">{Object.entries(request.requestedChanges ?? {}).map(([field, change]) => <div key={field}><dt className="font-medium">{field.replaceAll("_", " ")}</dt><dd className="text-muted-foreground">{typeof change === "object" && change !== null ? `${String((change as { from?: unknown }).from ?? "—")} → ${String((change as { to?: unknown }).to ?? "—")}` : String(change)}</dd></div>)}</dl><p className="mt-4 rounded-md bg-muted p-3 text-sm">Update this in the source system, then mark complete. The next sync will reflect it.</p>{sources.length ? <div className="mt-3"><p className="text-sm font-medium">Sources holding the requested field</p><div className="mt-2 flex flex-wrap gap-2">{sources.map((source) => <Button key={source.id} type="button" size="sm" variant="outline" onClick={() => sync.mutate(source.id)} disabled={sync.isPending}>Run sync now: {source.name}</Button>)}</div></div> : <p className="mt-3 text-sm text-muted-foreground">No holding source could be derived from the canonical profile.</p>}</section>;
}
