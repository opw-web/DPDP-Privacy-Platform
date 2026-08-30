import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError, employeeApiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { NotReviewedChip } from "../NotReviewedChip";
import {
  cachePurposesResult,
  employeePut,
  type AttachedPurpose,
  type MappingWarning,
  type ReplacePurposesResult,
} from "../../lib/data-sources-api";

interface Step4PurposesProps {
  dataSourceId: string;
  initialPurposeIds?: string[];
  onSaved: (result: ReplacePurposesResult) => void;
}

/**
 * Step ④: attach the processing purposes this source's data will be used
 * for. Selection starts from `initialPurposeIds` (defaulting to an EMPTY
 * set, never the first purpose in the list) -- spec line 746: a source
 * with no purpose attached is legal, and this state is shown explained,
 * never silently defaulted into or out of.
 */
export function Step4Purposes({ dataSourceId, initialPurposeIds, onSaved }: Step4PurposesProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialPurposeIds ?? []));
  const [warnings, setWarnings] = useState<MappingWarning[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: purposes, isLoading } = useQuery({
    queryKey: ["purposes"],
    queryFn: () => employeeApiClient.get<AttachedPurpose[]>("/purposes"),
  });

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await employeePut<ReplacePurposesResult>(
        `/data-sources/${dataSourceId}/purposes`,
        { purposeIds: Array.from(selected) },
      );
      setWarnings(result.warnings);
      cachePurposesResult(queryClient, dataSourceId, result);
      toast.success(
        result.purposes.length > 0
          ? `${result.purposes.length} purpose(s) attached.`
          : "Saved with no purpose attached.",
      );
      onSaved(result);
    } catch (error) {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not save the attached purposes. Please try again.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading purposes...</p>;
  }

  if (!purposes || purposes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">No processing purposes exist yet</p>
        <p className="text-sm text-muted-foreground">
          A purpose must be created in the purpose register before it can be attached to a data
          source. It is never inferred from the source's name or contents.
        </p>
        <Button size="sm" asChild>
          <Link to="/app/purposes">Go to Purposes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select every purpose this source's data is collected for. A field mapped to a data
        category not covered by any purpose attached here will carry a data-minimisation warning
        (CN-02) -- it warns, it does not block.
      </p>

      {selected.size === 0 ? (
        <div
          className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm"
          role="note"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            No purpose is attached to this source. This is a legal, deliberate choice -- it is
            never defaulted to the first purpose in the list -- but every personal-data field this
            source maps will show "Purpose not configured" until a human attaches one.
          </span>
        </div>
      ) : null}

      <ul className="space-y-2">
        {purposes.map((purpose) => (
          <li
            key={purpose.id}
            className="flex items-start gap-3 rounded-md border border-border p-3"
          >
            <input
              id={`purpose-${purpose.id}`}
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-input"
              checked={selected.has(purpose.id)}
              onChange={() => toggle(purpose.id)}
            />
            <label htmlFor={`purpose-${purpose.id}`} className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{purpose.name}</span>
                <NotReviewedChip isReviewed={purpose.isReviewed} />
              </div>
              <p className="text-xs text-muted-foreground">{purpose.code}</p>
              <p className="text-xs text-muted-foreground">{purpose.description}</p>
            </label>
          </li>
        ))}
      </ul>

      {warnings.length > 0 ? (
        <div className="space-y-2">
          {warnings.map((warning) => (
            <div
              key={`${warning.sourceField}-${warning.type}`}
              className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/10 p-2 text-xs text-amber-foreground"
              role="note"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{warning.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save purposes"}
        </Button>
      </div>
    </div>
  );
}
