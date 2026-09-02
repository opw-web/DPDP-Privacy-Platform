import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { employeeApiClient } from "../../lib/api-client";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PermissionGate } from "../../components/shared/PermissionGate";
import { InformationRequestForm } from "../components/information-requests/InformationRequestForm";

interface Request {
  id: string;
  reference: string;
  requestingBody: string;
  authorisedPersonRef: string;
  purposeCited: string;
  receivedAt: string;
  responseDueAt: string;
  nonDisclosureDirected: boolean;
  nonDisclosurePermissionRef: string | null;
}

/**
 * `/app/information-requests` (spec line 886, BD-01...BD-04). Previously a
 * read-only list -- Step 32 adds the create control: a toggled inline panel
 * (same house pattern as `ChildrenPage.tsx`'s `GuardianForm`/
 * `ExemptionClaimForm`) around `InformationRequestForm`, gated behind the
 * same `CAN_CHANGE_COMPLIANCE_CONFIG` permission the `POST` route itself
 * requires (`InformationRequestsController`). The existing non-disclosure
 * warning banner below is unchanged -- a record created through this form
 * flows through the same `GET /information-requests` query and renders
 * identically to one seeded any other way.
 */
export function InformationRequestsPage() {
  const [showForm, setShowForm] = useState(false);
  const q = useQuery({
    queryKey: ["information-requests"],
    queryFn: () => employeeApiClient.get<Request[]>("/information-requests"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Board and Government requests</h1>
          <p className="text-sm text-muted-foreground">
            Record the Seventh Schedule authorised person and authority.
          </p>
        </div>
        <PermissionGate permission="CAN_CHANGE_COMPLIANCE_CONFIG">
          <Button onClick={() => setShowForm((current) => !current)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Record request
          </Button>
        </PermissionGate>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>New information request</CardTitle>
          </CardHeader>
          <CardContent>
            <InformationRequestForm onDone={() => setShowForm(false)} />
          </CardContent>
        </Card>
      ) : null}

      {(q.data ?? []).map((r) => (
        <Card key={r.id}>
          <CardHeader>
            <div className="flex justify-between">
              <CardTitle>{r.reference}</CardTitle>
              <Badge>{r.requestingBody}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Authorised person: {r.authorisedPersonRef}</p>
            <p>Purpose/citation: {r.purposeCited}</p>
            <p>Response due: {new Date(r.responseDueAt).toLocaleDateString()}</p>
            {r.nonDisclosureDirected ? (
              <div
                role="alert"
                className="border-2 border-destructive bg-destructive/10 p-3 font-semibold text-destructive"
              >
                Non-disclosure direction active (authorisation {r.nonDisclosurePermissionRef}).
                Information must not appear in the Data Principal’s portal, report, or evidence
                pack; suppression is recorded internally.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
