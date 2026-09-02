import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../../lib/api-client";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { CheckboxOption } from "../../../components/ui/checkbox";
import { DeadlinePill } from "../../../components/shared/DeadlinePill";

/** Mirrors `SDF_ASSESSMENT_PUBLIC_SELECT` (`backend/src/modules/sdf/sdf-assessment.service.ts`) -- `GET /sdf/assessments`'s per-row shape, in full: the completion fields (`conductedBy`, `significantObservations`, `reportReference`, `furnishedToBoardAt`, `furnishedReference`) are already returned today, just not previously read by this page. */
export interface AssessmentRowData {
  id: string;
  kind: string;
  cycleStartedAt: string;
  dueAt: string;
  completedAt: string | null;
  conductedBy: string;
  isIndependent: boolean;
  significantObservations: string | null;
  reportReference: string | null;
  furnishedToBoardAt: string | null;
  furnishedReference: string | null;
}

interface CompleteFormValues {
  significantObservations: string;
  furnishedToBoardAt: string;
  reportReference: string;
  furnishedReference: string;
  conductedBy: string;
  isIndependent: boolean;
}

/** ISO instant -> the local `yyyy-MM-ddTHH:mm` value a `datetime-local` input needs. */
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Pre-fills the completion form from the row's OWN current state -- per
 * `SdfAssessmentService.complete`, the server validates the EFFECTIVE
 * state (existing row merged with the submitted patch), so a row that
 * already carries e.g. `conductedBy` from an earlier partial save must
 * not force the operator to retype it.
 */
function toFormValues(assessment: AssessmentRowData): CompleteFormValues {
  return {
    significantObservations: assessment.significantObservations ?? "",
    furnishedToBoardAt: assessment.furnishedToBoardAt ? toDatetimeLocalValue(assessment.furnishedToBoardAt) : "",
    reportReference: assessment.reportReference ?? "",
    furnishedReference: assessment.furnishedReference ?? "",
    conductedBy: assessment.conductedBy,
    isIndependent: assessment.isIndependent,
  };
}

/**
 * Sends only what the operator actually filled in -- a field left blank
 * is OMITTED, not sent as an explicit empty string, so
 * `SdfAssessmentService.complete`'s merge (`dto.field ?? existing.field` /
 * `dto.field !== undefined ? dto.field : existing.field`) leaves the
 * row's existing value alone instead of blanking it. `conductedBy` and
 * `isIndependent` are included only for an AUDIT row (SD-02); a DPIA row
 * carries neither.
 */
function toCompletePayload(values: CompleteFormValues, kind: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (values.significantObservations.trim()) payload.significantObservations = values.significantObservations.trim();
  if (values.furnishedToBoardAt) payload.furnishedToBoardAt = new Date(values.furnishedToBoardAt).toISOString();
  if (values.reportReference.trim()) payload.reportReference = values.reportReference.trim();
  if (values.furnishedReference.trim()) payload.furnishedReference = values.furnishedReference.trim();
  if (kind === "AUDIT") {
    if (values.conductedBy.trim()) payload.conductedBy = values.conductedBy.trim();
    payload.isIndependent = values.isIndependent;
  }
  return payload;
}

function describeCompleteError(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  return "Could not complete this assessment.";
}

/**
 * One assessment cycle row, plus its completion form. The form never
 * blocks its own submission client-side on SD-02/SD-04 -- `CompleteSdfAssessmentDto`
 * is deliberately all-optional precisely so the refusal comes back from
 * `SdfAssessmentService.complete` as a CITED domain error (Rule 13(1)),
 * not a bare 400 from a client-side (or Nest `ValidationPipe`)
 * conditional gate; reimplementing "isIndependent required IF kind is
 * AUDIT" as a blocking gate here would be the exact bug class that DTO's
 * own doc comment warns this project already shipped once (Task 6). The
 * hint text under each field is guidance only; the citation the server
 * sends back on a real rejection is shown verbatim via `toast.error`,
 * never replaced with a generic message.
 */
