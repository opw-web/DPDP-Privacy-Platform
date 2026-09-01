import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { principalApiClient } from "../../lib/api-client";
import { DateTime } from "../../components/shared/DateTime";
import { EmptyState } from "../../components/shared/EmptyState";
import { Skeleton } from "../../components/shared/Skeleton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { PortalPageHeader } from "../components/PortalPageHeader";

type RequestType = "ACCESS" | "CORRECTION" | "ERASURE" | "GRIEVANCE";
type WizardStep = "type" | "details" | "confirm" | "reference";

interface MeRequest {
  reference: string;
  type: string;
  status: string;
  subject: string;
  body?: string;
  submittedAt: string;
  dueAt?: string | null;
}

const TYPES: Array<{ value: RequestType; label: string; description: string }> = [
  { value: "ACCESS", label: "See my data", description: "Ask for a copy and summary of your data." },
  { value: "CORRECTION", label: "Correct my data", description: "Tell us what is wrong and what it should say." },
  { value: "ERASURE", label: "Erase my data", description: "Ask us to erase data that is no longer needed." },
  { value: "GRIEVANCE", label: "Raise a grievance", description: "Tell us about a privacy problem or concern." },
];

function labelForType(type: string): string {
  return TYPES.find((item) => item.value === type)?.label ?? type.replaceAll("_", " ").toLowerCase();
}

function typeSubject(type: RequestType): string {
  return TYPES.find((item) => item.value === type)?.label ?? "Privacy request";
}

function correctionBody(field: string, currentValue: string, newValue: string): string {
  return `Please correct the ${field.trim()} value from "${currentValue.trim()}" to "${newValue.trim()}".`;
}

