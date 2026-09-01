import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";

export function ExemptionClaimForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [purposeId, setPurposeId] = useState("");
  const [schedulePart, setSchedulePart] = useState("Fourth Schedule Part A");
  const [scheduleRow, setScheduleRow] = useState("");
  const [conditionText, setConditionText] = useState("");
  const [justification, setJustification] = useState("");
  const claim = useMutation({
    mutationFn: () => employeeApiClient.post("/child-exemptions", {
      purposeId: purposeId.trim(), schedulePart, scheduleRow: Number(scheduleRow), conditionText: conditionText.trim(), justification: justification.trim(),
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["children", "exemptions"] }); toast.success("Exemption claim recorded with its Schedule citation."); onDone(); },
    onError: (error: unknown) => toast.error(error instanceof ApiError && error.message ? error.message : "Could not record the exemption claim."),
  });
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purposeId.trim() || !scheduleRow || Number(scheduleRow) < 1 || !conditionText.trim() || !justification.trim()) {
      toast.error("Purpose, Schedule row, condition text and justification are required.");
      return;
    }
    claim.mutate();
  }
  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="exemption-purpose">Purpose ID</Label><Input id="exemption-purpose" value={purposeId} onChange={(e) => setPurposeId(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="exemption-row">Schedule row</Label><Input id="exemption-row" type="number" min={1} step={1} value={scheduleRow} onChange={(e) => setScheduleRow(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="exemption-part">Schedule part</Label><select id="exemption-part" value={schedulePart} onChange={(e) => setSchedulePart(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="Fourth Schedule Part A">Fourth Schedule Part A</option><option value="Part B">Part B</option></select></div>
      <div className="space-y-1.5"><Label htmlFor="exemption-condition">Condition text (paste the Schedule wording)</Label><Textarea id="exemption-condition" value={conditionText} onChange={(e) => setConditionText(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="exemption-justification">Why this purpose meets the condition</Label><Textarea id="exemption-justification" value={justification} onChange={(e) => setJustification(e.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onDone}>Cancel</Button><Button type="submit" disabled={claim.isPending}>{claim.isPending ? "Saving…" : "Save exemption claim"}</Button></div>
    </form>
  );
}
