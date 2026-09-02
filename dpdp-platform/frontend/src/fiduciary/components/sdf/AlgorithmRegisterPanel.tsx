import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../../lib/api-client";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card";
import { RuleBasisChip } from "../../../components/shared/RuleBasisChip";
import { EmptyState } from "../../../components/shared/EmptyState";
import {
  AlgorithmFormFields,
  EMPTY_ALGORITHM_FORM,
  toAlgorithmFormValues,
  type AlgorithmFormValues,
} from "./AlgorithmFormFields";
import type { AlgorithmEntry, ComplianceRuleSummary } from "./types";

const ALGORITHMS_QUERY_KEY = ["sdf-algorithms"];

function describeError(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  return "Could not save this algorithm register entry.";
}

function toCreatePayload(values: AlgorithmFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    operations: values.operations,
    riskAssessment: values.riskAssessment.trim() || undefined,
    riskToRightsIdentified: values.riskToRightsIdentified,
    mitigations: values.mitigations.trim() || undefined,
    lastReviewedAt: values.lastReviewedAt ? new Date(values.lastReviewedAt).toISOString() : undefined,
    reviewedByEmployeeId: values.reviewedByEmployeeId.trim() || undefined,
  };
}

function AlgorithmEntryRow({
  entry,
  needsReview,
  cycleRule,
}: {
  entry: AlgorithmEntry;
  needsReview: boolean;
  cycleRule?: ComplianceRuleSummary;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<AlgorithmFormValues>(() => toAlgorithmFormValues(entry));

  const update = useMutation({
    mutationFn: () => employeeApiClient.patch(`/sdf/algorithms/${entry.id}`, toCreatePayload(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ALGORITHMS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["sdf-gaps"] });
      toast.success("Algorithm register entry updated.");
      setEditing(false);
    },
    onError: (error) => toast.error(describeError(error)),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{entry.name}</p>
            <p className="text-sm text-muted-foreground">{entry.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {needsReview ? (
              <span title={cycleRule?.legalSource ?? undefined}>
                <Badge variant="amber">Needs Rule 13(3) review</Badge>
              </span>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => { setValues(toAlgorithmFormValues(entry)); setEditing((current) => !current); }}>
              {editing ? "Cancel" : "Edit"}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {entry.operations.map((operation) => (
            <Badge key={operation} variant="outline">{operation}</Badge>
          ))}
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Last reviewed</dt>
            <dd>{entry.lastReviewedAt ? new Date(entry.lastReviewedAt).toLocaleDateString() : "Never"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reviewed by</dt>
            <dd>{entry.reviewedByEmployeeId ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Risk to rights identified</dt>
            <dd>{entry.riskToRightsIdentified ? "Yes" : "No"}</dd>
          </div>
        </dl>
        {entry.mitigations ? <p className="text-sm"><span className="text-muted-foreground">Mitigations: </span>{entry.mitigations}</p> : null}

        {editing ? (
          <form
            className="space-y-4 border-t pt-4"
            onSubmit={(event) => { event.preventDefault(); update.mutate(); }}
            noValidate
          >
            <AlgorithmFormFields idPrefix={`edit-${entry.id}`} values={values} onChange={setValues} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save changes"}</Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * SD-05 (Rule 13(3)) -- the algorithmic-systems register: every recorded
 * entry, its Rule 13(3) operations, its periodic risk review, and a way
 * to add or edit one. `unreviewedIds` (from `GET /sdf/gaps`, the same
 * backend computation `SdfGapsService.getGaps` uses) flags an entry as
 * due for review WITHOUT this component re-deriving the cycle length
 * itself -- the deadline/cycle logic lives in exactly one place, the
 * backend rule engine, never duplicated here (Global Constraint 4).
 */
export function AlgorithmRegisterPanel({
  unreviewedIds,
  cycleRule,
}: {
  unreviewedIds: Set<string>;
  cycleRule?: ComplianceRuleSummary;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ALGORITHMS_QUERY_KEY,
    queryFn: () => employeeApiClient.get<AlgorithmEntry[]>("/sdf/algorithms"),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [createValues, setCreateValues] = useState<AlgorithmFormValues>(EMPTY_ALGORITHM_FORM);

  const create = useMutation({
    mutationFn: () => employeeApiClient.post("/sdf/algorithms", toCreatePayload(createValues)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ALGORITHMS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["sdf-gaps"] });
      toast.success("Algorithm added to the register.");
      setCreateValues(EMPTY_ALGORITHM_FORM);
      setShowCreate(false);
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const entries = query.data ?? [];

  return (
    <Card data-testid="algorithm-register-panel">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Algorithm register</CardTitle>
            <CardDescription>Algorithmic systems that host, process or otherwise operate on personal data.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {cycleRule ? <RuleBasisChip basis={cycleRule.basis} citation={cycleRule.legalSource} /> : null}
            <Button size="sm" onClick={() => setShowCreate((current) => !current)}>
              {showCreate ? "Cancel" : "Add algorithm"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showCreate ? (
          <form
            className="space-y-4 rounded-md border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!createValues.name.trim() || !createValues.description.trim() || createValues.operations.length === 0) {
                toast.error("Name, description and at least one operation are required.");
                return;
              }
              create.mutate();
            }}
            noValidate
          >
            <AlgorithmFormFields idPrefix="create" values={createValues} onChange={setCreateValues} />
            <div className="flex justify-end">
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add algorithm"}</Button>
            </div>
          </form>
        ) : null}

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading algorithm register…</p>
        ) : entries.length === 0 && !showCreate ? (
          <EmptyState
            title="No algorithms recorded yet"
            description="Record every algorithmic system that hosts, displays, uploads, modifies, publishes, transmits, stores, updates or shares personal data (Rule 13(3))."
            action={{ label: "Add the first algorithm", onClick: () => setShowCreate(true) }}
          />
        ) : entries.length > 0 ? (
          <div className="space-y-3">
            {entries.map((entry) => (
              <AlgorithmEntryRow key={entry.id} entry={entry} needsReview={unreviewedIds.has(entry.id)} cycleRule={cycleRule} />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