/** `/me/requests` -- existing requests plus a small, plain-language request wizard. */
export function MeRequestsPage() {
  const [searchParams] = useSearchParams();
  const requestedType = searchParams.get("type");
  const [step, setStep] = useState<WizardStep>(requestedType === "GRIEVANCE" ? "details" : "type");
  const [type, setType] = useState<RequestType>(requestedType === "GRIEVANCE" ? "GRIEVANCE" : "ACCESS");
  const [message, setMessage] = useState("");
  const [field, setField] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [newValue, setNewValue] = useState("");
  const [erasureScope, setErasureScope] = useState("All data that is no longer needed");
  const [reference, setReference] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useQuery({
    queryKey: ["me", "requests"],
    queryFn: () => principalApiClient.get<MeRequest[]>("/me/requests"),
    refetchInterval: 20_000,
  });
  const createRequest = useMutation({
    mutationFn: () => principalApiClient.post<MeRequest>("/me/requests", {
      type,
      subject: typeSubject(type),
      body: message || (type === "ACCESS" ? "I would like to see my data." : type === "CORRECTION" ? correctionBody(field, currentValue, newValue) : type === "ERASURE" ? "Please erase the data in the scope below." : ""),
      ...(type === "CORRECTION" ? { requestedChanges: { [field.trim() || "data"]: { from: currentValue, to: newValue } } } : {}),
      ...(type === "ERASURE" ? { requestedChanges: { scope: erasureScope } } : {}),
    }),
    onSuccess: (created) => {
      setReference(created.reference);
      setStep("reference");
      void queryClient.invalidateQueries({ queryKey: ["me", "requests"] });
    },
  });
  const selectedType = TYPES.find((item) => item.value === type)!;

  function detailsValid(): boolean {
    if (type === "CORRECTION") return Boolean(field.trim() && currentValue.trim() && newValue.trim());
    if (type === "GRIEVANCE") return Boolean(message.trim());
    return true;
  }

  return (
    <div className="space-y-8">
      <PortalPageHeader title="Your requests">
        Ask us to see, correct or erase your data, or tell us about a privacy concern.
      </PortalPageHeader>

      <Card>
        <CardHeader><CardTitle className="text-xl">Make a request</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">Step {step === "type" ? 1 : step === "details" ? 2 : step === "confirm" ? 3 : 4} of 4</p>
          {step === "type" ? <fieldset className="space-y-3">
            <legend className="font-medium">What would you like to do?</legend>
            {TYPES.map((item) => <label key={item.value} className="flex cursor-pointer gap-3 rounded-md border p-3 hover:bg-accent/50">
              <input type="radio" name="request-type" value={item.value} checked={type === item.value} onChange={() => setType(item.value)} />
              <span><span className="block font-medium">{item.label}</span><span className="text-sm text-muted-foreground">{item.description}</span></span>
            </label>)}
            <Button onClick={() => setStep("details")}>Continue</Button>
          </fieldset> : null}

          {step === "details" ? <div className="space-y-4">
            <h3 className="font-medium">{selectedType.label}</h3>
            {type === "ACCESS" ? <div className="space-y-2"><Label htmlFor="access-note">Anything you want us to focus on? (optional)</Label><Textarea id="access-note" value={message} onChange={(event) => setMessage(event.target.value)} /></div> : null}
            {type === "CORRECTION" ? <>
              <p className="text-sm text-muted-foreground">Enter the current value you see and the value you want us to check. We will update the source system, then tell you what happened.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label htmlFor="field">Field</Label><Input id="field" value={field} onChange={(event) => setField(event.target.value)} placeholder="Phone number" /></div>
                <div><Label htmlFor="current-value">Current value</Label><Input id="current-value" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} /></div>
                <div><Label htmlFor="new-value">Correct value</Label><Input id="new-value" value={newValue} onChange={(event) => setNewValue(event.target.value)} /></div>
              </div>
            </> : null}
            {type === "ERASURE" ? <div className="space-y-2"><Label htmlFor="erasure-scope">What should we look at?</Label><Select id="erasure-scope" value={erasureScope} onChange={(event) => setErasureScope(event.target.value)}><option>All data that is no longer needed</option><option>Data used for a specific purpose</option><option>A specific type of data</option></Select><Label htmlFor="erasure-note">Tell us more (optional)</Label><Textarea id="erasure-note" value={message} onChange={(event) => setMessage(event.target.value)} /></div> : null}
            {type === "GRIEVANCE" ? <div className="space-y-2"><Label htmlFor="grievance">Tell us what happened</Label><Textarea id="grievance" value={message} onChange={(event) => setMessage(event.target.value)} required /></div> : null}
            <div className="flex gap-2"><Button variant="outline" onClick={() => setStep("type")}>Back</Button><Button disabled={!detailsValid()} onClick={() => setStep("confirm")}>Continue</Button></div>
          </div> : null}

          {step === "confirm" ? <div className="space-y-4">
            <h3 className="font-medium">Check your request</h3>
            <dl className="space-y-2 rounded-md bg-muted p-4 text-sm"><div><dt className="font-medium">Request</dt><dd>{selectedType.label}</dd></div>{type === "CORRECTION" ? <div><dt className="font-medium">Change</dt><dd>{field}: {currentValue} → {newValue}</dd></div> : null}{type === "ERASURE" ? <div><dt className="font-medium">Scope</dt><dd>{erasureScope}</dd></div> : null}{message ? <div><dt className="font-medium">Your note</dt><dd className="whitespace-pre-wrap">{message}</dd></div> : null}</dl>
            {createRequest.isError ? <p role="alert" className="text-sm text-destructive">We could not send your request. Please try again.</p> : null}
            <div className="flex gap-2"><Button variant="outline" onClick={() => setStep("details")}>Back</Button><Button disabled={createRequest.isPending} onClick={() => createRequest.mutate()}>Send request</Button></div>
          </div> : null}

          {step === "reference" ? <div className="space-y-3" role="status"><h3 className="font-medium">Your request was sent</h3><p>Keep this reference: <strong>{reference}</strong></p>{reference ? <Link className="text-primary underline underline-offset-4" to={`/me/requests/${reference}`}>View your request</Link> : null}<div><Button variant="outline" onClick={() => { setStep("type"); setMessage(""); setField(""); setCurrentValue(""); setNewValue(""); setReference(null); }}>Make another request</Button></div></div> : null}
        </CardContent>
      </Card>

      <section aria-labelledby="previous-requests" className="space-y-4">
        <h2 id="previous-requests" className="text-xl font-semibold">Your previous requests</h2>
        {isLoading ? <><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></> : !requests?.length ? <EmptyState title="No requests yet" description="When you make a request, you will see it here." action={{ label: "Make a request", onClick: () => setStep("type") }} /> : <div className="space-y-3">
          {requests.map((request) => <Link key={request.reference} to={`/me/requests/${request.reference}`} className="block"><Card className="transition-colors hover:bg-accent/50"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{labelForType(request.type)}</p><p className="text-sm text-muted-foreground">{request.reference} · sent <DateTime value={request.submittedAt} /></p></div><Badge variant="outline">{request.status.replaceAll("_", " ")}</Badge></CardContent></Card></Link>)}
        </div>}
      </section>
    </div>
  );
}
