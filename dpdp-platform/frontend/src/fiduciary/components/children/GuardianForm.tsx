import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, employeeApiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

interface GuardianFormProps {
  onDone: () => void;
}

export function GuardianForm({ onDone }: GuardianFormProps) {
  const queryClient = useQueryClient();
  const [dataPrincipalId, setDataPrincipalId] = useState("");
  const [kind, setKind] = useState("PARENT_OF_CHILD");
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [appointingAuthority, setAppointingAuthority] = useState("");
  const [appointmentReference, setAppointmentReference] = useState("");

  const createGuardian = useMutation({
    mutationFn: () =>
      employeeApiClient.post("/guardians", {
        dataPrincipalId: dataPrincipalId.trim(),
        kind,
        guardianName: guardianName.trim(),
        ...(guardianEmail.trim() ? { guardianEmail: guardianEmail.trim() } : {}),
        ...(guardianPhone.trim() ? { guardianPhone: guardianPhone.trim() } : {}),
        ...(kind === "LAWFUL_GUARDIAN_OF_PWD"
          ? { appointingAuthority, appointmentReference: appointmentReference.trim() }
          : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["children", "guardians"] });
      toast.success("Guardian relationship registered. Verification is still required.");
      onDone();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError && error.message ? error.message : "Could not register the guardian.");
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dataPrincipalId.trim() || !guardianName.trim()) {
      toast.error("Data principal ID and guardian name are required.");
      return;
    }
    if (kind === "LAWFUL_GUARDIAN_OF_PWD" && (!appointingAuthority || !appointmentReference.trim())) {
      toast.error("Rule 11 requires an appointing authority and appointment reference.");
      return;
    }
    createGuardian.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="guardian-principal">Data principal ID</Label>
          <Input id="guardian-principal" value={dataPrincipalId} onChange={(e) => setDataPrincipalId(e.target.value)} placeholder="Principal ID" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guardian-kind">Relationship</Label>
          <select id="guardian-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="PARENT_OF_CHILD">Parent of child</option>
            <option value="LAWFUL_GUARDIAN_OF_PWD">Lawful guardian of person with disability</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guardian-name">Guardian name</Label>
          <Input id="guardian-name" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guardian-email">Guardian email (optional)</Label>
          <Input id="guardian-email" type="email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guardian-phone">Guardian phone (optional)</Label>
          <Input id="guardian-phone" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} />
        </div>
      </div>
      {kind === "LAWFUL_GUARDIAN_OF_PWD" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-md border border-border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="guardian-authority">Appointing authority (Rule 11)</Label>
            <select id="guardian-authority" value={appointingAuthority} onChange={(e) => setAppointingAuthority(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select authority…</option>
              <option value="COURT">Court</option>
              <option value="DESIGNATED_AUTHORITY">Designated authority</option>
              <option value="LOCAL_LEVEL_COMMITTEE">Local Level Committee</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guardian-appointment-reference">Appointment reference</Label>
            <Input id="guardian-appointment-reference" value={appointmentReference} onChange={(e) => setAppointmentReference(e.target.value)} />
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">A new relationship starts as Not verified. Record verification separately after checking the evidence.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={createGuardian.isPending}>{createGuardian.isPending ? "Registering…" : "Register guardian"}</Button>
      </div>
    </form>
  );
}
