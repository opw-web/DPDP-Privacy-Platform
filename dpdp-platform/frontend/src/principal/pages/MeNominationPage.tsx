import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { principalApiClient } from "../../lib/api-client";
import { Skeleton } from "../../components/shared/Skeleton";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { PortalPageHeader } from "../components/PortalPageHeader";

interface Nomination {
  nomineeName: string;
  nomineeEmail?: string | null;
  nomineePhone?: string | null;
  relationship: string;
  scope: "ALL_RIGHTS" | "ACCESS_ONLY" | "ERASURE_ONLY";
  activationCondition: "DEATH" | "INCAPACITY" | "BOTH";
}

const EMPTY_NOMINATION: Nomination = {
  nomineeName: "",
  nomineeEmail: "",
  nomineePhone: "",
  relationship: "",
  scope: "ALL_RIGHTS",
  activationCondition: "BOTH",
};

/** `/me/nomination` -- stores a nominee; acting on a nomination stays a manual employee process. */
export function MeNominationPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Nomination>(EMPTY_NOMINATION);
  const { data: nomination, isLoading } = useQuery({
    queryKey: ["me", "nomination"],
    queryFn: () => principalApiClient.get<Nomination | null>("/me/nomination"),
  });
  useEffect(() => {
    if (nomination) setForm({ ...EMPTY_NOMINATION, ...nomination });
  }, [nomination]);
  const save = useMutation({
    mutationFn: () => principalApiClient.put<Nomination>("/me/nomination", form),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me", "nomination"] }),
  });
  const update = <K extends keyof Nomination>(key: K, value: Nomination[K]) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-6">
      <PortalPageHeader title="Nomination">
        Name someone who can exercise the rights you choose if the condition below happens.
      </PortalPageHeader>
      <Card className="border-amber-400 bg-amber-50/50"><CardContent className="p-4 text-amber-950"><p className="font-medium">What happens next</p><p className="mt-1">Saving this form records your choice. If it ever needs to be used, it goes through a manual employee workflow. It does not give anyone automatic access to your account.</p></CardContent></Card>
      {isLoading ? <Skeleton className="h-96 w-full" /> : <Card>
        <CardHeader><CardTitle className="text-xl">Your nominee</CardTitle></CardHeader>
        <CardContent><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="nominee-name">Full name</Label><Input id="nominee-name" value={form.nomineeName} onChange={(event) => update("nomineeName", event.target.value)} required /></div><div className="space-y-1"><Label htmlFor="relationship">Relationship to you</Label><Input id="relationship" value={form.relationship} onChange={(event) => update("relationship", event.target.value)} placeholder="For example, spouse or parent" required /></div><div className="space-y-1"><Label htmlFor="nominee-email">Email (optional)</Label><Input id="nominee-email" type="email" value={form.nomineeEmail ?? ""} onChange={(event) => update("nomineeEmail", event.target.value)} /></div><div className="space-y-1"><Label htmlFor="nominee-phone">Phone (optional)</Label><Input id="nominee-phone" type="tel" value={form.nomineePhone ?? ""} onChange={(event) => update("nomineePhone", event.target.value)} /></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="scope">What may this person do?</Label><Select id="scope" value={form.scope} onChange={(event) => update("scope", event.target.value as Nomination["scope"])}><option value="ALL_RIGHTS">All privacy rights</option><option value="ACCESS_ONLY">Ask to see my data only</option><option value="ERASURE_ONLY">Ask to erase my data only</option></Select></div><div className="space-y-1"><Label htmlFor="activation">When can this nomination be used?</Label><Select id="activation" value={form.activationCondition} onChange={(event) => update("activationCondition", event.target.value as Nomination["activationCondition"])}><option value="DEATH">After my death</option><option value="INCAPACITY">If I cannot make decisions</option><option value="BOTH">After my death or if I cannot make decisions</option></Select></div></div>
          {save.isError ? <p role="alert" className="text-sm text-destructive">We could not save your nomination. Please try again.</p> : null}{save.isSuccess ? <p role="status" className="text-sm text-green-700">Your nomination has been saved.</p> : null}<Button type="submit" disabled={save.isPending}>Save nomination</Button>
        </form></CardContent>
      </Card>}
    </div>
  );
}
