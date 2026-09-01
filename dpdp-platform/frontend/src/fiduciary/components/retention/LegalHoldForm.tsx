import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";

export function LegalHoldForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(""); const [reason, setReason] = useState(""); const [legalCitation, setLegalCitation] = useState(""); const [principalIds, setPrincipalIds] = useState(""); const [purposeIds, setPurposeIds] = useState(""); const [endsAt, setEndsAt] = useState("");
  const create = useMutation({
    mutationFn: () => employeeApiClient.post("/retention/legal-holds", { name: name.trim(), reason: reason.trim(), legalCitation: legalCitation.trim(), scope: { ...(principalIds.trim() ? { principalIds: principalIds.split(",").map((value) => value.trim()).filter(Boolean) } : {}), ...(purposeIds.trim() ? { purposeIds: purposeIds.split(",").map((value) => value.trim()).filter(Boolean) } : {}) }, ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["retention", "legal-holds"] }); toast.success("Legal hold created and applied to covered tasks."); onDone(); },
    onError: (error: unknown) => toast.error(error instanceof ApiError && error.message ? error.message : "Could not create the legal hold."),
  });
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!name.trim() || !reason.trim() || !legalCitation.trim()) { toast.error("Name, reason and legal citation are required."); return; } create.mutate(); }
  return <form className="space-y-4" onSubmit={submit} noValidate><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="hold-name">Hold name</Label><Input id="hold-name" value={name} onChange={(e) => setName(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="hold-citation">Legal citation</Label><Input id="hold-citation" value={legalCitation} onChange={(e) => setLegalCitation(e.target.value)} placeholder="Court order / Board reference" /></div></div><div className="space-y-1.5"><Label htmlFor="hold-reason">Reason</Label><Textarea id="hold-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div className="space-y-1.5"><Label htmlFor="hold-principals">Principal IDs (comma separated)</Label><Input id="hold-principals" value={principalIds} onChange={(e) => setPrincipalIds(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="hold-purposes">Purpose IDs (comma separated)</Label><Input id="hold-purposes" value={purposeIds} onChange={(e) => setPurposeIds(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="hold-ends">Ends at (optional)</Label><Input id="hold-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div></div><p className="text-xs text-muted-foreground">An empty scope is organization-wide. The citation is retained alongside the hold and shown on affected erasure tasks.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onDone}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create legal hold"}</Button></div></form>;
}