export function AssessmentRow({
  assessment,
  canCompleteAudit,
}: {
  assessment: AssessmentRowData;
  canCompleteAudit: (assessment: Pick<AssessmentRowData, "kind" | "isIndependent">) => boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<CompleteFormValues>(() => toFormValues(assessment));

  const complete = useMutation({
    mutationFn: () => employeeApiClient.post(`/sdf/assessments/${assessment.id}/complete`, toCompletePayload(values, assessment.kind)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sdf"] });
      toast.success("Assessment marked complete.");
      setOpen(false);
    },
    onError: (error) => toast.error(describeCompleteError(error)),
  });

  const independenceNotYetRecorded = !canCompleteAudit(assessment);

  return (
    <div className="rounded border p-3" data-testid={`sdf-assessment-${assessment.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{assessment.kind}</span>
        <div className="flex items-center gap-2">
          <Badge>{assessment.completedAt ? "Complete" : "Open"}</Badge>
          {!assessment.completedAt ? <DeadlinePill dueAt={assessment.dueAt} windowStart={assessment.cycleStartedAt} /> : null}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Due {new Date(assessment.dueAt).toLocaleDateString()}</p>
      {independenceNotYetRecorded ? (
        <p className="text-sm text-destructive">Independent auditor required before completion.</p>
      ) : null}

      {!assessment.completedAt ? (
        <>
          <Button
            className="mt-2"
            size="sm"
            variant={open ? "outline" : "default"}
            disabled={complete.isPending}
            onClick={() => {
              setValues(toFormValues(assessment));
              setOpen((current) => !current);
            }}
          >
            {open ? "Cancel" : "Complete assessment"}
          </Button>

          {open ? (
            <form
              className="mt-3 space-y-3 border-t pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                complete.mutate();
              }}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor={`sdf-obs-${assessment.id}`}>Significant observations</Label>
                <Textarea
                  id={`sdf-obs-${assessment.id}`}
                  value={values.significantObservations}
                  onChange={(event) => setValues({ ...values, significantObservations: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">Required to close this cycle row (SD-04).</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`sdf-furnished-at-${assessment.id}`}>Furnished to Board on</Label>
                  <Input
                    id={`sdf-furnished-at-${assessment.id}`}
                    type="datetime-local"
                    value={values.furnishedToBoardAt}
                    onChange={(event) => setValues({ ...values, furnishedToBoardAt: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Required to close this cycle row (SD-04).</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`sdf-report-ref-${assessment.id}`}>Report reference</Label>
                  <Input
                    id={`sdf-report-ref-${assessment.id}`}
                    value={values.reportReference}
                    onChange={(event) => setValues({ ...values, reportReference: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`sdf-furnished-ref-${assessment.id}`}>Furnished reference</Label>
                <Input
                  id={`sdf-furnished-ref-${assessment.id}`}
                  value={values.furnishedReference}
                  onChange={(event) => setValues({ ...values, furnishedReference: event.target.value })}
                />
              </div>

              {assessment.kind === "AUDIT" ? (
                <div className="rounded-md border p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`sdf-conducted-by-${assessment.id}`}>Independent auditor</Label>
                      <Input
                        id={`sdf-conducted-by-${assessment.id}`}
                        value={values.conductedBy}
                        onChange={(event) => setValues({ ...values, conductedBy: event.target.value })}
                      />
                    </div>
                    <div className="flex items-end pb-1.5">
                      <CheckboxOption
                        id={`sdf-is-independent-${assessment.id}`}
                        label="The auditor is independent"
                        checked={values.isIndependent}
                        onChange={(event) => setValues({ ...values, isIndependent: event.target.checked })}
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Required to close an AUDIT row (SD-02).</p>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={complete.isPending}>
                  {complete.isPending ? "Completing…" : "Complete assessment"}
                </Button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
